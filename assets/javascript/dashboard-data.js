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

/* HYPENOSYS — DATA MODULE */

async function handleDOMContentLoaded() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');

  if (code) {
    console.log('[DASHBOARD] OAuth code detected. Handling callback...');
    const loginOverlay = document.getElementById('login-overlay');
    loginOverlay.classList.remove('hidden');

    // Save original HTML if needed, but we just want to show progress
    const statusMsg = loginOverlay.querySelector('p');
    if (statusMsg) statusMsg.textContent = 'Autenticando con GitHub...';

    try {
      const result = await window.githubApi.exchangeCodeForToken(code);
      if (result.valid) {
          window.history.replaceState({}, document.title, window.location.pathname);
          await initDashboard();
      } else {
          throw new Error('No autorizado');
      }
    } catch (err) {
      console.error('[DASHBOARD] OAuth Error:', err);
      showToast('Error de autenticación: ' + err.message, 'error');
      loginOverlay.classList.remove('hidden');
    }
  } else {
    await initDashboard();
  }
}

async function initDashboard() {
  console.log('[DASHBOARD] Initializing Dashboard...');
  window.userReposCache = []; // Reset/init cache
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

    // Set default filter to current user if they match
    const memberMatch = MEMBERS.find(m => m.toLowerCase() === window.currentUser ||
                                          (currentProfiles && currentProfiles.members[m] && currentProfiles.members[m].handle.toLowerCase() === window.currentUser));
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
