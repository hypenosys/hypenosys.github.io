/* HYPENOSYS — DATA MODULE */

const ORIGINAL_MEMBERS = ['Axel', 'Alex', 'Dídac', 'Javi', 'Mitxel', 'silmaril464', 'lachicadelaboina', 'spongebob3bray'];
const ORIGINAL_MEMBER_MAPPING = {
    'axlfc': 'Axel',
    'topperh4rley': 'Alex',
    'javi26031994-a11y': 'Javi',
    'dkdidac-design': 'Dídac',
    'mitxel2022': 'Mitxel',
    'silmaril464': 'Alex',
    'lachicadelaboina': 'Laura',
    'spongebob3bray': 'Bray'
};

function loadWorkspaceMembers() {
    const ws = window.githubApi.getActiveWorkspace();
    if (ws === 'personal') {
        const username = window.currentUser || 'usuario';
        const displayName = window.currentUser ? (window.currentUser.charAt(0).toUpperCase() + window.currentUser.slice(1)) : 'Usuario';

        MEMBERS.length = 0;
        MEMBERS.push(displayName);

        for (const key in MEMBER_MAPPING) delete MEMBER_MAPPING[key];
        MEMBER_MAPPING[username] = displayName;
    } else {
        const org = (typeof __workspaces__ !== 'undefined' ? __workspaces__ : []).find(w => w.id === ws);
        if (org && org.members && Array.isArray(org.members)) {
            MEMBERS.length = 0;
            for (const key in MEMBER_MAPPING) delete MEMBER_MAPPING[key];

            const lowerMembers = org.members.map(m => m.toLowerCase());
            for (const username in ORIGINAL_MEMBER_MAPPING) {
                if (lowerMembers.includes(username.toLowerCase())) {
                    const disp = ORIGINAL_MEMBER_MAPPING[username];
                    MEMBERS.push(disp);
                    MEMBER_MAPPING[username] = disp;
                }
            }
        } else {
            MEMBERS.length = 0;
            ORIGINAL_MEMBERS.forEach(m => MEMBERS.push(m));

            for (const key in MEMBER_MAPPING) delete MEMBER_MAPPING[key];
            for (const key in ORIGINAL_MEMBER_MAPPING) MEMBER_MAPPING[key] = ORIGINAL_MEMBER_MAPPING[key];
        }
    }
}

async function initDashboard() {
  if (window._dashboardInitialized) {
      console.warn('[DASHBOARD] initDashboard called twice — ignoring.');
      return;
  }
  window._dashboardInitialized = true;

  console.log('[DASHBOARD] Initializing Dashboard...');
  window.userReposCache = [];

  const token = window.githubApi.getAuthToken();
  if (!token) {
    console.log('[DASHBOARD] No token found during init.');
    document.getElementById('login-overlay').classList.remove('hidden');
    return;
  }

  try {
    const { valid, user } = await window.githubApi.validateToken();
    if (!valid) {
        console.log('[DASHBOARD] Token validation failed or unauthorized.');
        if (user) {
            document.getElementById('unauthorized-msg').textContent = `Tu cuenta de GitHub (${user.login}) no pertenece al equipo de Hypenosys.`;
            document.getElementById('unauthorized-overlay').classList.remove('hidden');
        } else {
            document.getElementById('login-overlay').classList.remove('hidden');
        }
        return;
    }

    console.log('[DASHBOARD] Access granted for:', user.login);
    document.getElementById('login-overlay').classList.add('hidden');
    window.currentUser = user.login.toLowerCase();

    loadWorkspaceMembers();
    await refreshDashboardData();

    const memberMatch = MEMBERS.find(m => m.toLowerCase() === window.currentUser ||
                                          (currentProfiles && currentProfiles.members[m] && currentProfiles.members[m].github_username.toLowerCase() === window.currentUser));
    if (memberMatch) activeFilter = memberMatch;

    startAutoRefresh();
    renderUserStatus(user);
    setupEventListeners();
    renderDashboard();

    window.githubApi.getOrgRepos().then(repos => {
        window.userReposCache = repos;
        console.log('[DASHBOARD] Org repos cached:', repos.length);
    });

  } catch (err) {
    console.error('[DASHBOARD] Init error:', err);
    window._dashboardInitialized = false; // reset para permitir reintento
    document.getElementById('login-overlay').classList.remove('hidden');
  }
}

function startAutoRefresh() {
  setInterval(refreshDashboardData, REFRESH_INTERVAL_MS);
}

const activeMigrations = new Map();

/**
 * Pure function to transform task schemas from 1.0.0/1.1.0 to 1.2.0
 */
function migrateTasksSchema(data) {
    if (!data || !data.schema_version) {
        return {
            content: data,
            changed: false,
            previousVersion: null,
            targetVersion: '1.2.0'
        };
    }

    // Safe deep clone
    let cloned;
    try {
        if (typeof structuredClone === 'function') {
            cloned = structuredClone(data);
        } else {
            cloned = JSON.parse(JSON.stringify(data));
        }
    } catch (e) {
        console.error('[MIGRATION] Failed to clone data:', e);
        return {
            content: data,
            changed: false,
            previousVersion: null,
            targetVersion: '1.2.0'
        };
    }

    const version = cloned.schema_version;
    if (version !== "1.0.0" && version !== "1.1.0") {
        return {
            content: cloned,
            changed: false,
            previousVersion: null,
            targetVersion: '1.2.0'
        };
    }

    const tasks = cloned.tasks || [];
    tasks.forEach(task => {
        if (!task.title) {
            let desc = task.descripcion || "";
            let title = desc.substring(0, 60);
            if (desc.length > 60) {
                const lastSpace = title.lastIndexOf(' ');
                if (lastSpace > 0) title = title.substring(0, lastSpace);
            }
            task.title = title.trim() || "Sin título";
        }

        if (task.due_date === undefined) task.due_date = task.limite || null;
        if (task.start_date === undefined) task.start_date = null;
        if (task.estimated_hours === undefined) task.estimated_hours = null;
        if (task.story_points === undefined) task.story_points = null;
        if (task.task_type === undefined) task.task_type = "feature";
        if (task.tags === undefined) task.tags = [];
        if (task.blocks === undefined) task.blocks = [];
        if (task.blocked_by === undefined) task.blocked_by = [];
        if (task.acceptance_criteria === undefined) task.acceptance_criteria = "";
        if (task.external_links === undefined) task.external_links = [];
        if (task.subtasks === undefined) task.subtasks = [];
        if (task.comments === undefined) task.comments = [];
        if (task.change_log === undefined) task.change_log = [];

        // New fields for 1.2.0
        if (task.jules_session === undefined) task.jules_session = null;
        if (task.repository === undefined) task.repository = "";
        if (task.branch === undefined) task.branch = "Programación (PRO)";

        if (task.comentario) {
            const blockedByRegex = /#BLOCKED_BY:(\d+)/g;
            let match;
            while ((match = blockedByRegex.exec(task.comentario)) !== null) {
                const idStr = String(match[1]);
                if (!task.blocked_by.includes(idStr)) task.blocked_by.push(idStr);
            }
            const blocksRegex = /#BLOCKS:(\d+)/g;
            while ((match = blocksRegex.exec(task.comentario)) !== null) {
                const idStr = String(match[1]);
                if (!task.blocks.includes(idStr)) task.blocks.push(idStr);
            }
            task.comentario = task.comentario
                .replace(/#BLOCKED_BY:\d+/g, '')
                .replace(/#BLOCKS:\d+/g, '')
                .trim();
        }
    });

    cloned.schema_version = "1.2.0";

    return {
        content: cloned,
        changed: true,
        previousVersion: version,
        targetVersion: '1.2.0'
    };
}

/**
 * Path-aware schema migration wrapper. Uses a local activeMigrations Map to prevent concurrent overlapping executions on the same file path.
 */
async function migrateTasks(data, filePath) {
    if (!filePath) {
        console.error('[MIGRATION] Cannot run migration: filePath is missing.');
        return data;
    }

    // Preliminary check to avoid entering write flow if not needed
    const preCheck = migrateTasksSchema(data);
    if (!preCheck.changed) {
        // No migration needed
        return preCheck.content;
    }

    // Check if migration is already in flight for this filePath
    if (activeMigrations.has(filePath)) {
        console.log(`[MIGRATION] Migration already in progress for ${filePath}, waiting/reusing promise...`);
        return activeMigrations.get(filePath);
    }

    const migrationPromise = (async () => {
        try {
            console.log(`[MIGRATION] Starting schema migration for ${filePath} from ${preCheck.previousVersion} to 1.2.0...`);

            // atomicWrite will fetch the freshest remoteContent and execute mutatorFn.
            // Our mutatorFn will call migrateTasksSchema on that fresh remote content.
            const result = await window.githubApi.atomicWrite(
                filePath,
                (remoteContent) => {
                    const migration = migrateTasksSchema(remoteContent);
                    return {
                        content: migration.content,
                        changed: migration.changed
                    };
                },
                `chore: migrate ${filePath} to schema 1.2.0`,
                { recomputeStats: false }
            );

            if (result.success && result.changed) {
                console.log(`[MIGRATION] Successfully persisted migration for ${filePath}`);
                if (window.hypeToast) {
                    window.hypeToast(`Schema migrado en ${filePath}: ${result.content.tasks.length} tareas actualizadas`, 'success');
                }
            } else {
                console.log(`[MIGRATION] Migration was a no-op or already applied by another tab for ${filePath}`);
            }

            return result.content;
        } catch (err) {
            console.error(`[MIGRATION] Failed to persist migration for ${filePath}:`, err);
            // Fallback to locally migrated data if saving fails, so the app can still try to render
            return preCheck.content;
        }
    })();

    activeMigrations.set(filePath, migrationPromise);

    try {
        return await migrationPromise;
    } finally {
        activeMigrations.delete(filePath);
    }
}

/**
 * Loads data from localStorage if available to provide immediate feedback (Stale-While-Revalidate).
 */
function loadCachedData() {
    loadWorkspaceMembers();
    const ws = window.githubApi.getActiveWorkspace();
    try {
        const cachedTasks = localStorage.getItem(`hy_cache_tasks_${ws}`);
        const cachedArchive = localStorage.getItem(`hy_cache_archive_${ws}`);
        const cachedStats = localStorage.getItem(`hy_cache_stats_${ws}`);
        const cachedBudget = localStorage.getItem(`hy_cache_budget_${ws}`);
        const cachedProfiles = localStorage.getItem(`hy_cache_profiles_${ws}`);

        if (cachedTasks) currentTasks = JSON.parse(cachedTasks) || [];
        if (cachedArchive) archivedTasks = JSON.parse(cachedArchive) || [];
        if (cachedStats) currentStats = JSON.parse(cachedStats) || { schema_version: '1.1.0', computed_at: '', global: {}, members: {}, group: {} };
        if (cachedBudget) currentBudget = JSON.parse(cachedBudget) || { monthly_records: [], burnout: { current_milestone: 'M1', milestones: [{ id: 'M1', date_start: '2025-01-01', date_end: '2025-02-15' }] } };
        if (cachedProfiles) currentProfiles = JSON.parse(cachedProfiles);

        if (cachedTasks || cachedArchive || cachedStats || cachedBudget || cachedProfiles) {
            console.log('[DASHBOARD] Loaded initial data from cache.');
            renderDashboard();
        }
    } catch (e) {
        console.warn('[DASHBOARD] Failed to load cached data:', e);
    }
}

async function refreshDashboardData() {
  loadWorkspaceMembers();
  const ws = window.githubApi.getActiveWorkspace();
  try {
    // Initial cache load for first run
    if (currentTasks.length === 0 && !window._cacheLoaded) {
        loadCachedData();
        window._cacheLoaded = true;
    }

    const [tasksRes, archiveRes, statsRes, budgetRes, profilesRes] = await Promise.all([
      window.githubApi.fetchFileWithSha('_data/dashboard_tasks.json'),
      window.githubApi.fetchFileWithSha('_data/dashboard_tasks_archive.json'),
      window.githubApi.fetchFileWithSha('_data/studio_stats.json'),
      window.githubApi.fetchFileWithSha('_data/studio_budget.json'),
      fetch('/assets/data/team_profiles.json').then(res => res.json().then(data => ({ content: data })))
    ]);

    const migratedTasksData = await migrateTasks(tasksRes.content, '_data/dashboard_tasks.json');
    const migratedArchiveData = await migrateTasks(archiveRes.content, '_data/dashboard_tasks_archive.json');

    const newTasks = (migratedTasksData && migratedTasksData.tasks) || [];
    const newArchive = (migratedArchiveData && migratedArchiveData.tasks) || [];
    const newStats = statsRes.content || { schema_version: '1.1.0', computed_at: '', global: {}, members: {}, group: {} };
    const newBudget = budgetRes.content || { monthly_records: [], burnout: { current_milestone: 'M1', milestones: [{ id: 'M1', date_start: '2025-01-01', date_end: '2025-02-15' }] } };
    const newProfiles = profilesRes.content;

    let filteredTasks = newTasks;
    let filteredArchive = newArchive;
    if (ws !== 'personal') {
        filteredTasks = newTasks.filter(t => t.organizationId === ws);
        filteredArchive = newArchive.filter(t => t.organizationId === ws);
    }

    // Check if data actually changed to avoid redundant renders
    const dataString = JSON.stringify({ filteredTasks, filteredArchive, newStats, newBudget, newProfiles });
    if (window._lastDataString === dataString) {
        console.log('[DASHBOARD] Data unchanged, skipping render.');
        return;
    }
    window._lastDataString = dataString;

    currentTasks    = filteredTasks;
    archivedTasks   = filteredArchive;
    currentStats    = newStats;
    currentBudget   = newBudget;
    currentProfiles = newProfiles;

    // Persist to cache
    localStorage.setItem(`hy_cache_tasks_${ws}`, JSON.stringify(currentTasks));
    localStorage.setItem(`hy_cache_archive_${ws}`, JSON.stringify(archivedTasks));
    localStorage.setItem(`hy_cache_stats_${ws}`, JSON.stringify(currentStats));
    localStorage.setItem(`hy_cache_budget_${ws}`, JSON.stringify(currentBudget));
    localStorage.setItem(`hy_cache_profiles_${ws}`, JSON.stringify(currentProfiles));

    const isStatsEmpty = !currentStats || !currentStats.computed_at || Object.keys(currentStats.members || {}).length === 0;
    if (currentStats && (currentStats.schema_version !== "1.1.0" || isStatsEmpty)) {
        console.log(`[MIGRATION] studio_stats.json needs update. Triggering recompute...`);
        await window.githubApi.recomputeAndSaveStats(migratedTasksData);
        const freshStats = await window.githubApi.fetchFileWithSha('_data/studio_stats.json');
        currentStats = freshStats.content;
        localStorage.setItem('hy_cache_stats', JSON.stringify(currentStats));
    }

    renderDashboard();

    const tsEl = document.getElementById('last-sync-timestamp');
    if (tsEl) tsEl.textContent = `Última sincronización: ${new Date().toLocaleTimeString('es-ES')}`;

  } catch (err) {
    let msg = `Error de sincronización: ${err.message}`;
    if (err.message.includes('401')) msg = "Token inválido o expirado. Por favor, vuelve a iniciar sesión.";
    if (err.message.includes('403')) msg = "Sin permisos de escritura en el repositorio.";
    if (err.message.includes('404')) msg = "Archivo no encontrado en el repositorio.";
    if (err.message.includes('409')) msg = "Conflicto detectado — ejecutando sincronización automática...";
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') msg = "Error de red — comprueba tu conexión e inténtalo de nuevo.";
    showToast(msg, 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
        // Handle OAuth callback immediately — do not wait for authReady
        console.log('[DASHBOARD] OAuth code detected on DOMContentLoaded. Handling immediately...');

        // Evitar que AuthManager procese el mismo código simultáneamente
        if (window._oauthExchanging) return;
        window._oauthExchanging = true;

        // Limpiar URL inmediatamente para evitar re-procesamientos
        window.history.replaceState({}, document.title, window.location.pathname);

        const loginOverlay = document.getElementById('login-overlay');
        if (loginOverlay) {
            loginOverlay.classList.remove('hidden');
            const statusMsg = loginOverlay.querySelector('p');
            if (statusMsg) statusMsg.textContent = 'Autenticando con GitHub...';
        }
        try {
            const result = await window.githubApi.exchangeCodeForToken(code);
            if (result.valid) {
                await initDashboard();
                // BUG 1 Fix: Explicit call after initDashboard
                renderUserStatus(result.user);
            } else {
                throw new Error(result.user ? 'No autorizado' : 'Token inválido');
            }
        } catch (err) {
            console.error('[DASHBOARD] OAuth Error:', err);

            // Si hay un error, mostramos el toast y redirigimos tras un breve delay
            if (window.hypeToast) {
                window.hypeToast('Error de autenticación: ' + err.message, 'error');
            } else {
                alert('Error de autenticación: ' + err.message);
            }

            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        }
    } else {
        // Proactive session restoration
        const token = window.githubApi.getAuthToken();
        if (token) {
            console.log('[DASHBOARD] Existing token found. Validating...');
            try {
                const { valid, user } = await window.githubApi.validateToken();
                if (valid) {
                    await initDashboard();
                    // BUG 1 Fix: Ensure renderUserStatus is called after initDashboard
                    renderUserStatus(user);
                } else {
                    console.warn('[DASHBOARD] Session restoration failed validation.');
                    document.getElementById('login-overlay').classList.remove('hidden');
                }
            } catch (err) {
                console.error('[DASHBOARD] Session restoration error:', err);
                document.getElementById('login-overlay').classList.remove('hidden');
            }
        } else {
            // No code, no token — wait for authReady as fallback
            document.addEventListener('authReady', async (event) => {
                console.log('[DASHBOARD] authReady received. Starting initialization...');
                if (!window._dashboardInitialized) {
                    await initDashboard();
                    // BUG 1 Fix: Explicit call after initDashboard
                    if (event.detail && event.detail.user) {
                        renderUserStatus(event.detail.user);
                    } else if (window.githubApi.user) {
                        renderUserStatus(window.githubApi.user);
                    }
                }
            });
        }
    }
});
