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
  const token = sessionStorage.getItem('gh_access_token') || localStorage.getItem('github_token');
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
      total_uncertain: tasks.filter(t => ['?', 'In Review'].includes(t.estado)).length,
      total_obsolete:  tasks.filter(t => t.estado === 'Obsolete').length,
      fixed_found_ratio: parseFloat(computeFixedFoundRatio(tasks).toFixed(4)),
      verified_ratio: tasks.length > 0 ? parseFloat((tasks.filter(t => t.estado === 'OK').length / tasks.length).toFixed(4)) : 0,
      by_priority: {
        Critical: computePriorityResolution(tasks, "Critical"),
        Major:    computePriorityResolution(tasks, "Major"),
        Medium:   computePriorityResolution(tasks, "Medium"),
        Minor:    computePriorityResolution(tasks, "Minor"),
        Cosmetic: computePriorityResolution(tasks, "Cosmetic"),
        ToDo:     computePriorityResolution(tasks, "ToDo"),
        Obsolete: computePriorityResolution(tasks, "Obsolete")
      }
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

// ─── FORMULA IMPLEMENTATIONS ──────────────────────────────────

// PART 1.2 — Stats Schema
function computeFixedFoundRatio(tasks) {
  const found = tasks.filter(t => t.detectado_por !== null && t.detectado_por !== "Unassigned").length;
  const fixed = tasks.filter(t => t.estado === "OK").length;
  return found > 0 ? fixed / found : 0;
}

function computeMemberFoundRate(tasks, member) {
  const total = tasks.filter(t => t.detectado_por !== null).length;
  const personal = tasks.filter(t => t.detectado_por === member).length;
  return total > 0 ? personal / total : 0;
}

function computeMemberFixedOKRate(tasks, member) {
  const total = tasks.filter(t => t.estado === "OK").length;
  const personal = tasks.filter(t => t.resuelto_por === member && t.estado === "OK").length;
  return total > 0 ? personal / total : 0;
}

function computeMemberSupportOKRate(tasks, member) {
  const total = tasks.filter(t => t.estado === "OK").length;
  const personal = tasks.filter(t => t.apoyo === member && t.estado === "OK").length;
  return total > 0 ? personal / total : 0;
}

function computeMemberHoFScore(tasks, member) {
  const fixRate    = computeMemberFixedOKRate(tasks, member);
  const foundRate  = computeMemberFoundRate(tasks, member);
  const supportRate= computeMemberSupportOKRate(tasks, member);
  return (fixRate * 0.5) + (foundRate * 0.3) + (supportRate * 0.2);
}

function computePriorityResolution(tasks, priority) {
  const total  = tasks.filter(t => t.prioridad === priority && t.estado !== "Obsolete").length;
  const solved = tasks.filter(t => t.prioridad === priority && t.estado === "OK").length;
  return { total, solved, rate: total > 0 ? solved / total : 0 };
}

function computeAllMemberStats(tasks, members) {
  return members.reduce((acc, member) => {
    acc[member] = {
      found:      tasks.filter(t => t.detectado_por === member).length,
      fixed:      tasks.filter(t => t.resuelto_por === member).length,
      fixed_ok:   tasks.filter(t => t.resuelto_por === member && t.estado === 'OK').length,
      support:    tasks.filter(t => t.apoyo === member).length,
      support_ok: tasks.filter(t => t.apoyo === member && t.estado === 'OK').length,
      score:      parseFloat(computeMemberHoFScore(tasks, member).toFixed(4))
    };
    return acc;
  }, {});
}

function computeHallOfFame(tasks, members) {
  const stats = computeAllMemberStats(tasks, members);
  const MEDALS = ['🏆','🥇','🥈','🥉','🎖','🏅'];
  return Object.entries(stats)
    .sort(([,a],[,b]) => b.score - a.score)
    .map(([name, s], i) => ({ rank: i + 1, medal: MEDALS[i] || '', name, score: s.score,
                               found: s.found, fixed_ok: s.fixed_ok, support_ok: s.support_ok }));
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
    const taskIndex = db.tasks.findIndex(t => t.id === taskId);
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

async function archiveTask(taskId) {
  let taskToArchive = null;

  // 1. Remove from active tasks
  await atomicWrite('_data/dashboard_tasks.json', (db) => {
    const idx = db.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) throw new Error(`Tarea #${taskId} no encontrada en activos.`);
    taskToArchive = db.tasks.splice(idx, 1)[0];
    db.last_updated_by = _currentUser?.login || 'Sistema';
    return db;
  }, `chore: archivar tarea #${taskId}`, (local) => local);

  if (!taskToArchive) return;

  // 2. Add to archive
  await atomicWrite('_data/dashboard_tasks_archive.json', (db) => {
    if (!db.tasks.find(t => t.id === taskId)) {
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
    const idx = db.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) throw new Error(`Tarea #${taskId} no encontrada en el archivo.`);
    taskToRestore = db.tasks.splice(idx, 1)[0];
    db.last_updated_by = _currentUser?.login || 'Sistema';
    return db;
  }, `chore: desarchivar tarea #${taskId}`, (local) => local);

  if (!taskToRestore) return;

  // 2. Add back to active tasks
  await atomicWrite('_data/dashboard_tasks.json', (db) => {
    if (!db.tasks.find(t => t.id === taskId)) {
      db.tasks.push(taskToRestore);
    }
    db.last_updated_by = _currentUser?.login || 'Sistema';
    return db;
  }, `chore: tarea #${taskId} restaurada desde el archivo`, (local, remote) => {
     local.tasks = mergeTaskArrays(local.tasks, remote.tasks);
     return local;
  });
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
    _currentUser = result.user;
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
    // Clear both first to avoid mixed sessions
    this.clearAuth();

    if (rememberMe) {
      localStorage.setItem('github_token', cleanToken);
    } else {
      sessionStorage.setItem('gh_access_token', cleanToken);
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
  updateMemberProfile,
  recomputeAndSaveStats,

  // Fórmulas
  computeFixedFoundRatio,
  computeAllMemberStats,
  computeHallOfFame,
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
