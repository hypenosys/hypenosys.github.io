/* HYPENOSYS — DATA MODULE */

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

/**
 * Migrates tasks from schema 1.0.0 to 1.2.0
 */
async function migrateTasks(data) {
    if (!data || !data.schema_version) return data;
    let isDirty = false;

    if (data.schema_version === "1.0.0" || data.schema_version === "1.1.0") {
        console.log(`[MIGRATION] Upgrading from ${data.schema_version} to 1.2.0`);
        isDirty = true;

        const tasks = data.tasks || [];
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
                    if (!task.blocked_by.includes(match[1])) task.blocked_by.push(match[1]);
                }
                const blocksRegex = /#BLOCKS:(\d+)/g;
                while ((match = blocksRegex.exec(task.comentario)) !== null) {
                    if (!task.blocks.includes(match[1])) task.blocks.push(match[1]);
                }
                task.comentario = task.comentario
                    .replace(/#BLOCKED_BY:\d+/g, '')
                    .replace(/#BLOCKS:\d+/g, '')
                    .trim();
            }
        });

        data.schema_version = "1.2.0";
    }

    if (isDirty) {
        try {
            console.log(`[MIGRATION] Persisting schema changes to GitHub...`);
            await window.githubApi.atomicWrite('_data/dashboard_tasks.json', data, `chore: migrate dashboard_tasks.json to schema 1.2.0`);
            if (window.hypeToast) {
                window.hypeToast(`Schema migrado: ${data.tasks.length} tareas actualizadas`, 'success');
            }
        } catch (err) {
            console.error(`[MIGRATION] Failed to persist migration:`, err);
        }
    }

    return data;
}

/**
 * Loads data from localStorage if available to provide immediate feedback (Stale-While-Revalidate).
 */
function loadCachedData() {
    try {
        const cachedTasks = localStorage.getItem('hy_cache_tasks');
        const cachedArchive = localStorage.getItem('hy_cache_archive');
        const cachedStats = localStorage.getItem('hy_cache_stats');
        const cachedBudget = localStorage.getItem('hy_cache_budget');
        const cachedProfiles = localStorage.getItem('hy_cache_profiles');

        if (cachedTasks) currentTasks = JSON.parse(cachedTasks);
        if (cachedArchive) archivedTasks = JSON.parse(cachedArchive);
        if (cachedStats) currentStats = JSON.parse(cachedStats);
        if (cachedBudget) currentBudget = JSON.parse(cachedBudget);
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

    const migratedTasksData = await migrateTasks(tasksRes.content);
    const migratedArchiveData = await migrateTasks(archiveRes.content);

    const newTasks = migratedTasksData.tasks || [];
    const newArchive = migratedArchiveData.tasks || [];
    const newStats = statsRes.content;
    const newBudget = budgetRes.content;
    const newProfiles = profilesRes.content;

    // Check if data actually changed to avoid redundant renders
    const dataString = JSON.stringify({ newTasks, newArchive, newStats, newBudget, newProfiles });
    if (window._lastDataString === dataString) {
        console.log('[DASHBOARD] Data unchanged, skipping render.');
        return;
    }
    window._lastDataString = dataString;

    currentTasks    = newTasks;
    archivedTasks   = newArchive;
    currentStats    = newStats;
    currentBudget   = newBudget;
    currentProfiles = newProfiles;

    // Persist to cache
    localStorage.setItem('hy_cache_tasks', JSON.stringify(currentTasks));
    localStorage.setItem('hy_cache_archive', JSON.stringify(archivedTasks));
    localStorage.setItem('hy_cache_stats', JSON.stringify(currentStats));
    localStorage.setItem('hy_cache_budget', JSON.stringify(currentBudget));
    localStorage.setItem('hy_cache_profiles', JSON.stringify(currentProfiles));

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
