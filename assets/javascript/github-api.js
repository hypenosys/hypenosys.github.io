/*
 * ⚠️  AUTH CRITICAL FILE — DO NOT MODIFY AUTH FLOW
 * Last known working state: commit 3d5b28f2d94ae3facd456d967c2ddacb710de923
 *
 * FORBIDDEN in this file:
 * - Any changes to OAuth callback handling
 * - Any changes to token storage key names
 * - Any changes to whitelist array
 * - Any changes to script load order dependencies
 *
 * Future features must be added AROUND this logic, never inside it.
 * If auth breaks after any commit, revert this file to 3d5b28f immediately.
 */

// ============================================================
// HYPENOSYS GITHUB CONTENT API — ATOMIC TRANSACTION ENGINE
// Race-condition-safe write layer for _data/*.json files
// ============================================================

const GITHUB_API_BASE = 'https://api.github.com';
const REPO_OWNER      = 'hypenosys';
const REPO_NAME       = 'hypenosys.github.io';
const DATA_BRANCH     = 'master';

// Retrieve GitHub OAuth token from available storage
function getAuthToken() {
  const sessionToken = sessionStorage.getItem('gh_access_token');
  const localToken = localStorage.getItem('github_token');

  if (sessionToken) console.log('[AUTH] Token found in sessionStorage');
  else if (localToken) console.log('[AUTH] Token found in localStorage');
  else console.log('[AUTH] No token found');

  const token = sessionToken || localToken;
  if (!token || typeof token !== 'string' || token.length < 10) {
    return null;
  }
  return token.trim();
}

// ─── AUTH VALIDATION ──────────────────────────────────────────
async function validateToken() {
  try {
    const token = getAuthToken();
    if (!token) return { valid: false, user: null, error: 'No token' };

    const resp = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (!resp.ok) return { valid: false, user: null };
    const user = await resp.json();
    const ALLOWED = ['axlfc', 'mitxel2022', 'topperh4rley', 'dkdidac-design', 'javi26031994-a11y'];
    return { valid: ALLOWED.includes(user.login.toLowerCase()), user };
  } catch (err) {
    return { valid: false, user: null };
  }
}

// ─── CORE READ ────────────────────────────────────────────────
// Returns { content: parsedObject, sha: string }
async function fetchFileWithSha(filePath) {
  const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${DATA_BRANCH}&t=${Date.now()}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Error leyendo ${filePath}: ${err.message}`);
  }
  const data     = await response.json();
  const content  = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))));
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

async function deleteFile(filePath, sha, commitMessage) {
  const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
  const body = JSON.stringify({
    message: commitMessage,
    sha: sha,
    branch: DATA_BRANCH
  });
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body
  });
  return { ok: response.ok, status: response.status, data: await response.json() };
}

// ─── MERGE STRATEGIES ─────────────────────────────────────────
function mergeTaskArrays(localTasks, remoteTasks) {
  const remoteMap = new Map(remoteTasks.map(t => [String(t.id), t]));
  const localMap  = new Map(localTasks.map(t => [String(t.id), t]));
  const merged    = [];

  for (const [id, remoteTask] of remoteMap) {
    const localTask = localMap.get(String(id));
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
  const activeTasks = tasksData.tasks || [];
  let archivedTasks = [];
  try {
    const archiveRes = await window.githubApi.fetchFileWithSha('_data/dashboard_tasks_archive.json');
    archivedTasks = archiveRes.content.tasks || [];
  } catch (e) {
    console.warn('[STATS] Could not fetch archived tasks for computation:', e);
  }

  const allTasks = [...activeTasks, ...archivedTasks];
  const members = ['Axel', 'Alex', 'Dídac', 'Javi', 'Mitxel'];
  const memberMapping = {
    'axlfc': 'Axel',
    'topperh4rley': 'Alex',
    'javi26031994-a11y': 'Javi',
    'dkdidac-design': 'Dídac',
    'mitxel2022': 'Mitxel'
  };

  // Get current milestone from budget
  let currentMilestone = 'M1';
  try {
    const budgetRes = await window.githubApi.fetchFileWithSha('_data/studio_budget.json');
    currentMilestone = budgetRes.content.burnout?.current_milestone || 'M1';
  } catch (e) {
    console.warn('[STATS] Could not fetch budget for current milestone:', e);
  }

  const layerA = computeLayerA(allTasks, members, memberMapping, currentMilestone);
  const layerB = computeLayerB(allTasks, members, memberMapping, currentMilestone);

  const statsContent = {
    schema_version: '1.1.0',
    computed_at: new Date().toISOString(),
    last_computed_milestone: currentMilestone,
    global: {
      total_tasks: activeTasks.filter(t => t.estado !== 'Obsolete').length,
      total_ok: activeTasks.filter(t => t.estado === 'OK').length,
      total_ko: activeTasks.filter(t => t.estado === 'KO').length,
      total_uncertain: activeTasks.filter(t => ['?', 'In Review'].includes(t.estado)).length,
      total_obsolete: activeTasks.filter(t => t.estado === 'Obsolete').length,
      fixed_found_ratio: parseFloat(computeFixedFoundRatio(activeTasks).toFixed(4)),
      verified_ratio: activeTasks.length > 0 ? parseFloat((activeTasks.filter(t => t.estado === 'OK').length / activeTasks.length).toFixed(4)) : 0
    },
    group: layerB,
    members: layerA
  };

  // Milestone Reset Logic
  try {
    const oldStatsRes = await window.githubApi.fetchFileWithSha('_data/studio_stats.json');
    const oldStats = oldStatsRes.content;

    statsContent.hall_of_fame = oldStats.hall_of_fame || { current_milestone: {}, archive: [] };

    if (oldStats.last_computed_milestone && oldStats.last_computed_milestone !== currentMilestone) {
        console.log(`[STATS] Milestone changed from ${oldStats.last_computed_milestone} to ${currentMilestone}. Archiving HOF.`);

        const archiveEntry = {
            milestone: oldStats.last_computed_milestone,
            archived_at: new Date().toISOString(),
            winners: statsContent.hall_of_fame.current_milestone.winners || {},
            leaderboard: statsContent.hall_of_fame.current_milestone.leaderboard || {}
        };

        if (!statsContent.hall_of_fame.archive) statsContent.hall_of_fame.archive = [];
        statsContent.hall_of_fame.archive.push(archiveEntry);

        // Reset current milestone HOF
        statsContent.hall_of_fame.current_milestone = {
            winners: layerB.hall_of_fame_winners,
            leaderboard: layerB.leaderboard
        };
    } else {
        // Just update current milestone HOF
        statsContent.hall_of_fame.current_milestone = {
            winners: layerB.hall_of_fame_winners,
            leaderboard: layerB.leaderboard
        };
    }
  } catch (e) {
    console.warn('[STATS] Could not process milestone reset logic:', e);
    statsContent.hall_of_fame = {
        current_milestone: {
            winners: layerB.hall_of_fame_winners,
            leaderboard: layerB.leaderboard
        },
        archive: []
    };
  }

  await atomicWrite(
    '_data/studio_stats.json',
    () => statsContent,
    'chore: recalcular studio_stats.json (Layer A & B)',
    null
  );
}

// ─── FORMULA IMPLEMENTATIONS ──────────────────────────────────

// PART 1.2 — Stats Schema
function computeFixedFoundRatio(tasks) {
  const found = tasks.filter(t => t.detectado_por !== null && t.detectado_por !== "Unassigned").length;
  const fixed = tasks.filter(t => t.estado === "OK").length;
  return found > 0 ? fixed / found : 0;
}

// PART 1.3 — Burnout Schema
function computeTasksPerHour(milestoneTasks, hoursTotal) {
  return hoursTotal > 0 ? milestoneTasks / hoursTotal : 0;
}

function computeQASolvedPct(tasks, milestoneId) {
  const milTasks = tasks.filter(t => t.milestone === milestoneId);
  const solved   = milTasks.filter(t => t.estado === "OK").length;
  return milTasks.length > 0 ? solved / milTasks.length : 0;
}

function computeErrorRate(tasksCheckedRatio) {
  return 1 - tasksCheckedRatio;
}

function computeBurnoutIndex(tasks, currentMilestoneId, milestoneStartDate, milestoneEndDate) {
  const today       = new Date();
  const start       = new Date(milestoneStartDate);
  const end         = new Date(milestoneEndDate);
  const totalDays   = Math.max(1, (end - start) / 86400000);
  const elapsedDays = Math.max(0, (today - start) / 86400000);
  const timePressure = Math.min(1.0, elapsedDays / totalDays);

  const milTasks    = tasks.filter(t => t.milestone === currentMilestoneId && t.estado !== "Obsolete" && t.estado !== "OK");
  const totalActive = milTasks.length;
  const critPending = milTasks.filter(t => t.prioridad === "Critical").length;
  const majPending  = milTasks.filter(t => t.prioridad === "Major").length;

  const weightedStress = (critPending * 3 + majPending * 2);
  const maxStress      = totalActive * 3;
  const stressRatio    = maxStress > 0 ? weightedStress / maxStress : 0;

  return Math.min(1.0, stressRatio * (0.4 + timePressure * 0.6));
}

// PART 1.4 — Budget Schema
function roleMonthlyTotal(role) {
  return role.hourly_rate * role.monthly_hours;
}

function totalMonthlyExpenses(budgetData, monthIndex) {
  let total = 0;
  for (const cat of budgetData.categories) {
    if (cat.roles) {
      for (const role of cat.roles) {
        total += roleMonthlyTotal(role);
      }
    }
    if (cat.entries) {
      for (const entry of cat.entries) {
        total += entry.cost_monthly || 0;
      }
    }
  }
  return total;
}

function cumulativeProfitLoss(budgetData, upToMonthIndex) {
  let cumulative = 0;
  for (let i = 0; i <= upToMonthIndex; i++) {
    const income   = budgetData.monthly_records[i]?.income || 0;
    const expenses = totalMonthlyExpenses(budgetData, i);
    cumulative += income - expenses;
  }
  return cumulative;
}

function salesNeededBreakEven(totalCost, productPrice) {
  return productPrice > 0 ? Math.ceil(totalCost / productPrice) : Infinity;
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

async function updateTask(taskId, taskDelta) {
  return atomicWrite('_data/dashboard_tasks.json', (db) => {
    const taskIndex = db.tasks.findIndex(t => String(t.id) === String(taskId));
    if (taskIndex === -1) throw new Error(`Tarea #${taskId} no encontrada.`);
    db.tasks[taskIndex] = { ...db.tasks[taskIndex], ...taskDelta };
    db.last_updated_by = _currentUser?.login || 'Sistema';
    return db;
  }, `chore: actualizar tarea #${taskId}`, (local, remote) => {
    local.tasks = mergeTaskArrays(local.tasks, remote.tasks);
    return local;
  });
}

async function updateTaskStatus(taskId, newEstado, resolverHandle, testerHandle) {
  return atomicWrite('_data/dashboard_tasks.json', (db) => {
    const task = db.tasks.find(t => String(t.id) === String(taskId));
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

async function archiveTask(taskId) {
  let taskToArchive = null;

  // 1. Remove from active tasks
  await atomicWrite('_data/dashboard_tasks.json', (db) => {
    const idx = db.tasks.findIndex(t => String(t.id) === String(taskId));
    if (idx === -1) throw new Error(`Tarea #${taskId} no encontrada en activos.`);
    taskToArchive = db.tasks.splice(idx, 1)[0];
    db.last_updated_by = _currentUser?.login || 'Sistema';
    return db;
  }, `chore: archivar tarea #${taskId}`, (local) => local);

  if (!taskToArchive) return;

  // 2. Add to archive
  await atomicWrite('_data/dashboard_tasks_archive.json', (db) => {
    if (!db.tasks.find(t => String(t.id) === String(taskId))) {
      db.tasks.push(taskToArchive);
    }
    db.last_updated_by = _currentUser?.login || 'Sistema';
    return db;
  }, `chore: tarea #${taskId} movida al archivo`, (local, remote) => {
     local.tasks = mergeTaskArrays(local.tasks, remote.tasks);
     return local;
  });
}

async function restoreTask(taskId) {
  let taskToRestore = null;

  // 1. Remove from archive
  await atomicWrite('_data/dashboard_tasks_archive.json', (db) => {
    const idx = db.tasks.findIndex(t => String(t.id) === String(taskId));
    if (idx === -1) throw new Error(`Tarea #${taskId} no encontrada en el archivo.`);
    taskToRestore = db.tasks.splice(idx, 1)[0];
    db.last_updated_by = _currentUser?.login || 'Sistema';
    return db;
  }, `chore: desarchivar tarea #${taskId}`, (local) => local);

  if (!taskToRestore) return;

  // 2. Add back to active tasks
  await atomicWrite('_data/dashboard_tasks.json', (db) => {
    if (!db.tasks.find(t => String(t.id) === String(taskId))) {
      db.tasks.push(taskToRestore);
    }
    db.last_updated_by = _currentUser?.login || 'Sistema';
    return db;
  }, `chore: tarea #${taskId} restaurada desde el archivo`, (local, remote) => {
     local.tasks = mergeTaskArrays(local.tasks, remote.tasks);
     return local;
  });
}

async function getOrgRepos() {
  try {
    const token = getAuthToken();
    if (!token) return [];

    const resp = await fetch(`${GITHUB_API_BASE}/orgs/${REPO_OWNER}/repos?per_page=100`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!resp.ok) {
      console.warn('[GITHUB-API] Error fetching org repos:', resp.status);
      return [];
    }

    return await resp.json();
  } catch (err) {
    console.error('[GITHUB-API] Error in getOrgRepos:', err);
    return [];
  }
}

async function updateMemberProfile(memberName, profileDelta) {
  // 1. Update team_profiles.json
  await atomicWrite('_data/team_profiles.json', (db) => {
    if (!db.members[memberName]) throw new Error(`Miembro ${memberName} no encontrado en team_profiles.json.`);
    db.members[memberName] = { ...db.members[memberName], ...profileDelta };
    db.last_updated = new Date().toISOString();
    return db;
  }, `chore: actualizar perfil de ${memberName} (profiles)`, (local, remote) => {
    const merged = { ...remote };
    merged.members[memberName] = { ...remote.members[memberName], ...local.members[memberName] };
    return merged;
  });

  // 2. Sync with team.json
  try {
    const profilesRes = await fetchFileWithSha('_data/team_profiles.json');
    const profile = profilesRes.content.members[memberName];

    await atomicWrite('_data/team.json', (team) => {
      const memberIndex = team.findIndex(m =>
        (m.github && m.github.toLowerCase().includes(profile.handle.toLowerCase())) ||
        (m.name.toLowerCase().includes(memberName.toLowerCase()))
      );
      if (memberIndex !== -1) {
        team[memberIndex].name = profile.display_name;
        team[memberIndex].role = profile.role;
        team[memberIndex].description = profile.bio;
        team[memberIndex].image = `https://github.com/${profile.handle}.png`;
        if (profile.links && profile.links.github) team[memberIndex].github = profile.links.github;
        if (profile.portfolio) team[memberIndex].portfolio = profile.portfolio;
      }
      return team;
    }, `chore: sincronizar team.json con perfil de ${memberName}`, (local, remote) => {
       // Simple replacement for team.json sync
       return local;
    });
  } catch (err) {
    console.error('Failed to sync team.json:', err);
  }
}

// ─── STATE ────────────────────────────────────────────────────
let _currentUser = null;

// ─── PATCH validateToken para guardar user en el objeto global ─
const _originalValidateToken = validateToken;
async function validateTokenAndStore() {
  const result = await _originalValidateToken();
  if (result.valid && result.user) {
    console.log('[AUTH] Token valid:', result.user.login);
    _currentUser = result.user;
  } else {
    if (getAuthToken()) {
      console.log('[AUTH] Token invalid, clearing auth');
    }
  }
  return result;
}

// ─── PUBLIC API ───────────────────────────────────────────────
window.githubApi = {
  // Auth methods (compatibilidad con auth-manager.js)
  get user() { return _currentUser; },
  setToken(token, rememberMe = false) {
    if (!token) return;
    const cleanToken = token.trim();

    console.log(`[AUTH] Setting token (rememberMe: ${rememberMe})`);

    // Clear both first to avoid mixed sessions
    this.clearAuth();

    if (rememberMe) {
      localStorage.setItem('github_token', cleanToken);
    } else {
      sessionStorage.setItem('gh_access_token', cleanToken);
    }
  },

  async exchangeCodeForToken(code) {
    console.log('[AUTH] Exchanging code for token...');
    const rememberMe = sessionStorage.getItem('auth_remember_me') === 'true';
    sessionStorage.removeItem('auth_remember_me');

    try {
      const response = await fetch('https://hypenosys-gatekeeper-v2.axlffcc.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await response.json();

      if (data.access_token) {
        this.setToken(data.access_token, rememberMe);
        return await this.validateToken();
      } else {
        throw new Error(data.error || 'No se recibió token del gatekeeper');
      }
    } catch (e) {
      console.error('[AUTH] Exchange failed:', e);
      throw e;
    }
  },
  setRepo(repo) {
      if (!repo) return;
      localStorage.setItem('github_repo', repo);
  },
  clearAuth() {
    sessionStorage.removeItem('gh_access_token');
    localStorage.removeItem('github_token');
    // Also clear jules sessions cache on logout for safety
    localStorage.removeItem('jules_sessions_cache');
    _currentUser = null;
  },

  // ─── LEGACY COMPAT (usado por auth-manager.js) ────────────────
  /**
   * Fetches a file and returns { content (base64 raw), sha }
   * Compatible con auth-manager.js que espera data.content y data.sha
   */
  async getFile(filePath) {
    const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${DATA_BRANCH}&t=${Date.now()}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(`getFile error ${filePath}: ${err.message}`);
    }
    return await response.json();
  },

  /**
   * Writes a file directly (sin atomic wrapper — para edición de perfiles desde el home)
   */
  async updateFile(filePath, contentString, commitMessage, sha) {
    const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
    const body = JSON.stringify({
      message: commitMessage,
      content: btoa(unescape(encodeURIComponent(contentString))),
      sha: sha,
      branch: DATA_BRANCH
    });
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(`updateFile error ${filePath}: ${err.message}`);
    }
    return await response.json();
  },

  // Core API
  validateToken: validateTokenAndStore,
  getAuthToken,
  fetchFileWithSha,
  createTask,
  updateTaskStatus,
  updateTask,
  archiveTask,
  restoreTask,
  updateBudget,
  getOrgRepos,
  updateMemberProfile,
  recomputeAndSaveStats,
  deleteFile,

  // Fórmulas
  computeFixedFoundRatio,
  computeLayerA,
  computeLayerB,
  computeBurnoutIndex,
  roleMonthlyTotal,
  totalMonthlyExpenses,
  cumulativeProfitLoss,
  salesNeededBreakEven
};

/**
 * LEGACY GitHubAPI class for backward compatibility with dashboard.md
 */
class GitHubAPI {
    constructor() {
        this.token = getAuthToken();
        this.repo = REPO_OWNER + '/' + REPO_NAME;
    }
    async validateToken() {
        const res = await validateToken();
        if (!res.valid) throw new Error('Unauthorized');
        return res.user;
    }
    async fetchIssues() {
        return [];
    }
}
window.LegacyGitHubAPI = GitHubAPI;

function computeLayerA(allTasks, members, memberMapping, currentMilestone) {
    const stats = {};
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0,0,0,0);

    members.forEach(member => {
        const handle = Object.keys(memberMapping).find(h => memberMapping[h] === member);
        const memberTasks = allTasks.filter(t =>
            t.resuelto_por === member ||
            (t.asignados && t.asignados.includes(handle))
        );
        const completedTasks = memberTasks.filter(t => t.estado === 'OK');

        // Basic counts
        const allTimeCompleted = completedTasks.length;
        const milestoneCompleted = completedTasks.filter(t => t.milestone === currentMilestone).length;
        const weekCompleted = completedTasks.filter(t => {
            const completionDate = new Date(t.fecha);
            return completionDate >= startOfWeek;
        }).length;

        // Breakdown by type
        const typeBreakdown = {};
        completedTasks.forEach(t => {
            const type = t.task_type || 'feature';
            typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
        });

        // Breakdown by rama
        const ramaBreakdown = {};
        completedTasks.forEach(t => {
            ramaBreakdown[t.rama] = (ramaBreakdown[t.rama] || 0) + 1;
        });

        // Tag frequency
        const tagFreq = {};
        completedTasks.forEach(t => {
            (t.tags || []).forEach(tag => {
                tagFreq[tag] = (tagFreq[tag] || 0) + 1;
            });
        });

        // Completion Speed (Weighted by Story Points or Hours)
        let totalWeightedDays = 0;
        let totalWeight = 0;
        let hasEstimates = false;
        completedTasks.forEach(t => {
            const end = new Date(t.fecha);
            const startStr = t.start_date || t.fecha_creacion || t.fecha;
            const start = new Date(startStr);
            if (!isNaN(start) && !isNaN(end)) {
                const days = Math.max(0.5, (end - start) / (1000 * 60 * 60 * 24));
                const weight = t.story_points || t.estimated_hours || 1;
                totalWeightedDays += (days * weight);
                totalWeight += weight;
                if (!t.start_date) hasEstimates = true;
            }
        });
        const avgSpeed = totalWeight > 0 ? totalWeightedDays / totalWeight : 0;

        // Dependency Impact (how many tasks they unblocked)
        let unblockedCount = 0;
        completedTasks.forEach(t => {
            const taskId = String(t.id);
            const dependents = allTasks.filter(other => (other.blocked_by || []).includes(taskId));
            unblockedCount += dependents.length;
        });

        // Comment activity (on others' tasks)
        let commentCount = 0;
        allTasks.forEach(t => {
            const isAssigned = (t.asignados || []).includes(handle);
            if (!isAssigned) {
                (t.comments || []).forEach(c => {
                    if (c.author_login === handle) commentCount++;
                });
            }
        });

        // Volatility
        let reopens = 0;
        let reprioritizations = 0;
        memberTasks.forEach(t => {
            (t.change_log || []).forEach(log => {
                if (log.field === 'estado') {
                    const terminalStates = ['OK', 'Closed', 'Done'];
                    if (terminalStates.includes(log.old_value) && !terminalStates.includes(log.new_value)) {
                        reopens++;
                    }
                }
                if (log.field === 'prioridad') {
                    reprioritizations++;
                }
            });
        });

        // Workload
        const activeTasks = memberTasks.filter(t => !['OK', 'Closed', 'Obsolete'].includes(t.estado));
        const totalStoryPoints = activeTasks.reduce((sum, t) => sum + (t.story_points || 0), 0);

        // Weekly Velocity (last 8 weeks)
        const weeklyVelocity = {};
        for (let i = 7; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - (i * 7));
            const weekNum = getWeekNumberForStats(d);
            weeklyVelocity[weekNum] = 0;
        }

        const tasksToGroup = completedTasks.length > 0 ? completedTasks : memberTasks;
        tasksToGroup.forEach(t => {
            const dateStr = (completedTasks.length > 0) ? t.fecha : (t.fecha_creacion || t.fecha);
            const weekNum = getWeekNumberForStats(new Date(dateStr));
            if (weeklyVelocity[weekNum] !== undefined) {
                weeklyVelocity[weekNum] += (t.story_points || 1);
            }
        });

        stats[handle || member] = {
            member_name: member,
            completed: {
                all_time: allTimeCompleted,
                milestone: milestoneCompleted,
                week: weekCompleted
            },
            weekly_velocity: weeklyVelocity,
            type_breakdown: typeBreakdown,
            rama_breakdown: ramaBreakdown,
            tag_frequency: tagFreq,
            avg_completion_speed: {
                days: parseFloat(avgSpeed.toFixed(2)),
                estimated_start: hasEstimates
            },
            dependency_impact: unblockedCount,
            comment_activity: commentCount,
            volatility: {
                reopens,
                reprioritizations
            },
            workload: {
                active_tasks: activeTasks.length,
                story_points: totalStoryPoints
            }
        };
    });
    return stats;
}

function computeLayerB(allTasks, members, memberMapping, currentMilestone) {
    const today = new Date();
    const milestoneTasks = allTasks.filter(t => t.milestone === currentMilestone);
    const completedInMilestone = milestoneTasks.filter(t => t.estado === 'OK');

    // Velocity Trend (completed tasks per week in this milestone)
    // We'll return the last 8 weeks for the chart
    const velocityTrend = {};
    for (let i = 7; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - (i * 7));
        const weekNum = getWeekNumberForStats(d);
        velocityTrend[weekNum] = 0;
    }

    if (completedInMilestone.length > 0) {
        completedInMilestone.forEach(t => {
            const weekNum = getWeekNumberForStats(new Date(t.fecha));
            if (velocityTrend[weekNum] !== undefined) {
                velocityTrend[weekNum]++;
            }
        });
    } else {
        // Fallback to creation signal if no tasks are completed yet
        milestoneTasks.forEach(t => {
            const dateStr = t.fecha_creacion || t.fecha;
            const weekNum = getWeekNumberForStats(new Date(dateStr));
            if (velocityTrend[weekNum] !== undefined) {
                velocityTrend[weekNum]++;
            }
        });
    }

    // Bug rate (Bugs vs Total Active)
    const activeTasks = allTasks.filter(t => !['OK', 'Closed', 'Obsolete'].includes(t.estado));
    const bugsActive = activeTasks.filter(t => t.task_type === 'bug').length;
    const bugRate = activeTasks.length > 0 ? (bugsActive / activeTasks.length) : 0;

    // Blocker health
    const blockedTasksCount = activeTasks.filter(t => (t.blocked_by || []).length > 0).length;

    // Tag Heatmap
    const tagHeatmap = {};
    activeTasks.forEach(t => {
        const tags = t.tags || [];
        if (tags.length > 0) {
            tags.forEach(tag => {
                tagHeatmap[tag] = (tagHeatmap[tag] || 0) + 1;
            });
        } else {
            // Fallback to task_type and rama as synthetic tags
            if (t.task_type) tagHeatmap[t.task_type] = (tagHeatmap[t.task_type] || 0) + 1;
            if (t.rama) tagHeatmap[t.rama] = (tagHeatmap[t.rama] || 0) + 1;
        }
    });

    // Milestone Burndown (tasks remaining)
    const remainingTasks = milestoneTasks.filter(t => !['OK', 'Closed', 'Obsolete'].includes(t.estado)).length;

    // Leaderboard & Winners
    const leaderboard = {};
    members.forEach(member => {
        const handle = Object.keys(memberMapping).find(h => memberMapping[h] === member);
        const mTasks = milestoneTasks.filter(t => t.resuelto_por === member || (t.asignados && t.asignados.includes(handle)));
        const mCompleted = mTasks.filter(t => t.estado === 'OK');

        // MVP points (completitud points delivered)
        const mvpPoints = mCompleted.reduce((sum, t) => sum + (t.completitud || 0), 0);

        // Bug Slayer
        const bugsSolved = mCompleted.filter(t => t.task_type === 'bug').length;

        // Unblocker
        let unblockedCount = 0;
        mCompleted.forEach(t => {
            const taskId = String(t.id);
            const dependents = allTasks.filter(other => (other.blocked_by || []).includes(taskId));
            unblockedCount += dependents.length;
        });

        // Velocity King (Story points per day)
        let totalDays = 0;
        let totalSP = 0;
        mCompleted.forEach(t => {
            const end = new Date(t.fecha);
            const start = new Date(t.start_date || t.fecha_creacion || t.fecha);
            const days = Math.max(0.5, (end - start) / (1000 * 60 * 60 * 24));
            totalDays += days;
            totalSP += (t.story_points || 1); // fallback to 1 SP if null
        });
        const velocity = totalDays > 0 ? totalSP / totalDays : 0;

        // Researcher
        const researchSolved = mCompleted.filter(t => t.task_type === 'research').length;

        // Art Lead
        const artTasks = mCompleted.filter(t => t.rama === 'ART').length;

        // Collaborator
        let commentCount = 0;
        allTasks.forEach(t => {
            const isAssigned = (t.asignados || []).includes(handle);
            if (!isAssigned) {
                (t.comments || []).forEach(c => {
                    if (c.author_login === handle) commentCount++;
                });
            }
        });

        leaderboard[handle || member] = {
            member_name: member,
            mvp_points: mvpPoints,
            bugs_solved: bugsSolved,
            unblocked_count: unblockedCount,
            velocity: velocity,
            research_solved: researchSolved,
            art_tasks: artTasks,
            comments_left: commentCount
        };
    });

    const winners = {
        mvp: findWinner(leaderboard, 'mvp_points'),
        bug_slayer: findWinner(leaderboard, 'bugs_solved'),
        unblocker: findWinner(leaderboard, 'unblocked_count'),
        velocity_king: findWinner(leaderboard, 'velocity'),
        researcher: findWinner(leaderboard, 'research_solved'),
        art_lead: findWinner(leaderboard, 'art_tasks'),
        collaborator: findWinner(leaderboard, 'comments_left')
    };

    return {
        velocity_trend: velocityTrend,
        bug_rate: parseFloat(bugRate.toFixed(4)),
        blocker_health: blockedTasksCount,
        tag_heatmap: tagHeatmap,
        milestone_tasks_remaining: remainingTasks,
        hall_of_fame_winners: winners,
        leaderboard: leaderboard
    };
}

function findWinner(leaderboard, metric) {
    let winner = null;
    let maxVal = -1;
    for (const [handle, stats] of Object.entries(leaderboard)) {
        if (stats[metric] > maxVal) {
            maxVal = stats[metric];
            winner = { handle, name: stats.member_name, value: maxVal };
        }
    }
    return winner;
}

function getWeekNumberForStats(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
}
