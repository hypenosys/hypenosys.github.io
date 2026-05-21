// ============================================================
// HYPENOSYS GITHUB CONTENT API — ATOMIC TRANSACTION ENGINE
// Race-condition-safe write layer for _data/*.json files
// ============================================================

const GITHUB_API_BASE = 'https://api.github.com';
const REPO_OWNER      = 'hypenosys';
const REPO_NAME       = 'hypenosys.github.io';
const DATA_BRANCH     = 'master';

// Retrieve GitHub OAuth token from sessionStorage (as per strict requirement)
function getAuthToken() {
  const token = sessionStorage.getItem('gh_access_token');
  if (!token) throw new Error('No hay sesión activa de GitHub. Por favor, inicia sesión.');
  return token;
}

// ─── CORE READ ────────────────────────────────────────────────
// Returns { content: parsedObject, sha: string }
async function fetchFileWithSha(filePath) {
  const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${DATA_BRANCH}&t=${Date.now()}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Accept': 'application/vnd.github.v3+json',
      'Cache-Control': 'no-cache'
    }
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Error leyendo ${filePath}: ${err.message}`);
  }
  const data     = await response.json();
  const content  = JSON.parse(atob(data.content.replace(/\n/g, '')));
  return { content, sha: data.sha };
}

// ─── CORE WRITE ───────────────────────────────────────────────
async function putFileContent(filePath, sha, newContent, commitMessage) {
  const url  = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
  const body = JSON.stringify({
    message: commitMessage,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(newContent, null, 2)))),
    sha:     sha,
    branch:  DATA_BRANCH
  });
  const response = await fetch(url, {
    method:  'PUT',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Accept':        'application/vnd.github.v3+json',
      'Content-Type':  'application/json'
    },
    body
  });
  return { ok: response.ok, status: response.status, data: await response.json() };
}

// ─── MERGE STRATEGIES ─────────────────────────────────────────
function mergeTaskArrays(localTasks, remoteTasks) {
  const remoteMap = new Map(remoteTasks.map(t => [t.id, t]));
  const localMap  = new Map(localTasks.map(t => [t.id, t]));
  const merged    = [];

  for (const [id, remoteTask] of remoteMap) {
    const localTask = localMap.get(id);
    if (!localTask) {
      merged.push(remoteTask);
    } else {
      const remoteTime = new Date(remoteTask.fecha || 0).getTime();
      const localTime  = new Date(localTask.fecha || 0).getTime();
      merged.push(localTime > remoteTime ? localTask : remoteTask);
    }
  }

  for (const [id, localTask] of localMap) {
    if (!remoteMap.has(id)) {
      merged.push(localTask);
    }
  }

  return merged.sort((a, b) => a.id - b.id);
}

function mergeBudgetObjects(localBudget, remoteBudget) {
  const merged = { ...remoteBudget };
  const maxLen = Math.max(
    (localBudget.monthly_records || []).length,
    (remoteBudget.monthly_records || []).length
  );
  merged.monthly_records = [];
  for (let i = 0; i < maxLen; i++) {
    const local  = (localBudget.monthly_records || [])[i];
    const remote = (remoteBudget.monthly_records || [])[i];
    if (!remote && local)      merged.monthly_records.push(local);
    else if (!local && remote) merged.monthly_records.push(remote);
    else if (local && remote)  merged.monthly_records.push({ ...remote, ...local });
  }
  if ((localBudget.burnout?.milestones?.length || 0) > (remoteBudget.burnout?.milestones?.length || 0)) {
    merged.burnout = localBudget.burnout;
  }
  return merged;
}

// ─── TRANSACTION WRAPPER ──────────────────────────────────────
const MAX_RETRIES = 4;

async function atomicWrite(filePath, mutatorFn, commitMessage, mergeStrategyFn) {
  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const { content: remoteContent, sha: remoteSha } = await fetchFileWithSha(filePath);
      const newContent = await mutatorFn(remoteContent);

      if (newContent.last_updated !== undefined) {
        newContent.last_updated = new Date().toISOString();
      }

      const result = await putFileContent(filePath, remoteSha, newContent, commitMessage);

      if (result.ok) {
        if (filePath.includes('dashboard_tasks')) {
          await recomputeAndSaveStats(newContent);
        }
        return { success: true, content: newContent };
      }

      if (result.status === 409) {
        console.warn(`[AtomicWrite] Conflicto detectado en ${filePath} (intento ${attempt}/${MAX_RETRIES}). Ejecutando merge...`);
        const { content: freshRemote, sha: freshSha } = await fetchFileWithSha(filePath);
        const merged = mergeStrategyFn ? mergeStrategyFn(newContent, freshRemote) : { ...freshRemote, ...newContent };
        const retryResult = await putFileContent(filePath, freshSha, merged, `${commitMessage} [merge-retry-${attempt}]`);
        if (retryResult.ok) {
          if (filePath.includes('dashboard_tasks')) {
            await recomputeAndSaveStats(merged);
          }
          return { success: true, content: merged };
        }
        lastError = `HTTP ${retryResult.status}`;
        continue;
      }
      throw new Error(`Error inesperado escribiendo ${filePath}: HTTP ${result.status} — ${JSON.stringify(result.data)}`);
    } catch (err) {
      lastError = err.message;
      if (attempt < MAX_RETRIES) {
        await new Promise(res => setTimeout(res, 500 * Math.pow(2, attempt - 1)));
        continue;
      }
    }
  }
  throw new Error(`[AtomicWrite] Fallo permanente en ${filePath} después de ${MAX_RETRIES} intentos. Último error: ${lastError}`);
}

// ─── STATS RECOMPUTATION ──────────────────────────────────────
async function recomputeAndSaveStats(tasksData) {
  const tasks   = tasksData.tasks || [];
  const members = ['Axel', 'Alex', 'Dídac', 'Javi', 'Mitxel'];

  const statsContent = {
    schema_version: '1.0.0',
    last_computed:  new Date().toISOString(),
    global: {
      total_tasks:     tasks.filter(t => t.estado !== 'Obsolete').length,
      total_ok:        tasks.filter(t => t.estado === 'OK').length,
      total_ko:        tasks.filter(t => t.estado === 'KO').length,
      total_uncertain: tasks.filter(t => t.estado === '?').length,
      total_obsolete:  tasks.filter(t => t.estado === 'Obsolete').length,
      fixed_found_ratio: computeFixedFoundRatio(tasks),
      by_priority:     computeAllPriorityStats(tasks)
    },
    members: computeAllMemberStats(tasks, members),
    hall_of_fame: computeHallOfFame(tasks, members)
  };

  await atomicWrite(
    '_data/studio_stats.json',
    () => statsContent,
    'chore: recalcular studio_stats.json automáticamente',
    null
  );
}

function computeFixedFoundRatio(tasks) {
  const found = tasks.filter(t => t.detectado_por && t.detectado_por !== 'Unassigned').length;
  const fixed = tasks.filter(t => t.estado === 'OK').length;
  return found > 0 ? parseFloat((fixed / found).toFixed(4)) : 0;
}

function computeAllPriorityStats(tasks) {
  const priorities = ['Critical','Major','Medium','Minor','Cosmetic','ToDo','Obsolete'];
  const result = {};
  for (const p of priorities) {
    const total  = tasks.filter(t => t.prioridad === p).length;
    const solved = tasks.filter(t => t.prioridad === p && t.estado === 'OK').length;
    result[p] = { total, solved, rate: total > 0 ? parseFloat((solved/total).toFixed(4)) : 0 };
  }
  return result;
}

function computeAllMemberStats(tasks, members) {
  const result     = {};
  const totalFound = tasks.filter(t => t.detectado_por && t.detectado_por !== 'Unassigned').length;
  const totalFixed = tasks.filter(t => t.estado === 'OK').length;

  for (const member of members) {
    const found      = tasks.filter(t => t.detectado_por === member).length;
    const fixed      = tasks.filter(t => t.resuelto_por === member).length;
    const fixedOK    = tasks.filter(t => t.resuelto_por === member && t.estado === 'OK').length;
    const support    = tasks.filter(t => t.apoyo === member).length;
    const supportOK  = tasks.filter(t => t.apoyo === member && t.estado === 'OK').length;
    const foundRate  = totalFound > 0 ? found / totalFound : 0;
    const fixRate    = totalFixed > 0 ? fixedOK / totalFixed : 0;
    const supRate    = totalFixed > 0 ? supportOK / totalFixed : 0;
    const score      = (fixRate * 0.5) + (foundRate * 0.3) + (supRate * 0.2);
    result[member]   = { found, fixed, fixed_ok: fixedOK, support, support_ok: supportOK,
                          found_rate: parseFloat(foundRate.toFixed(4)),
                          fix_ok_rate: parseFloat(fixRate.toFixed(4)),
                          score: parseFloat(score.toFixed(4)) };
  }
  return result;
}

function computeHallOfFame(tasks, members) {
  const stats = computeAllMemberStats(tasks, members);
  const MEDALS = ['🏆','🥇','🥈','🥉','🎖','🏅'];
  return Object.entries(stats)
    .sort(([,a],[,b]) => b.score - a.score)
    .map(([name, s], i) => ({ rank: i + 1, medal: MEDALS[i] || '', name, score: s.score,
                               found: s.found, fixed_ok: s.fixed_ok, support_ok: s.support_ok }));
}

// ─── PUBLIC API ───────────────────────────────────────────────

async function createTask(taskObject) {
  return atomicWrite('_data/dashboard_tasks.json', (db) => {
    const maxId = db.tasks.reduce((m, t) => Math.max(m, t.id), 0);
    taskObject.id = maxId + 1;
    db.tasks.push(taskObject);
    db.last_updated_by = taskObject.detectado_por || 'Sistema';
    return db;
  }, `feat: nueva tarea #${Date.now()} añadida`, (local, remote) => {
    local.tasks = mergeTaskArrays(local.tasks, remote.tasks);
    return local;
  });
}

async function updateTaskStatus(taskId, newEstado, resolverHandle, testerHandle) {
  return atomicWrite('_data/dashboard_tasks.json', (db) => {
    const task = db.tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Tarea #${taskId} no encontrada en la base de datos.`);
    task.estado       = newEstado;
    if (resolverHandle) task.resuelto_por = resolverHandle;
    if (testerHandle)   task.detectado_por = testerHandle;
    db.last_updated_by = resolverHandle || testerHandle || 'Sistema';
    return db;
  }, `chore: actualizar estado tarea #${taskId} → ${newEstado}`, (local, remote) => {
    local.tasks = mergeTaskArrays(local.tasks, remote.tasks);
    return local;
  });
}

async function updateBudget(mutatorFn, commitMessage) {
  return atomicWrite('_data/studio_budget.json', mutatorFn, commitMessage, mergeBudgetObjects);
}

async function updateMemberProfile(memberName, profileDelta) {
  return atomicWrite('_data/team_profiles.json', (db) => {
    if (!db.members[memberName]) throw new Error(`Miembro ${memberName} no encontrado.`);
    db.members[memberName] = { ...db.members[memberName], ...profileDelta };
    db.last_updated = new Date().toISOString();
    return db;
  }, `chore: actualizar perfil de ${memberName}`, (local, remote) => {
    const merged = { ...remote };
    merged.members[memberName] = { ...remote.members[memberName], ...local.members[memberName] };
    return merged;
  });
}

// ─── TOKEN VALIDATION ─────────────────────────────────────────
// Validates the stored token against the GitHub API and verifies
// the authenticated user is an allowed team member.
// Returns { valid: bool, user: object|null, handle: string|null }
async function validateToken() {
  try {
    const token = sessionStorage.getItem('gh_access_token');
    if (!token) return { valid: false, user: null, handle: null };

    const resp = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!resp.ok) return { valid: false, user: null, handle: null };

    const user = await resp.json();
    const ALLOWED_HANDLES = ['axlfc', 'mitxel2022', 'topperh4rley', 'javi', 'didac'];
    const isAllowed = ALLOWED_HANDLES.includes(user.login.toLowerCase());

    return { valid: isAllowed, user, handle: user.login };
  } catch {
    return { valid: false, user: null, handle: null };
  }
}

// ─── PUBLIC API SURFACE ───────────────────────────────────────
// Internal references for the atomic transaction engine.
// dashboard.js uses these functions directly from the script scope.
const githubAtomicApi = {
  // Auth
  validateToken,
  getAuthToken,

  // Core read/write (exposed for edge cases — prefer the domain methods below)
  fetchFileWithSha,

  // Domain write operations (always go through atomicWrite internally)
  createTask,
  updateTaskStatus,
  updateBudget,
  updateMemberProfile,

  // Stats (called automatically after task writes, but exposed for manual refresh)
  recomputeAndSaveStats,

  // Formula library (used by dashboard.js for local computations before commit)
  computeFixedFoundRatio,
  computeAllPriorityStats,
  computeAllMemberStats,
  computeHallOfFame,
  computeBurnoutIndex: function(tasks, currentMilestoneId, milestoneStartDate, milestoneEndDate) {
    const today        = new Date();
    const start        = new Date(milestoneStartDate);
    const end          = new Date(milestoneEndDate);
    const totalDays    = Math.max(1, (end - start) / 86400000);
    const elapsedDays  = Math.max(0, (today - start) / 86400000);
    const timePressure = Math.min(1.0, elapsedDays / totalDays);

    const milTasks    = tasks.filter(t => t.milestone === currentMilestoneId && t.estado !== 'Obsolete' && t.estado !== 'OK');
    const totalActive = milTasks.length;
    const critPending = milTasks.filter(t => t.prioridad === 'Critical').length;
    const majPending  = milTasks.filter(t => t.prioridad === 'Major').length;

    const weightedStress = (critPending * 3 + majPending * 2);
    const maxStress      = totalActive * 3;
    const stressRatio    = maxStress > 0 ? weightedStress / maxStress : 0;

    return Math.min(1.0, stressRatio * (0.4 + timePressure * 0.6));
  },

  // Merge strategies (exposed so dashboard.js can use them in custom atomicWrite calls)
  mergeTaskArrays,
  mergeBudgetObjects
};


/**
 * GitHub API Interaction Module
 * Handles authentication, fetching issues, and updating issue states.
 * Used by: dashboard.md (legacy Bootstrap Kanban via GitHub Issues)
 */

class GitHubAPI {
    constructor() {
        this.baseUrl = 'https://api.github.com';
        // ─── FIX: intentar ambos stores al iniciar
        this.token = localStorage.getItem('github_token') 
                  || sessionStorage.getItem('gh_access_token') 
                  || null;
        
        // Si vino de sessionStorage, sincronizar a localStorage
        if (!localStorage.getItem('github_token') && this.token) {
            localStorage.setItem('github_token', this.token);
        }
        
        this.repo = localStorage.getItem('github_repo') || 'hypenosys/hypenosys.github.io';
        this.user = null;
        this.whitelist = ['Axlfc', 'mitxel2022', 'TopperH4rley', 'Alex', 'Dídac'];

        this.rateLimit = {
            limit: 5000,
            remaining: 5000,
            reset: 0
        };
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('github_token', token);
        // ─── FIX: bridge para dashboard.html (usa sessionStorage)
        sessionStorage.setItem('gh_access_token', token);
    }

    setRepo(repo) {
        this.repo = repo;
        localStorage.setItem('github_repo', repo);
    }

    clearAuth() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('github_token');
        // ─── FIX: limpiar también el bridge
        sessionStorage.removeItem('gh_access_token');
    }

    getHeaders() {
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
        if (this.token) {
            headers['Authorization'] = `token ${this.token}`;
        }
        return headers;
    }

    async updateRateLimit(response) {
        const limit     = response.headers.get('x-ratelimit-limit');
        const remaining = response.headers.get('x-ratelimit-remaining');
        const reset     = response.headers.get('x-ratelimit-reset');

        if (limit)     this.rateLimit.limit     = parseInt(limit);
        if (remaining) this.rateLimit.remaining = parseInt(remaining);
        if (reset)     this.rateLimit.reset     = parseInt(reset);

        window.dispatchEvent(new CustomEvent('github-ratelimit-update', { detail: this.rateLimit }));
    }

    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
        try {
            const response = await fetch(url, {
                ...options,
                headers: { ...this.getHeaders(), ...options.headers }
            });

            await this.updateRateLimit(response);

            if (!response.ok) {
                const error = await response.json();
                throw { status: response.status, message: error.message || `GitHub API error: ${response.status}` };
            }

            if (response.status === 204) return null;
            return response.json();
        } catch (e) {
            console.error('GitHub API Request Failed:', e);
            throw e;
        }
    }

    async validateToken() {
        if (!this.token) return null;
        try {
            const user = await this.request('/user');

            const isAuthorized = this.whitelist.some(
                handle => handle.toLowerCase() === user.login.toLowerCase()
            );

            if (!isAuthorized) {
                throw { status: 403, type: 'ACL_DENIED', user: user.login };
            }

            this.user = user;
            return this.user;
        } catch (e) {
            console.error('Token validation failed:', e);
            throw e;
        }
    }

    // ─── Content Management (used by dashboard.html atomic engine) ───────────

    async getFile(path) {
        return this.request(`/repos/${this.repo}/contents/${path}`);
    }

    async updateFile(path, content, message, sha) {
        const body = {
            message: message,
            content: btoa(unescape(encodeURIComponent(content))),
            sha:     sha
        };
        return this.request(`/repos/${this.repo}/contents/${path}`, {
            method: 'PUT',
            body:   JSON.stringify(body)
        });
    }

    // ─── Issues Management (used by dashboard.md legacy Kanban) ──────────────

    async fetchIssues() {
        const openIssues   = await this.request(`/repos/${this.repo}/issues?state=open&per_page=100`);
        const closedIssues = await this.request(`/repos/${this.repo}/issues?state=closed&per_page=100`);
        return [...openIssues, ...closedIssues].filter(issue => !issue.pull_request);
    }

    async updateIssue(issueNumber, data) {
        return this.request(`/repos/${this.repo}/issues/${issueNumber}`, {
            method: 'PATCH',
            body:   JSON.stringify(data)
        });
    }

    async autoAssign(issueNumber) {
        if (!this.user) await this.validateToken();
        if (!this.user) throw new Error('Not authenticated');
        return this.updateIssue(issueNumber, { assignees: [this.user.login] });
    }

    async updateStatus(issueNumber, status) {
        if (status === 'done') {
            return this.updateIssue(issueNumber, { state: 'closed' });
        }

        const issue      = await this.request(`/repos/${this.repo}/issues/${issueNumber}`);
        const otherLabels = issue.labels
            .map(l => typeof l === 'string' ? l : l.name)
            .filter(l => !l.startsWith('status:'));
        const newLabels  = [...otherLabels, `status:${status}`];

        return this.updateIssue(issueNumber, { state: 'open', labels: newLabels });
    }

    async updateMilestone(issueNumber, milestoneNumber) {
        return this.updateIssue(issueNumber, { milestone: milestoneNumber });
    }

    async fetchMilestones() {
        return this.request(`/repos/${this.repo}/milestones`);
    }

    async fetchRepoLabels() {
        return this.request(`/repos/${this.repo}/labels`);
    }

    async fetchRepoAssignees() {
        return this.request(`/repos/${this.repo}/assignees`);
    }
}

// Instantiate and expose globally — both dashboard.md and dashboard.html consume this
const githubApi = new GitHubAPI();
window.githubApi = githubApi;

console.log('[github-api.js] GitHubAPI lista. window.githubApi expuesto.');

// Confirm load in console (remove in production if desired)
console.log('[github-api.js] Motor de transacciones atómico cargado. window.githubApi disponible.');
