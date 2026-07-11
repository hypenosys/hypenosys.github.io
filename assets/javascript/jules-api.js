/**
 * Jules API Client for Hypenosys Hub
 * Refactorizado para mayor robustez, paginación automática y gestión centralizada de errores.
 */

const JULES_BASE = 'https://jules.googleapis.com/v1alpha';

function isJulesApiKeyValid(key) {
    if (!key || typeof key !== 'string') return false;
    return key.trim().length > 0;
}

function getJulesApiKey() {
    return localStorage.getItem('jules_api_key') || '';
}

function saveJulesApiKey(key) {
    if (typeof key === 'string') {
        const trimmed = key.trim();
        if (trimmed) {
            localStorage.setItem('jules_api_key', trimmed);
            // Sincronizar clientes u otros componentes
            const event = new CustomEvent('julesApiKeySaved');
            document.dispatchEvent(event);
            return;
        }
    }
    removeJulesApiKey();
}

function removeJulesApiKey() {
    localStorage.removeItem('jules_api_key');
    const event = new CustomEvent('julesApiKeyRemoved');
    document.dispatchEvent(event);
}

function hasJulesApiKey() {
    return isJulesApiKeyValid(getJulesApiKey());
}

// Expose globally
window.isJulesApiKeyValid = isJulesApiKeyValid;
window.getJulesApiKey = getJulesApiKey;
window.saveJulesApiKey = saveJulesApiKey;
window.removeJulesApiKey = removeJulesApiKey;
window.hasJulesApiKey = hasJulesApiKey;

/**
 * Función central para llamadas a la API de Jules con manejo completo de errores.
 * @param {string} method - Método HTTP (GET, POST, DELETE, etc.)
 * @param {string} endpoint - Endpoint de la API (ej: '/sources')
 * @param {Object|null} body - Cuerpo de la petición (opcional)
 * @param {string|null} customKey - API Key personalizada para validación (opcional)
 * @param {Object} options - Opciones de la petición, ej: { signal } (opcional)
 * @returns {Promise<Object>} - Datos de respuesta de la API
 */
async function julesApiCall(method, endpoint, body = null, customKey = null, options = {}) {
    const key = customKey || getJulesApiKey();
    if (!isJulesApiKeyValid(key)) throw new Error('API_KEY_MISSING');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // Link explicitly passed AbortSignal if present
    if (options && options.signal && typeof options.signal.addEventListener === 'function') {
        const onAbort = () => {
            try { controller.abort(); } catch(e) {}
        };
        options.signal.addEventListener('abort', onAbort);
        if (options.signal.aborted) {
            controller.abort();
        }
    }

    try {
        const res = await fetch(JULES_BASE + endpoint, {
            method,
            headers: {
                'x-goog-api-key': key,
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            body: body ? JSON.stringify(body) : null,
            signal: controller.signal
        });
        clearTimeout(timeout);

        // Read response body safely as text first to avoid assuming JSON
        const rawText = await res.text();
        let data = {};
        if (rawText.trim()) {
            try {
                data = JSON.parse(rawText);
            } catch (jsonErr) {
                console.warn("[JULES-API] Failed to parse JSON response:", jsonErr.message);
                data = { error: { message: rawText.substring(0, 500) } };
            }
        }

        // Differentiate status codes robustly
        if (res.status === 401 || res.status === 403) {
            throw new Error('API_KEY_INVALID');
        }
        if (res.status === 429) {
            const retryAfter = res.headers.get('Retry-After');
            let retryAfterMs = 5000; // default 5s
            if (retryAfter) {
                if (/^\d+$/.test(retryAfter)) {
                    retryAfterMs = parseInt(retryAfter, 10) * 1000;
                } else {
                    const parsedDate = Date.parse(retryAfter);
                    if (!isNaN(parsedDate)) {
                        retryAfterMs = Math.max(0, parsedDate - Date.now());
                    }
                }
            }
            // Limit to reasonable boundaries (min 1s, max 5 minutes)
            retryAfterMs = Math.min(300000, Math.max(1000, retryAfterMs));
            const error = new Error('RATE_LIMIT');
            error.retryAfterMs = retryAfterMs;
            throw error;
        }
        if (!res.ok) {
            const errMsg = (data && data.error && data.error.message) || ("HTTP " + res.status);
            const error = new Error(errMsg);
            error.fullDetails = (data && data.error) || data;
            error.httpStatus = res.status;
            throw error;
        }

        // Handle empty or No Content responses
        if (res.status === 204 || !rawText.trim()) {
            return {};
        }

        return data;
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
            if (options && options.signal && options.signal.aborted) {
                const abortError = new Error('REQUEST_ABORTED');
                abortError.name = 'AbortError';
                throw abortError;
            }
            throw new Error('TIMEOUT');
        }
        throw err;
    }
}

/**
 * Carga TODAS las fuentes disponibles mediante paginación automática.
 * @returns {Promise<Array>} - Lista completa de fuentes
 */
async function loadAllSources(options = {}) {
    let all = [], token = null;
    do {
        const url = "/sources?pageSize=100" + (token ? ("&pageToken=" + token) : "");
        const data = await julesApiCall('GET', url, null, null, options);
        all = all.concat(data.sources || []);
        token = data.nextPageToken || null;
    } while (token);
    return all;
}

class JulesAPI {
    constructor() {
        this.baseUrl = JULES_BASE;
    }

    get apiKey() {
        return getJulesApiKey();
    }

    // Proxy a la función central para mantener compatibilidad si es necesario
    async call(method, endpoint, body, customKey = null, options = {}) {
        return await julesApiCall(method, endpoint, body, customKey, options);
    }

    // Sources
    async getSources(options = {}) {
        return await loadAllSources(options);
    }

    // Sessions
    async getSessions(pageSize = 30, pageToken = null, options = {}) {
        const url = "/sessions?pageSize=" + pageSize + (pageToken ? ("&pageToken=" + pageToken) : "");
        return await julesApiCall('GET', url, null, null, options);
    }

    /**
     * Alias for getSessions that returns only the sessions array.
     * Expected by jules-panel-sessions.js
     */
    async listSessions(pageSize = 100, options = {}) {
        const data = await this.getSessions(pageSize, null, options);
        return data.sessions || [];
    }

    async createSession(data) {
        const res = await julesApiCall('POST', '/sessions', data);
        if (res && res.name && window.JulesActivitiesModule) {
            const sid = res.name.split('/').pop();
            window.JulesActivitiesModule.startPolling(sid);
        }
        return res;
    }

    async getSession(sessionId) {
        var path = sessionId.startsWith('/') ? sessionId : ("/" + sessionId);
        return await julesApiCall('GET', path);
    }

    async deleteSession(sessionId) {
        var path = sessionId.startsWith('/') ? sessionId : ("/" + sessionId);
        return await julesApiCall('DELETE', path);
    }

    async approvePlan(sessionId) {
        var path = sessionId.startsWith('/') ? sessionId : ("/" + sessionId);
        return await julesApiCall('POST', path + ":approvePlan");
    }

    async sendMessage(sessionId, message) {
        var path = sessionId.startsWith('/') ? sessionId : ("/" + sessionId);
        return await julesApiCall('POST', path + ":sendMessage", { prompt: message });
    }

    async getActivities(sessionId, pageSize = 30, pageToken = null) {
        var path = sessionId.startsWith('/') ? sessionId : ("/" + sessionId);
        var url = path + "/activities?pageSize=" + pageSize + (pageToken ? ("&pageToken=" + pageToken) : "");
        return await julesApiCall('GET', url);
    }
}

// Exponer globalmente
window.julesApi = new JulesAPI();
window.julesApiCall = julesApiCall;
window.loadAllSources = loadAllSources;

/**
 * Parsea "sources/github/hypenosys/hypenosys.github.io" → {owner:"hypenosys", repo:"hypenosys.github.io"}
 * @param {string} sourceName
 * @returns {Object|null}
 */
function parseSourceName(sourceName) {
  if (!sourceName) return null;
  // Formato 1 (Nuevo): sources/github-{owner}-{repo}
  if (sourceName.startsWith('sources/github-')) {
      const parts = sourceName.replace('sources/github-', '').split('-');
      return { owner: parts[0], repo: parts.slice(1).join('-') };
  }
  // Formato 2 (Viejo): sources/github/{owner}/{repo}
  const parts = sourceName.split('/');
  if (parts.length >= 4 && parts[1] === 'github') {
    return { owner: parts[2], repo: parts.slice(3).join('/') };
  }
  // Formato 3 (Directo): owner/repo
  if (parts.length === 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  // Formato 4 (Solo repo): repo (asumirá owner por defecto en el consumidor)
  if (parts.length === 1 && sourceName.trim() !== '') {
    return { owner: undefined, repo: sourceName.trim() };
  }
  return null;
}

/**
 * Carga de ramas con múltiples estrategias
 * @param {string} sourceName
 * @param {Object} sourceObject
 * @returns {Promise<Array>}
 */
async function loadBranchesForRepo(sourceName, sourceObject) {
  let owner, repo;

  if (sourceObject && sourceObject.githubRepo) {
    owner = sourceObject.githubRepo.owner;
    repo  = sourceObject.githubRepo.repo;
  } else {
    const parsed = parseSourceName(sourceName);
    if (!parsed) return [];
    owner = parsed.owner;
    repo  = parsed.repo;
  }

  // Estrategia 1: GitHub API pública (repos públicos, sin auth)
  try {
    const res = await fetch(
      "https://api.github.com/repos/" + owner + "/" + repo + "/branches?per_page=100",
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );
    if (res.ok) {
      const data = await res.json();
      return data.map(b => b.name);
    }
  } catch (e) {
    console.warn('[Jules Panel] GitHub API pública falló:', e.message);
  }

  // Estrategia 2: Intentar inferir ramas comunes de la sesión más reciente del mismo repo
  try {
    const sessions = await julesApiCall('GET', '/sessions?pageSize=50');
    const matchingSessions = (sessions.sessions || []).filter(s =>
      s.sourceContext && s.sourceContext.source === sourceName
    );
    const branches = [...new Set(
      matchingSessions
        .map(function(s) { return s.sourceContext && s.sourceContext.githubRepoContext && s.sourceContext.githubRepoContext.startingBranch; })
        .filter(Boolean)
    )];
    if (branches.length > 0) return branches;
  } catch(e) {
    console.warn('[Jules Panel] Estrategia sesiones falló:', e.message);
  }

  // Estrategia 3: fallback con ramas estándar
  return ['main', 'master', 'develop', 'feat', 'staging', 'production'];
}

window.parseSourceName = parseSourceName;
window.loadBranchesForRepo = loadBranchesForRepo;
