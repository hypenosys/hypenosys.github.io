/* HYPENOSYS — DATA MODULE */

async function handleDOMContentLoaded() {
  console.log('[DASHBOARD] Checking auth state...');

  // 1. Check for existing token in storage (Zero URL rule)
  const token = window.githubApi.getAuthToken();

  if (token) {
    try {
      const result = await window.githubApi.validateToken();
      if (result.valid) {
        await initDashboard();
      } else {
        showLockScreen();
      }
    } catch (e) {
      console.error('[DASHBOARD] Auth validation failed:', e);
      showLockScreen();
    }
  } else {
    // JULES-NOTE: GATEKEEPER-REVIEW-NEEDED
    // If the Gatekeeper exchanges the code and returns a token via script/callback,
    // we need to listen for it here. For now, we show the lock screen if no token.
    showLockScreen();
  }
}

function showLockScreen() {
  console.log('[DASHBOARD] Access denied. Showing lock screen.');
  const loginOverlay = document.getElementById('login-overlay');
  if (loginOverlay) loginOverlay.classList.remove('hidden');
}

async function initDashboard() {
  console.log('[DASHBOARD] Initializing Dashboard...');
  window.userReposCache = []; // Reset/init cache

  const user = window.githubApi.user;
  if (!user) {
    document.getElementById('login-overlay').classList.remove('hidden');
    return;
  }

  try {
    // Note: user is already validated by AuthManager/GitHubAPI before getting here
    console.log('[DASHBOARD] Access granted for:', user.login);
    document.getElementById('login-overlay').classList.add('hidden');
    window.currentUser = user.login.toLowerCase();

    await refreshDashboardData();

    // Set default filter to current user if they match
    const memberMatch = MEMBERS.find(m => m.toLowerCase() === window.currentUser ||
                                          (currentProfiles && currentProfiles.members[m] && (currentProfiles.members[m].github_username || currentProfiles.members[m].handle || '').toLowerCase() === window.currentUser));
    if (memberMatch) activeFilter = memberMatch;

    startAutoRefresh();
    renderUserStatus(user);
    setupEventListeners();
    renderDashboard();

    // Background fetch of repos
    window.githubApi.getOrgRepos().then(repos => {
        window.userReposCache = repos;
        console.log('[DASHBOARD] Org repos cached:', repos.length);
    });

  } catch (err) {
    console.error(err);
    document.getElementById('login-overlay').classList.remove('hidden');
  }
}

function startAutoRefresh() {
  setInterval(refreshDashboardData, REFRESH_INTERVAL_MS);
}

/**
 * Migrates tasks from schema 1.0.0 to 1.1.0
 */
function migrateTasks(data) {
    if (!data || !data.schema_version) return data;

    if (data.schema_version === "1.0.0") {
        console.log(`[MIGRATION] Upgrading from ${data.schema_version} to 1.1.0`);

        const tasks = data.tasks || [];
        tasks.forEach(task => {
            // Backfill title from descripcion
            if (!task.title) {
                let desc = task.descripcion || "";
                let title = desc.substring(0, 60);
                if (desc.length > 60) {
                    const lastSpace = title.lastIndexOf(' ');
                    if (lastSpace > 0) {
                        title = title.substring(0, lastSpace);
                    }
                }
                task.title = title.trim() || "Sin título";
            }

            // Defaults for new fields
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

            // Migrate dependencies from comentario
            if (task.comentario) {
                const blockedByRegex = /#BLOCKED_BY:(\d+)/g;
                let match;
                while ((match = blockedByRegex.exec(task.comentario)) !== null) {
                    if (!task.blocked_by.includes(match[1])) {
                        task.blocked_by.push(match[1]);
                    }
                }

                const blocksRegex = /#BLOCKS:(\d+)/g;
                while ((match = blocksRegex.exec(task.comentario)) !== null) {
                    if (!task.blocks.includes(match[1])) {
                        task.blocks.push(match[1]);
                    }
                }

                // Strip tokens from comentario
                task.comentario = task.comentario
                    .replace(/#BLOCKED_BY:\d+/g, '')
                    .replace(/#BLOCKS:\d+/g, '')
                    .trim();
            }
        });

        data.schema_version = "1.1.0";
    }
    return data;
}

async function refreshDashboardData() {
  try {
    const [tasksRes, archiveRes, statsRes, budgetRes, profilesRes] = await Promise.all([
      window.githubApi.fetchFileWithSha('_data/dashboard_tasks.json'),
      window.githubApi.fetchFileWithSha('_data/dashboard_tasks_archive.json'),
      window.githubApi.fetchFileWithSha('_data/studio_stats.json'),
      window.githubApi.fetchFileWithSha('_data/studio_budget.json'),
      window.githubApi.fetchFileWithSha('_data/team_profiles.json')
    ]);

    const migratedTasksData = migrateTasks(tasksRes.content);
    const migratedArchiveData = migrateTasks(archiveRes.content);

    currentTasks    = migratedTasksData.tasks || [];
    archivedTasks   = migratedArchiveData.tasks || [];
    currentStats    = statsRes.content;
    currentBudget   = budgetRes.content;
    currentProfiles = profilesRes.content;

    // Catch-up migration for studio_stats.json
    // Trigger if version is old, or if stats are zeroed out (no computed_at or no members)
    const isStatsEmpty = !currentStats || !currentStats.computed_at || Object.keys(currentStats.members || {}).length === 0;
    if (currentStats && (currentStats.schema_version !== "1.1.0" || isStatsEmpty)) {
        console.log(`[MIGRATION] studio_stats.json needs update (v${currentStats.schema_version}, empty: ${isStatsEmpty}). Triggering recompute...`);
        await window.githubApi.recomputeAndSaveStats(migratedTasksData);
        const freshStats = await window.githubApi.fetchFileWithSha('_data/studio_stats.json');
        currentStats = freshStats.content;
    }

    renderDashboard();

    document.getElementById('last-sync-timestamp').textContent =
      `Última sincronización: ${new Date().toLocaleTimeString('es-ES')}`;

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

document.addEventListener('DOMContentLoaded', handleDOMContentLoaded);
