/**
 * Jules API Client for Hypenosys Hub
 * Refactorizado para mayor robustez, paginación automática y gestión centralizada de errores.
 */

const JULES_BASE = 'https://jules.googleapis.com/v1alpha';

/**
 * Función central para llamadas a la API de Jules con manejo completo de errores.
 * @param {string} method - Método HTTP (GET, POST, DELETE, etc.)
 * @param {string} endpoint - Endpoint de la API (ej: '/sources')
 * @param {Object|null} body - Cuerpo de la petición (opcional)
 * @param {string|null} customKey - API Key personalizada para validación (opcional)
 * @returns {Promise<Object>} - Datos de respuesta de la API
 */
async function julesApiCall(method, endpoint, body = null, customKey = null) {
    const key = customKey || localStorage.getItem('jules_api_key');
    if (!key) throw new Error('API_KEY_MISSING');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const res = await fetch(`${JULES_BASE}${endpoint}`, {
            method,
            headers: {
                'x-goog-api-key': key,
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            body: body ? JSON.stringify(body) : null,
            signal: controller.signal
        });
        clearTimeout(timeout);

        // 204 No Content o respuesta vacía con status 200
        if (res.status === 204 || (res.status === 200 && res.headers.get('content-length') === '0')) {
            return {};
        }

        const data = await res.json();

        if (res.status === 401 || res.status === 403) {
            throw new Error('API_KEY_INVALID');
        }
        if (res.status === 429) {
            throw new Error('RATE_LIMIT');
        }
        if (!res.ok) {
            throw new Error(data?.error?.message || `HTTP ${res.status}`);
        }

        return data;
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') throw new Error('TIMEOUT');
        throw err;
    }
}

/**
 * Carga TODAS las fuentes disponibles mediante paginación automática.
 * @returns {Promise<Array>} - Lista completa de fuentes
 */
async function loadAllSources() {
    let all = [], token = null;
    do {
        const url = `/sources${token ? `?pageToken=${token}` : ''}`;
        const data = await julesApiCall('GET', url);
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
        return localStorage.getItem('jules_api_key');
    }

    // Proxy a la función central para mantener compatibilidad si es necesario
    async call(method, endpoint, body) {
        return await julesApiCall(method, endpoint, body);
    }

    // Sources
    async getSources() {
        return await loadAllSources();
    }

    // Sessions
    async getSessions(pageSize = 30, pageToken = null) {
        const url = `/sessions?pageSize=${pageSize}${pageToken ? `&pageToken=${pageToken}` : ''}`;
        return await julesApiCall('GET', url);
    }

    async createSession(data) {
        return await julesApiCall('POST', '/sessions', data);
    }

    async getSession(sessionId) {
        const path = sessionId.startsWith('/') ? sessionId : `/${sessionId}`;
        return await julesApiCall('GET', path);
    }

    async deleteSession(sessionId) {
        const path = sessionId.startsWith('/') ? sessionId : `/${sessionId}`;
        return await julesApiCall('DELETE', path);
    }

    async approvePlan(sessionId) {
        const path = sessionId.startsWith('/') ? sessionId : `/${sessionId}`;
        return await julesApiCall('POST', `${path}:approvePlan`);
    }

    async sendMessage(sessionId, message) {
        const path = sessionId.startsWith('/') ? sessionId : `/${sessionId}`;
        return await julesApiCall('POST', `${path}:sendMessage`, { prompt: message });
    }

    async getActivities(sessionId, pageSize = 30, pageToken = null) {
        const path = sessionId.startsWith('/') ? sessionId : `/${sessionId}`;
        const url = `${path}/activities?pageSize=${pageSize}${pageToken ? `&pageToken=${pageToken}` : ''}`;
        return await julesApiCall('GET', url);
    }
}

// Exponer globalmente
window.julesApi = new JulesAPI();
window.julesApiCall = julesApiCall;
window.loadAllSources = loadAllSources;
