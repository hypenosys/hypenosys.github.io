/* ════════════════════════════════════════
   JULES PANEL SESSIONS & HISTORY
   ════════════════════════════════════════ */

// Centralized request generation & cancellation
window.julesRequestGeneration = 0;
window.activeJulesAbortController = null;

function invalidateJulesRequests() {
    window.julesRequestGeneration++;
    if (window.activeJulesAbortController) {
        try {
            window.activeJulesAbortController.abort();
        } catch(e) {
            console.warn("[JULES-CANCEL] Error aborting in-flight request:", e);
        }
    }
    window.activeJulesAbortController = null;
    window.isJulesRefreshInFlight = false;
}
window.invalidateJulesRequests = invalidateJulesRequests;

// Centralized Auth State for Jules API
window.julesApiAuthState = 'none'; // 'none', 'configured', 'verifying', 'authenticated', 'unauthorized'

// Centralized UI State Trackers
window.currentJulesState = 'loading';

function updateConfigCardStateIndicator() {
    if (typeof window.updateJulesApiKeyStateIndicator === 'function') {
        window.updateJulesApiKeyStateIndicator(window.julesApiAuthState);
    }
}
window.updateConfigCardStateIndicator = updateConfigCardStateIndicator;

function setJulesDashboardState(state, errorDetail = null) {
    window.currentJulesState = state;
    console.log("[JULES-STATE] Transitioning to:", state, errorDetail ? "(" + errorDetail + ")" : "");

    // Clear loading skeletons if not in loading state
    if (state !== 'loading') {
        document.querySelectorAll('.skeleton, .skeleton-stat').forEach(el => {
            el.classList.remove('skeleton', 'skeleton-stat', 'skeleton-text');
        });
    }

    const tbody = $('history-tbody');
    const list = $('repo-list');
    const label = $('repo-label');
    const activeProfileBtn = $('active-profile-btn');

    // Update config card state indicator in view-config if visible
    updateConfigCardStateIndicator();

    const updateMetricsPlaceholder = (val) => {
        if ($('m-active')) $('m-active').innerText = val;
        if ($('m-total')) $('m-total').innerText = val;
        if ($('m-repos')) $('m-repos').innerText = val;
        if ($('m-branches')) $('m-branches').innerText = val;
        if ($('m-success-rate')) $('m-success-rate').innerText = val;
    };

    const emptyMetricsDonutAndTimeline = () => {
        if ($('donut-done')) $('donut-done').setAttribute('stroke-dasharray', '0 100');
        if ($('donut-running')) $('donut-running').setAttribute('stroke-dasharray', '0 100');
        if ($('donut-error')) $('donut-error').setAttribute('stroke-dasharray', '0 100');
        if ($('donut-pending')) $('donut-pending').setAttribute('stroke-dasharray', '0 100');
        if ($('leg-done')) $('leg-done').innerText = '0';
        if ($('leg-running')) $('leg-running').innerText = '0';
        if ($('leg-error')) $('leg-error').innerText = '0';
        if ($('leg-pending')) $('leg-pending').innerText = '0';
        if ($('bar-sessions')) $('bar-sessions').innerHTML = '';
        if ($('token-timeline')) $('token-timeline').innerHTML = '';
    };

    if (state === 'pending-config') {
        updateMetricsPlaceholder('—');
        emptyMetricsDonutAndTimeline();

        // 1. History Table pending configuration row
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="notif-empty" style="padding: 40px; text-align: center;">' +
                '<div style="color: var(--amber); margin-bottom: 12px; font-weight: 600; font-size: 14px;"><i class="fas fa-exclamation-triangle mr-2"></i> Configuración de Jules Pendiente</div>' +
                '<div style="font-size: 11px; color: var(--text3); margin-bottom: 16px; max-width: 340px; margin-left: auto; margin-right: auto; line-height: 1.5;">' +
                'Para ver el historial de sesiones y sincronizar con Jules, introduce tu Jules API Key en la pestaña de Configuración.' +
                '</div>' +
                '<button class="btn btn-primary btn-sm" id="btn-configurar-jules-pending" style="display: inline-flex; align-items: center; gap: 8px; margin: 0 auto;">' +
                '<i class="fas fa-cog"></i> Configurar Jules' +
                '</button>' +
                '</td></tr>';

            const btn = document.getElementById('btn-configurar-jules-pending');
            if (btn) {
                btn.addEventListener('click', () => {
                    if (window.authManager && typeof window.authManager.showApiConfigModal === 'function') {
                        window.authManager.showApiConfigModal();
                    }
                });
            }
        }

        // 2. Repo List pending configuration notice
        if (list) {
            list.innerHTML = '<div class="notif-empty" style="font-size: 11px; padding: 20px; color: var(--text3); text-align: center; line-height: 1.5;">' +
                '<i class="fas fa-key mr-2" style="color:var(--amber)"></i> Jules requiere API Key<br>' +
                '<span style="font-size: 9px; opacity:0.7">Configura la clave para cargar repos</span>' +
                '</div>';
        }
        if (label) {
            label.innerText = 'Sin configurar';
        }
    }

    else if (state === 'unauthorized') {
        updateMetricsPlaceholder('—');
        emptyMetricsDonutAndTimeline();

        // 1. History Table unauthorized row
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="notif-empty" style="padding: 40px; text-align: center;">' +
                '<div style="color: var(--red); margin-bottom: 12px; font-weight: 600; font-size: 14px;"><i class="fas fa-shield-alt mr-2"></i> Credenciales de Jules Inválidas (401/403)</div>' +
                '<div style="font-size: 11px; color: var(--text3); margin-bottom: 16px; max-width: 340px; margin-left: auto; margin-right: auto; line-height: 1.5;">' +
                'La Jules API Key almacenada fue rechazada por el servidor. Por favor, corrígela en la pestaña de Configuración.' +
                '</div>' +
                '<button class="btn btn-primary btn-sm" id="btn-configurar-jules-unauthorized" style="display: inline-flex; align-items: center; gap: 8px; margin: 0 auto;">' +
                '<i class="fas fa-edit"></i> Corregir API Key' +
                '</button>' +
                '</td></tr>';

            const btn = document.getElementById('btn-configurar-jules-unauthorized');
            if (btn) {
                btn.addEventListener('click', () => {
                    if (window.authManager && typeof window.authManager.showApiConfigModal === 'function') {
                        window.authManager.showApiConfigModal();
                    }
                });
            }
        }

        // 2. Repo List unauthorized notice
        if (list) {
            list.innerHTML = '<div class="notif-empty" style="font-size: 11px; padding: 20px; color: var(--text3); text-align: center; line-height: 1.5;">' +
                '<i class="fas fa-times-circle mr-2" style="color:var(--red)"></i> Jules API Key inválida<br>' +
                '<span style="font-size: 9px; opacity:0.7">Corrige la clave para cargar repos</span>' +
                '</div>';
        }
        if (label) {
            label.innerText = 'Error de autenticación';
        }
    }

    else if (state === 'network-error') {
        const hasCache = window.julesSessionsCache && window.julesSessionsCache.length > 0;
        if (!hasCache) {
            updateMetricsPlaceholder('—');
            emptyMetricsDonutAndTimeline();
        }

        if (tbody && !hasCache) {
            tbody.innerHTML = '<tr><td colspan="8" class="notif-empty" style="padding: 40px; text-align: center;">' +
                '<div style="color: var(--amber); margin-bottom: 12px; font-weight: 600; font-size: 14px;"><i class="fas fa-wifi mr-2"></i> Error de Conexión de Red</div>' +
                '<div style="font-size: 11px; color: var(--text3); margin-bottom: 16px; max-width: 340px; margin-left: auto; margin-right: auto; line-height: 1.5;">' +
                'No se pudo conectar con el servicio de Jules. Verifica tu conexión de red o firewall.' +
                (errorDetail ? '<br><code style="font-size: 10px; opacity: 0.7;">' + escapeHtml(errorDetail) + '</code>' : '') +
                '</div>' +
                '<button class="btn btn-ghost btn-sm" id="btn-configurar-jules-retry" style="display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--border-accent); margin: 0 auto;">' +
                '<i class="fas fa-sync"></i> Reintentar ahora' +
                '</button>' +
                '</td></tr>';

            const btn = document.getElementById('btn-configurar-jules-retry');
            if (btn) {
                btn.addEventListener('click', () => {
                    if (typeof refreshDashboard === 'function') {
                        refreshDashboard();
                    }
                });
            }
        }
    }

    else if (state === 'rate-limited') {
        const hasCache = window.julesSessionsCache && window.julesSessionsCache.length > 0;
        if (tbody && !hasCache) {
            tbody.innerHTML = '<tr><td colspan="8" class="notif-empty" style="padding: 40px; text-align: center;">' +
                '<div style="color: var(--amber); margin-bottom: 12px; font-weight: 600; font-size: 14px;"><i class="fas fa-hourglass-half mr-2"></i> Límite de Peticiones Alcanzado (429)</div>' +
                '<div style="font-size: 11px; color: var(--text3); margin-bottom: 16px; max-width: 340px; margin-left: auto; margin-right: auto; line-height: 1.5;">' +
                'Has alcanzado el límite de peticiones del servidor. Por favor, espera unos minutos.' +
                '</div>' +
                '</td></tr>';
        }
    }

    else if (state === 'service-error') {
        const hasCache = window.julesSessionsCache && window.julesSessionsCache.length > 0;
        if (tbody && !hasCache) {
            tbody.innerHTML = '<tr><td colspan="8" class="notif-empty" style="padding: 40px; text-align: center;">' +
                '<div style="color: var(--red); margin-bottom: 12px; font-weight: 600; font-size: 14px;"><i class="fas fa-server mr-2"></i> Error del Servicio Jules (5xx)</div>' +
                '<div style="font-size: 11px; color: var(--text3); margin-bottom: 16px; max-width: 340px; margin-left: auto; margin-right: auto; line-height: 1.5;">' +
                'El servicio remoto de Jules experimentó un error interno. Reintentando con backoff controlado.' +
                (errorDetail ? '<br><code style="font-size: 10px; opacity: 0.7;">' + escapeHtml(errorDetail) + '</code>' : '') +
                '</div>' +
                '</td></tr>';
        }
    }

    else if (state === 'empty') {
        updateMetricsPlaceholder('0');
        emptyMetricsDonutAndTimeline();

        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="notif-empty">No hay sesiones recientes</td></tr>';
        }
    }
}
window.setJulesDashboardState = setJulesDashboardState;

// Exponential Backoff retry state
window.julesBackoffDelay = 5000;
let julesRetryTimeoutId = null;

function scheduleJulesRetry(delayOverride = null) {
    // Stop standard polling before scheduling retry
    if (typeof window.stopJulesPolling === 'function') {
        window.stopJulesPolling();
    }

    clearJulesRetry();

    let delay = delayOverride !== null ? delayOverride : window.julesBackoffDelay;
    if (delay < 5000) delay = 5000;

    console.log("[JULES-RETRY] Scheduling retry in", delay / 1000, "seconds");
    julesRetryTimeoutId = setTimeout(() => {
        if (typeof refreshDashboard === 'function') {
            refreshDashboard();
        }
    }, delay);

    // Exponential backoff strategy up to max 60s (only step up if not overridden)
    if (delayOverride === null) {
        if (window.julesBackoffDelay === 5000) window.julesBackoffDelay = 15000;
        else if (window.julesBackoffDelay === 15000) window.julesBackoffDelay = 30000;
        else window.julesBackoffDelay = 60000;
    }
}

function clearJulesRetry() {
    if (julesRetryTimeoutId) {
        clearTimeout(julesRetryTimeoutId);
        julesRetryTimeoutId = null;
    }
}
window.scheduleJulesRetry = scheduleJulesRetry;
window.clearJulesRetry = clearJulesRetry;

function resetJulesBackoff() {
    window.julesBackoffDelay = 5000;
    clearJulesRetry();
}

function loadCachedSessions() {
    try {
        const cached = localStorage.getItem('jules_sessions_cache');
        if (cached) {
            window.julesSessionsCache = JSON.parse(cached);
            console.log("[JULES-SYNC] Loading sessions from cache...");
            renderMetrics();
            renderHistoryTable(window.julesSessionsCache);
            updateKanbanCounts(window.julesSessionsCache);
            updateNeuralHistory(window.julesSessionsCache);
            if (typeof window.renderKanban === 'function') {
                window.renderKanban(window.julesSessionsCache);
            }
        }
    } catch (e) {
        console.warn("[JULES-SYNC] Failed to load cached sessions:", e);
    }
}

window.isJulesRefreshInFlight = false;

async function performDashboardRefresh() {
    const key = typeof window.getJulesApiKey === 'function' ? window.getJulesApiKey() : '';
    if (typeof window.isJulesApiKeyValid === 'function' && !window.isJulesApiKeyValid(key)) {
        console.log("[JULES-COORDINATED] Skipping coordinated fetch: API key missing.");
        window.julesApiAuthState = 'none';
        setJulesDashboardState('pending-config');
        return;
    }

    // Cancel old in-flight fetch and get fresh AbortController & generation ID
    if (window.activeJulesAbortController) {
        try { window.activeJulesAbortController.abort(); } catch(e) {}
    }
    window.activeJulesAbortController = new AbortController();
    const currentGeneration = ++window.julesRequestGeneration;

    window.setJulesDashboardState('loading');
    if (window.julesApiAuthState === 'none' || window.julesApiAuthState === 'unauthorized') {
        window.julesApiAuthState = 'verifying';
        updateConfigCardStateIndicator();
    }

    try {
        console.log("[JULES-COORDINATED] Launching parallel fetch (Gen: " + currentGeneration + ")...");

        // Parallel requests using Promise.allSettled, passing AbortSignal explicitly
        const [sessionsResult, sourcesResult] = await Promise.allSettled([
            window.julesApi.getSessions(100, null, { signal: window.activeJulesAbortController.signal }),
            window.julesApi.getSources({ signal: window.activeJulesAbortController.signal })
        ]);

        // Discard stale responses if generation changed
        if (currentGeneration !== window.julesRequestGeneration) {
            console.log("[JULES-COORDINATED] Discarding stale response from generation " + currentGeneration + " after initial API fetch.");
            return;
        }

        // Evaluate results individually
        let sessionsData = null;
        let sessionsError = null;
        if (sessionsResult.status === 'fulfilled') {
            sessionsData = sessionsResult.value.sessions || [];
        } else {
            sessionsError = sessionsResult.reason;
        }

        let sourcesData = null;
        let sourcesError = null;
        if (sourcesResult.status === 'fulfilled') {
            sourcesData = sourcesResult.value || [];
        } else {
            sourcesError = sourcesResult.reason;
        }

        // Determine if there was an authentication or structural error to propagate
        const firstError = sessionsError || sourcesError;
        if (firstError) {
            throw firstError;
        }

        // Check generation before state modifications
        if (currentGeneration !== window.julesRequestGeneration) return;

        // Successfully loaded! Update state
        window.julesApiAuthState = 'authenticated';
        resetJulesBackoff();

        // Check generation before saving sessions
        if (currentGeneration !== window.julesRequestGeneration) return;

        // 1. Update sessions cache
        window.julesSessionsCache = sessionsData;
        localStorage.setItem('jules_sessions_cache', JSON.stringify(window.julesSessionsCache));

        // 2. Update sources cache and map repos
        if (currentGeneration !== window.julesRequestGeneration) return;
        window.julesSourcesCache = sourcesData;

        let githubRepos = null;
        let fetchGithubSuccess = false;
        try {
            githubRepos = await window.githubApi.getRepos();
            fetchGithubSuccess = true;
        } catch (ghErr) {
            console.warn("[JULES-COORDINATED] GitHub getRepos failed, preserving existing cache and render:", ghErr.message);
        }

        // Check generation immediately after any await
        if (currentGeneration !== window.julesRequestGeneration) {
            console.log("[JULES-COORDINATED] Discarding stale response after GitHub getRepos (Gen: " + currentGeneration + ")");
            return;
        }

        let mappedRepos = [];
        if (fetchGithubSuccess && githubRepos) {
            // Successfully fetched repos from GitHub API
            mappedRepos = githubRepos.map(r => {
                const sourceName = 'sources/github/' + r.full_name;
                const julesSource = sourcesData.find(s => s.name === sourceName || s.name === 'sources/github-' + r.owner + '-' + r.name);
                return {
                    ...r,
                    jules_name: julesSource ? julesSource.name : null,
                    is_installed: !!julesSource
                };
            });
            // ONLY save to cache if GitHub API succeeded
            localStorage.setItem('hy_jules_repo_cache', JSON.stringify({ repos: mappedRepos, ts: Date.now() }));
        } else {
            // FAILED to fetch from GitHub: read the last successfully saved repos from cache
            try {
                const cachedData = localStorage.getItem('hy_jules_repo_cache');
                if (cachedData) {
                    const parsed = JSON.parse(cachedData);
                    mappedRepos = parsed.repos || [];
                    console.log("[JULES-COORDINATED] Successfully read repos from cache to preserve UI stability.");
                }
            } catch (err) {
                console.warn("[JULES-COORDINATED] Failed to read cached repos:", err);
            }
            // Show a non-blocking toast warning about GitHub connectivity
            showToast("Advertencia: No se pudo conectar con GitHub. Mostrando repositorios en caché.", "amber");
        }

        // Check generation before rendering or committing UI state
        if (currentGeneration !== window.julesRequestGeneration) return;

        // Render repositories
        if (typeof window.renderRepos === 'function') {
            window.renderRepos(mappedRepos);
        }

        const activeRepo = localStorage.getItem('hypenosys_active_repo');
        if (activeRepo && typeof window.selectRepo === 'function') {
            // Check if we actually need to load/select this repository context
            const activeCanonical = window.getCanonicalRepoName ? window.getCanonicalRepoName(activeRepo) : activeRepo.toLowerCase();
            const loadedCanonical = window._loadedRepoContext;

            const branchSelect = document.getElementById('branch-sel') || document.getElementById('branch-selector');
            const branchSelectRepo = branchSelect ? branchSelect.dataset.repo : null;
            const branchSelectHasOptions = branchSelect ? (branchSelect.options.length > 0 && branchSelect.value !== "") : false;
            const branchSelectIsLoadingOrError = branchSelect ? (branchSelect.innerHTML.includes("Cargando") || branchSelect.innerHTML.includes("No se pudieron")) : true;

            const needsSelection = !loadedCanonical ||
                                   loadedCanonical !== activeCanonical ||
                                   branchSelectRepo !== activeCanonical ||
                                   !branchSelectHasOptions ||
                                   branchSelectIsLoadingOrError;

            if (needsSelection) {
                console.log("[JULES-REPO] Selecting and restoring active repository context: " + activeRepo);
                window.selectRepo(activeRepo);
            } else {
                // Ensure only visual selection state is highlighted, without re-loading branches or configuration side-effects
                window.selectRepo(activeRepo, true);
            }
        }

        // Broadcast sessions sync
        try {
            if (!window.neuralSyncChannel) {
                window.neuralSyncChannel = new BroadcastChannel('hypenosys_neural_sessions_sync');
            }
            window.neuralSyncChannel.postMessage({ type: 'sessions-updated', sessions: window.julesSessionsCache });
        } catch(bcErr) {
            console.warn("[JULES-SYNC] Failed to broadcast sessions:", bcErr);
        }

        // Check generation before final state/rendering commits
        if (currentGeneration !== window.julesRequestGeneration) return;

        // Render normal dashboard states
        if (window.julesSessionsCache.length === 0) {
            setJulesDashboardState('empty');
            window._sessionsLoaded = true;

            // Render metrics and Kanban with empty state
            renderMetrics();
            updateKanbanCounts(window.julesSessionsCache);
            updateNeuralHistory(window.julesSessionsCache);
            if (typeof window.renderKanban === 'function') {
                window.renderKanban(window.julesSessionsCache);
            }
            return;
        }

        setJulesDashboardState('ready');
        renderMetrics();
        renderHistoryTable(window.julesSessionsCache);
        updateKanbanCounts(window.julesSessionsCache);
        updateNeuralHistory(window.julesSessionsCache);

        // Render Kanban cards
        if (typeof window.renderKanban === 'function') {
            window.renderKanban(window.julesSessionsCache);
        }
        window._sessionsLoaded = true;

    } catch (e) {
        if (currentGeneration !== window.julesRequestGeneration) {
            return; // Discard error from old generation
        }

        const message = String(e?.message || '');
        const status = Number(e?.httpStatus || 0);

        if (message === 'REQUEST_ABORTED' || message === 'STALE_REQUEST' || e.name === 'AbortError') {
            console.log("[JULES-COORDINATED] Request intentionally aborted or stale. Ignoring and doing nothing.");
            return;
        }

        if (message === 'API_KEY_MISSING') {
            window.julesApiAuthState = 'none';
            setJulesDashboardState('pending-config');
            if (typeof window.stopJulesPolling === 'function') {
                window.stopJulesPolling();
            }
        } else if (message === 'API_KEY_INVALID') {
            window.julesApiAuthState = 'unauthorized';
            setJulesDashboardState('unauthorized');
            if (typeof window.stopJulesPolling === 'function') {
                window.stopJulesPolling();
            }
        } else if (message === 'RATE_LIMIT') {
            setJulesDashboardState('rate-limited');
            scheduleJulesRetry(e.retryAfterMs);
        } else if (status >= 500) {
            setJulesDashboardState('service-error', message);
            scheduleJulesRetry();
        } else if (message === 'TIMEOUT' || e.name === 'TypeError' || message.includes('fetch') || message.includes('Failed to fetch') || message.includes('NetworkError')) {
            setJulesDashboardState('network-error', message);
            scheduleJulesRetry();
        } else {
            // Other remote error
            setJulesDashboardState('service-error', message);
            scheduleJulesRetry();
        }
    } finally {
        // Handled by the refresh coordinator
    }
}

window.__refreshCoordinatorState = window.__refreshCoordinatorState || {
  refreshInFlight: false,
  refreshTimer: null,
  pendingReasons: new Set(),
  trailingRefreshRequested: false,
  currentRefreshPromise: null
};

window.requestDashboardRefresh = function(reason, options = {}) {
    const force = !!options.force;
    const immediate = !!options.immediate;
    const state = window.__refreshCoordinatorState;

    if (reason) {
        state.pendingReasons.add(reason);
    }

    console.log(`[JULES-COORDINATOR] requestDashboardRefresh called. Reason: "${reason}", force: ${force}, immediate: ${immediate}`);

    if (state.refreshInFlight) {
        if (!state.trailingRefreshRequested) {
            console.log("[JULES-COORDINATOR] Refresh in progress. Trailing refresh queued.");
            state.trailingRefreshRequested = true;
        }
        return state.currentRefreshPromise || Promise.resolve();
    }

    if (state.refreshTimer) {
        clearTimeout(state.refreshTimer);
        state.refreshTimer = null;
    }

    const triggerActualRefresh = () => {
        const reasonsStr = Array.from(state.pendingReasons).join(', ');
        state.pendingReasons.clear();
        console.log(`[JULES-COORDINATOR] Executing actual refresh. Reasons: [${reasonsStr}]`);

        state.refreshInFlight = true;
        window.isJulesRefreshInFlight = true;

        const refreshBtn = document.getElementById('btn-refresh-session-history');
        const refreshIcon = document.getElementById('history-refresh-icon');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            if (refreshIcon) refreshIcon.classList.add('fa-spin');
        }

        state.currentRefreshPromise = (async () => {
            try {
                await performDashboardRefresh();

                // Keep the sync polling updated
                if (typeof syncSessionPolling === 'function') {
                    syncSessionPolling();
                }
            } catch (err) {
                console.error("[JULES-COORDINATOR] Error during performDashboardRefresh:", err);
            } finally {
                state.refreshInFlight = false;
                window.isJulesRefreshInFlight = false;
                state.currentRefreshPromise = null;

                if (refreshBtn) {
                    refreshBtn.disabled = false;
                    if (refreshIcon) refreshIcon.classList.remove('fa-spin');
                }

                if (state.trailingRefreshRequested) {
                    state.trailingRefreshRequested = false;
                    console.log("[JULES-COORDINATOR] Executing queued trailing refresh.");
                    setTimeout(() => {
                        window.requestDashboardRefresh('trailing-refresh', { force: true });
                    }, 100);
                }
            }
        })();

        return state.currentRefreshPromise;
    };

    if (immediate || force) {
        return triggerActualRefresh();
    } else {
        return new Promise((resolve) => {
            state.refreshTimer = setTimeout(() => {
                state.refreshTimer = null;
                triggerActualRefresh().then(resolve);
            }, 350);
        });
    }
};

window.refreshJulesDataCoordinated = function() {
    return window.requestDashboardRefresh('legacy-coordinated-refresh');
};

// Compatibility alias
window.refreshDashboard = function() {
    return window.requestDashboardRefresh('legacy-refresh-dashboard');
};

const ACTIVE_SESSION_STATES = new Set(['pending', 'running']); // normalized states

window.syncSessionPolling = function() {
    const sessions = window.julesSessionsCache || [];
    const hasActiveSessions = sessions.some(s =>
        ACTIVE_SESSION_STATES.has(window.normalizeJulesStatus(s.state))
    );

    console.log(`[JULES-POLLING] syncSessionPolling. Active sessions present: ${hasActiveSessions}`);

    if (hasActiveSessions) {
        window.startActiveSessionPolling();
    } else {
        window.stopActiveSessionPolling();
    }
};

window.activeSessionPollInterval = null;
let activeSessionPollAbortController = null;
let isPollActiveSessionInFlight = false;

window.startActiveSessionPolling = function() {
    if (window.activeSessionPollInterval) {
        return; // Already polling
    }

    console.log("[JULES-POLLING] Starting active session polling.");

    window.activeSessionPollInterval = setInterval(async () => {
        // Pause or reduce polling when page is hidden
        if (document.hidden) {
            console.log("[JULES-POLLING] Document hidden, skipping active session polling cycle.");
            return;
        }
        await window.pollActiveSessionStatuses();
    }, 10000); // Poll every 10 seconds

    // Register visibility change listener once
    if (!window._visibilityListenerRegistered) {
        document.addEventListener('visibilitychange', async () => {
            if (!document.hidden && window.activeSessionPollInterval) {
                console.log("[JULES-POLLING] Document became visible, triggering immediate status check.");
                await window.pollActiveSessionStatuses();
            }
        });
        window._visibilityListenerRegistered = true;
    }
};

window.stopActiveSessionPolling = function() {
    if (window.activeSessionPollInterval) {
        console.log("[JULES-POLLING] Stopping active session polling.");
        clearInterval(window.activeSessionPollInterval);
        window.activeSessionPollInterval = null;
    }
    if (activeSessionPollAbortController) {
        activeSessionPollAbortController.abort();
        activeSessionPollAbortController = null;
    }
    isPollActiveSessionInFlight = false;
};

window.pollActiveSessionStatuses = async function() {
    if (isPollActiveSessionInFlight) {
        console.log("[JULES-POLLING] Active session status poll already in progress, skipping.");
        return;
    }

    const key = typeof window.getJulesApiKey === 'function' ? window.getJulesApiKey() : localStorage.getItem('jules_api_key');
    if (typeof window.isJulesApiKeyValid === 'function' && !window.isJulesApiKeyValid(key)) {
        window.stopActiveSessionPolling();
        return;
    }

    const sessions = window.julesSessionsCache || [];
    const activeSessions = sessions.filter(s =>
        ACTIVE_SESSION_STATES.has(window.normalizeJulesStatus(s.state))
    );

    if (activeSessions.length === 0) {
        window.stopActiveSessionPolling();
        return;
    }

    isPollActiveSessionInFlight = true;
    if (activeSessionPollAbortController) {
        activeSessionPollAbortController.abort();
    }
    activeSessionPollAbortController = new AbortController();
    const currentSignal = activeSessionPollAbortController.signal;

    try {
        console.log(`[JULES-POLLING] Checking statuses for ${activeSessions.length} active sessions...`);

        const promises = activeSessions.map(async (sess) => {
            try {
                const freshSess = await window.julesApi.getSession(sess.name);
                return { name: sess.name, fresh: freshSess, success: true };
            } catch (err) {
                console.warn(`[JULES-POLLING] Failed to get session status for ${sess.name}:`, err);
                return { name: sess.name, error: err, success: false };
            }
        });

        const results = await Promise.all(promises);
        if (currentSignal.aborted) return;

        let anyTransitionDetected = false;

        results.forEach((res) => {
            if (!res.success) return;
            const fresh = res.fresh;
            const cachedIndex = window.julesSessionsCache.findIndex(s => s.name === res.name);

            if (cachedIndex !== -1 && fresh && fresh.state) {
                const cached = window.julesSessionsCache[cachedIndex];
                const prevNormalized = window.normalizeJulesStatus(cached.state);
                const nextNormalized = window.normalizeJulesStatus(fresh.state);

                if (cached.state !== fresh.state || prevNormalized !== nextNormalized) {
                    console.log(`[JULES-POLLING] Transition detected for ${res.name}: ${cached.state} -> ${fresh.state}`);
                    anyTransitionDetected = true;
                    window.julesSessionsCache[cachedIndex] = {
                        ...cached,
                        ...fresh
                    };
                }
            }
        });

        if (anyTransitionDetected) {
            localStorage.setItem('jules_sessions_cache', JSON.stringify(window.julesSessionsCache));
            await window.requestDashboardRefresh('active-session-status-transition');
        }

    } catch (err) {
        console.warn("[JULES-POLLING] Polling error:", err);
    } finally {
        isPollActiveSessionInFlight = false;
        window.syncSessionPolling();
    }
};

window._historyControlsInitialized = false;

window.initHistoryControls = function() {
    if (window._historyControlsInitialized) {
        return;
    }

    const refreshBtn = $('btn-refresh-session-history');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            const icon = $('history-refresh-icon');
            if (icon) icon.classList.add('fa-spin');
            refreshBtn.disabled = true;
            try {
                await window.requestDashboardRefresh('manual-session-history-refresh', {
                    force: true,
                    immediate: true
                });
            } catch (err) {
                console.error("[JULES-MANUAL-REFRESH] Manual refresh error:", err);
            } finally {
                if (icon) icon.classList.remove('fa-spin');
                refreshBtn.disabled = false;
            }
        });
    }

    const tblSearch = $('tbl-search');
    if (tblSearch) {
        tblSearch.addEventListener('input', () => {
            if (window.julesSessionsCache) {
                renderHistoryTable(window.julesSessionsCache);
            }
        });
    }

    const filterPillsContainer = $('filter-pills');
    if (filterPillsContainer) {
        filterPillsContainer.addEventListener('click', (e) => {
            const pill = e.target.closest('.fpill');
            if (pill) {
                const allPills = filterPillsContainer.querySelectorAll('.fpill');
                allPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                if (window.julesSessionsCache) {
                    renderHistoryTable(window.julesSessionsCache);
                }
            }
        });
    }

    const limitSelect = $('history-limit-select');
    if (limitSelect) {
        const savedLimit = localStorage.getItem('hypenosys_jules_history_limit');
        if (savedLimit === '5' || savedLimit === '10' || savedLimit === '30') {
            limitSelect.value = savedLimit;
        } else {
            limitSelect.value = '5';
            localStorage.setItem('hypenosys_jules_history_limit', '5');
        }

        limitSelect.addEventListener('change', () => {
            const val = limitSelect.value;
            if (val === '5' || val === '10' || val === '30') {
                localStorage.setItem('hypenosys_jules_history_limit', val);
            } else {
                localStorage.setItem('hypenosys_jules_history_limit', '5');
                limitSelect.value = '5';
            }
            if (window.julesSessionsCache) {
                renderHistoryTable(window.julesSessionsCache);
            }
        });
    }

    window._historyControlsInitialized = true;
};

document.addEventListener('DOMContentLoaded', () => {
    window.initHistoryControls();
});

function renderHistoryTable(sessions) {
    if (typeof window.initHistoryControls === 'function') {
        window.initHistoryControls();
    }

    const tbody = $('history-tbody');
    if (!tbody) return;

    if (!sessions || sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="notif-empty">No hay sesiones recientes</td></tr>';
        const counterEl = $('history-results-count');
        if (counterEl) {
            counterEl.textContent = 'Mostrando 0 de 0 sesiones';
        }
        return;
    }

    // Get filter and search parameters
    const query = ($('tbl-search')?.value || '').toLowerCase().trim();
    const filterPillActive = document.querySelector('#filter-pills .fpill.active');
    const filter = filterPillActive ? (filterPillActive.dataset.filter || 'all') : 'all';

    let filteredSessions = [...sessions];

    // 1. Filter by status pill
    if (filter !== 'all') {
        filteredSessions = filteredSessions.filter(s => window.normalizeJulesStatus(s.state) === filter);
    }

    // 2. Filter by search query
    if (query) {
        filteredSessions = filteredSessions.filter(s => {
            const sid = s.name.split('/').pop().toLowerCase();
            const title = (s.title || s.prompt || '').toLowerCase();
            const prompt = (s.prompt || '').toLowerCase();
            const repo = ((s.sourceContext && s.sourceContext.source) || '').toLowerCase();
            const branch = ((s.sourceContext && s.sourceContext.githubRepoContext && s.sourceContext.githubRepoContext.startingBranch) || '').toLowerCase();
            return sid.includes(query) || title.includes(query) || prompt.includes(query) || repo.includes(query) || branch.includes(query);
        });
    }

    const totalFiltrados = filteredSessions.length;

    // 3. Sort descendently by date
    filteredSessions.sort((a, b) => {
        const getSessionTimestamp = (s) => {
            const dates = [
                s.updatedAt,
                s.updated_at,
                s.updateTime,
                s.createdAt,
                s.created_at,
                s.createTime
            ];
            for (const d of dates) {
                if (d) {
                    const parsed = Date.parse(d);
                    if (!isNaN(parsed)) {
                        return parsed;
                    }
                }
            }
            return 0; // Invalid date goes to the bottom
        };

        const timeA = getSessionTimestamp(a);
        const timeB = getSessionTimestamp(b);

        if (timeA === 0 && timeB === 0) return 0;
        if (timeA === 0) return 1;
        if (timeB === 0) return -1;

        return timeB - timeA;
    });

    // 4. Slice to selected limit
    let limit = 5;
    const savedLimit = localStorage.getItem('hypenosys_jules_history_limit');
    if (savedLimit === '5' || savedLimit === '10' || savedLimit === '30') {
        limit = parseInt(savedLimit, 10);
    } else {
        localStorage.setItem('hypenosys_jules_history_limit', '5');
    }

    const slicedSessions = filteredSessions.slice(0, limit);

    // Update Counter
    const counterEl = $('history-results-count');
    if (counterEl) {
        counterEl.textContent = 'Mostrando ' + slicedSessions.length + ' de ' + totalFiltrados + ' ' + (totalFiltrados === 1 ? 'sesión' : 'sesiones');
    }

    if (slicedSessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="notif-empty">No se encontraron sesiones con los filtros actuales.</td></tr>';
        return;
    }

    tbody.innerHTML = slicedSessions.map(s => {
        const sid = s.name.split('/').pop();
        const repo = (s.sourceContext && s.sourceContext.source && s.sourceContext.source.split('/').pop()) || '---';
        const branch = (s.sourceContext && s.sourceContext.githubRepoContext && s.sourceContext.githubRepoContext.startingBranch) || '---';
        const stateClass = s.state.toLowerCase().replace(/_/g, '-');

        // Calculate Duration
        let duration = '---';
        if (s.createTime && (s.updateTime || s.state === 'COMPLETED')) {
            const start = new Date(s.createTime);
            const end = s.state === 'COMPLETED' ? new Date(s.updateTime || Date.now()) : new Date();
            const diffMs = end - start;
            const diffMins = Math.floor(diffMs / 60000);
            const diffSecs = Math.floor((diffMs % 60000) / 1000);
            duration = diffMins + 'm ' + diffSecs + 's';
        }

        const taskTitle = s.title || s.prompt || 'Sin título';

        return '<tr onclick="handleRowClick(event, \'' + s.name + '\')" data-sid="' + sid + '">' +
               '<td onclick="handleCheckboxClick(event, \'' + sid + '\')">' +
               '<div class="custom-control custom-checkbox">' +
               '<input type="checkbox" class="session-checkbox" data-sid="' + sid + '">' +
               '</div>' +
               '</td>' +
               '<td><span class="sid">#' + sid + '</span></td>' +
               '<td><div class="tdesc" title="' + escapeHtml(taskTitle) + '">' + escapeHtml(taskTitle) + '</div></td>' +
               '<td><div class="tmono">' + repo + '</div></td>' +
               '<td><div class="tmono">' + branch + '</div></td>' +
               '<td><span class="sbadge ' + stateClass + '">' + s.state + '</span></td>' +
               '<td style="color:var(--text3); font-family:var(--font-mono); font-size:11px">' + duration + '</td>' +
               '<td style="font-size:11px; color:var(--text3)">' + getTimeAgo(s.createTime) + '</td>' +
               '</tr>';
    }).join('');

    const skeletons = tbody.querySelectorAll('.skeleton');
    skeletons.forEach(s => s.classList.remove('skeleton', 'skeleton--loading'));
}

function updateNeuralHistory(sessions) {
    const list = $('sb-neural-history-list');
    if (!list) return;

    if (!sessions || sessions.length === 0) {
        list.innerHTML = '<div class="notif-empty" style="font-size: 10px; padding: 10px;">No hay sesiones recientes</div>';
        return;
    }

    list.innerHTML = sessions.map(s => {
        const sid = s.name.split('/').pop();
        const active = sid === localStorage.getItem('hy_neural_session_id');
        const taskTitle = s.title || s.prompt || 'Sin título';
        const repo = (s.sourceContext && s.sourceContext.source && s.sourceContext.source.split('/').pop()) || '---';
        const stateClass = s.state.toLowerCase().replace(/_/g, '-');

        return '<div class="sb-history-item' + (active ? ' active' : '') + '" data-sid="' + sid + '" onclick="selectSession(\'' + s.name + '\')" title="' + escapeHtml(taskTitle) + '">' +
               '<div class="h-task">' + escapeHtml(taskTitle) + '</div>' +
               '<div class="h-meta">' +
               '<span>#' + sid + ' · ' + repo + '</span>' +
               '<span class="sbadge ' + stateClass + '" style="font-size:7px; padding:1px 4px">' + s.state.substring(0,4) + '</span>' +
               '</div>' +
               '</div>';
    }).join('');
}

let lastSelectedIdx = -1;

window.handleRowClick = function(event, sessionName) {
    const sid = sessionName.split('/').pop();
    const rows = Array.from(document.querySelectorAll('#history-tbody tr'));
    const clickedIdx = rows.findIndex(r => r.getAttribute('data-sid') === sid);

    if (event.shiftKey && lastSelectedIdx !== -1) {
        const start = Math.min(clickedIdx, lastSelectedIdx);
        const end = Math.max(clickedIdx, lastSelectedIdx);
        for (let i = start; i <= end; i++) {
            toggleSelection(rows[i].getAttribute('data-sid'), true);
        }
    } else if (event.ctrlKey || event.metaKey) {
        toggleSelection(sid);
    } else {
        // User instruction: Clicking a row selects/deselects it.
        toggleSelection(sid);
        selectSession(sessionName);
    }
    lastSelectedIdx = clickedIdx;
}

window.handleCheckboxClick = function(event, sid) {
    event.stopPropagation();
    toggleSelection(sid);
}

function toggleSelection(sid, forceState = null) {
    const row = document.querySelector('#history-tbody tr[data-sid="' + sid + '"]');
    const checkbox = document.querySelector('.session-checkbox[data-sid="' + sid + '"]');
    const sidebarItem = document.querySelector('.sb-history-item[data-sid="' + sid + '"]');

    const newState = forceState !== null ? forceState : !checkbox.checked;

    if (row) row.classList.toggle('selected', newState);
    if (checkbox) checkbox.checked = newState;
    if (sidebarItem) sidebarItem.classList.toggle('selected', newState);

    updateSelectionUI();
}

function updateSelectionUI() {
    const selected = document.querySelectorAll('.session-checkbox:checked');
    const count = selected.length;

    const toolbar = $('neural-selection-toolbar');
    const countEl = $('selection-count');
    const analyzeBtn = document.querySelector('button[onclick="analyzeSelectedWithClaude()"]');

    if (count > 0) {
        if (toolbar) toolbar.style.display = 'flex';
        if (countEl) countEl.innerText = count;
        if (analyzeBtn) analyzeBtn.disabled = false;
    } else {
        if (toolbar) toolbar.style.display = 'none';
        if (analyzeBtn) analyzeBtn.disabled = true;
    }
}

window.clearHistorySelection = function() {
    document.querySelectorAll('.session-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('#history-tbody tr').forEach(tr => tr.classList.remove('selected'));
    document.querySelectorAll('.sb-history-item').forEach(item => item.classList.remove('selected'));
    updateSelectionUI();
}

window.selectSession = function(sessionName) {
    const sid = sessionName.split('/').pop();

    // Highlight in sidebar
    document.querySelectorAll('.sb-history-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-sid') === sid);
    });

    // Highlight in table if visible
    document.querySelectorAll('#history-tbody tr').forEach(tr => {
        const trSid = tr.getAttribute('data-sid');
        tr.classList.toggle('active-row', trSid === sid);
    });

    // Navigate to Kanban and Highlight
    if (typeof switchView === 'function') {
        switchView('kanban');

        // Wait for view switch and cards to be potentially rendered/available
        setTimeout(() => {
            const card = document.querySelector('.kb-card[data-sid="' + sid + '"]');
            if (card) {
                // Clear previous highlights
                document.querySelectorAll('.kb-card.highlight-focus').forEach(c => c.classList.remove('highlight-focus'));

                // Add focus highlight
                card.classList.add('highlight-focus');

                // Ensure it's visible
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });

                console.log("[JULES-UI] Session #" + sid + " highlighted in Kanban.");
            } else {
                console.warn("[JULES-UI] Could not find card for #" + sid + " in Kanban view.");
            }
        }, 300);
    }

    openDrawer(sessionName);
}

function updateKanbanCounts(sessions) {
    const counts = { pending: 0, running: 0, done: 0, error: 0 };
    const localOverrides = JSON.parse(localStorage.getItem('jules_kanban_overrides') || '{}');

    // Apply user filter if applicable
    const currentUser = window.githubApi.user;
    const filtered = sessions.filter(s => {
        if (!currentUser) return true;
        // Basic check: if no ownership field, keep it
        const login = currentUser.login.toLowerCase().trim();
        const creator = (s.creator || s.metadata?.creator || s.user || '').toLowerCase().trim();
        if (!creator) return true;
        return creator === login;
    });

    filtered.forEach(s => {
        const sid = s.name.split('/').pop();
        const col = localOverrides[sid] || window.normalizeJulesStatus(s.state);
        if (counts[col] !== undefined) counts[col]++;
    });

    let total = 0;
    Object.keys(counts).forEach(k => {
        const el = $('kb-count-' + k);
        if (el) el.innerText = counts[k];
        const mEl = $('m-count-' + k);
        if (mEl) mEl.innerText = counts[k];
        total += counts[k];
    });

    const hdrBadge = $('hdr-kanban-badge');
    if (hdrBadge) hdrBadge.innerText = total;
}

// Session Details Drawer logic
window.openDrawer = async function(sessionName) {
    const drawer = $('details-drawer');
    const overlay = $('details-overlay');
    if (!drawer || !overlay) return;

    drawer.classList.add('open');
    overlay.classList.add('open');

    const sid = sessionName.split('/').pop();
    $('dr-title').innerText = 'Sesión #' + sid;
    $('dr-content').innerHTML = '<div class="skeleton-block" style="height:200px"></div>';

    try {
        const session = await window.julesApi.getSession(sessionName);
        const activities = await window.julesApi.getActivities(sessionName);
        renderDrawerDetails(session, activities);
    } catch (e) {
        $('dr-content').innerHTML = '<div class="tel-line error">Error al cargar detalles: ' + e.message + '</div>';
    }
}

window.closeDrawer = function() {
    $('details-drawer').classList.remove('open');
    $('details-overlay').classList.remove('open');
}

function renderDrawerDetails(session, activities) {
    const content = $('dr-content');
    if (!content) return;

    let html = '<div class="dr-section">' +
               '<div class="dr-label">Prompt Original</div>' +
               '<div class="prose-invert" style="font-size:13px; opacity:0.8">' + escapeHtml(session.prompt) + '</div>' +
               '</div>';

    if (activities && activities.length > 0) {
        html += '<div class="dr-section"><div class="dr-label">Actividad Reciente</div>';
        activities.reverse().forEach(act => {
            html += renderActivityLine(act);
        });
        html += '</div>';
    }

    content.innerHTML = html;
}

function renderActivityLine(act) {
    const ts = getTimeAgo(act.createTime);
    let type = 'INFO';
    let msg = 'Actividad desconocida';

    if (act.userMessaged) { type = 'USER'; msg = act.userMessaged.userMessage; }
    else if (act.agentMessaged) { type = 'AGENT'; msg = act.agentMessaged.agentMessage; }
    else if (act.planGenerated) { type = 'PLAN'; msg = 'Plan generado'; }
    else if (act.planApproved) { type = 'PLAN'; msg = 'Plan aprobado'; }
    else if (act.progressUpdated) { type = 'PROG'; msg = act.progressUpdated.title; }
    else if (act.sessionCompleted) { type = 'DONE'; msg = 'Sesión completada'; }
    else if (act.sessionFailed) { type = 'FAIL'; msg = 'Sesión fallida: ' + (act.sessionFailed.reason || '---'); }
    else if (act.artifactGenerated) { type = 'FILE'; msg = 'Artefacto generado'; }

    return '<div class="tel-line ' + type.toLowerCase() + '">' +
           '<div class="tel-head"><span class="tel-time">' + ts + '</span><span class="tel-tag ' + type.toLowerCase() + '">' + type + '</span></div>' +
           '<div class="tel-msg">' + parseActivityContent(msg) + '</div>' +
           '</div>';
}

function parseActivityContent(content) {
    if (!content) return '---';
    // Basic markdown-like parsing for the drawer
    return content.replace(/`([^`]+)`/g, '<code class="u-mono">$1</code>')
                  .replace(/\n/g, '<br>');
}

// Activity rendering helpers (shared with Neural Chat)
window.renderActivityMarkdown = function(text) {
    if (!text) return "";
    let html = text;
    // Replace code blocks
    html = html.replace(/```([\s\S]*?)```/g, function(match, code) {
        const lines = code.trim().split('\n');
        let lang = "";
        if (lines[0].length < 10 && !lines[0].includes(' ')) {
            lang = lines.shift();
        }
        const cleanCode = lines.join('\n');
        return '<pre class="code-block" data-lang="' + lang + '"><code>' + escapeHtml(cleanCode) + '</code></pre>';
    });
    // Replace inline code
    html = html.replace(/`([^`]+)`/g, '<code class="u-mono">$1</code>');
    // Replace lines for simple formatting
    const lines = html.split('\n');
    const parsed = lines.map(line => {
          let cls = "";
          if (line.startsWith('### ')) { cls = "h3"; line = line.replace('### ', ''); }
          else if (line.startsWith('## ')) { cls = "h2"; line = line.replace('## ', ''); }
          else if (line.startsWith('# ')) { cls = "h1"; line = line.replace('# ', ''); }
          else if (line.startsWith('- ') || line.startsWith('* ')) { cls = "li"; line = line.replace(/^[-*]\s+/, '• '); }
          return '<div class="' + cls + '">' + escapeHtml(line) + '</div>';
    }).join('');

    return parsed;
}

window.renderUserActivity = function(msg) {
    const parsed = renderActivityMarkdown(msg);
    return '<div class="activity-entry activity-entry--user prose-invert" style="overflow-x: auto; max-width: 100%; word-break: break-word;">' + parsed + '</div>';
}

window.renderAgentActivity = function(msg) {
    const parsed = renderActivityMarkdown(msg);
    return '<div class="activity-entry activity-entry--agent prose-invert" style="overflow-x: auto; max-width: 100%; word-break: break-word;">' + parsed + '</div>';
}

window.refreshActivities = async function(sessionId) {
    if (!sessionId) return;
    try {
        const sName = sessionId.startsWith('sessions/') ? sessionId : 'sessions/' + sessionId;
        const activities = await window.julesApi.getActivities(sName);
        const session = await window.julesApi.getSession(sName);

        // Update local status
        const sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
        const idx = sessions.findIndex(s => s.id === sessionId);
        if (idx !== -1) {
            sessions[idx].status = session.state.toLowerCase();
            localStorage.setItem('hy_neural_sessions', JSON.stringify(sessions));
        }

        // Handle specific activities
        activities.forEach(act => {
            const idSafe = sessionId;

            // Trigger Wiki/Changelog Proposal on Completion
            if (act.sessionCompleted && session.state === 'COMPLETED') {
                const processed = JSON.parse(localStorage.getItem('hy_wiki_processed_tasks') || '[]');
                if (!processed.includes(idSafe)) {
                    document.dispatchEvent(new CustomEvent('hy:task-completed', {
                        detail: { taskId: idSafe, session: session }
                    }));
                }
            }

            if (act.planGenerated) {
                if (!localStorage.getItem('jules_notif_approval_' + idSafe)) {
                    if (window.addNotification) {
                        window.addNotification('Plan Generado', 'Sesión #' + idSafe + ' espera revisión del plan.', 'warn');
                    } else {
                        showToast('Sesión ' + idSafe + ' espera revisión.', 'amber');
                    }
                    localStorage.setItem('jules_notif_approval_' + idSafe, Date.now());
                }
            }
            if (act.sessionCompleted && !localStorage.getItem('jules_notif_done_' + idSafe)) {
                if (window.addNotification) window.addNotification('Tarea Completada', 'Sesión #' + idSafe + ' ha finalizado con éxito.', 'success');
                localStorage.setItem('jules_notif_done_' + idSafe, Date.now());
            }
            if (act.sessionFailed && !localStorage.getItem('jules_notif_fail_' + idSafe)) {
                if (window.addNotification) window.addNotification('Error en Sesión', 'Sesión #' + idSafe + ' ha fallado.', 'error');
                localStorage.setItem('jules_notif_fail_' + idSafe, Date.now());
            }
        });

        // Broadcast for Neural Chat UI if open
        window.dispatchEvent(new CustomEvent('julesActivitiesUpdated', { detail: { sessionId, activities, session } }));

    } catch (e) {
        console.error("Error refreshing activities:", e);
    }
}

window.getLinkedJulesSessionId = function() {
    const claudeId = localStorage.getItem('hy_active_claude_session_id');
    if (claudeId) {
        // First check in session metadata (new unified way)
        const sessions = JSON.parse(localStorage.getItem('claude_chat_sessions') || '[]');
        const current = sessions.find(s => s.id === claudeId);
        if (current && current.metadata && current.metadata.linkedJulesTaskId) {
            return current.metadata.linkedJulesTaskId;
        }
        // Fallback to legacy mapping
        return localStorage.getItem('hy_neural_session_id_' + claudeId) || localStorage.getItem('hy_neural_session_id');
    }
    return localStorage.getItem('hy_neural_session_id');
}

window.exportSessionToMarkdown = function(session, activities) {
    const sid = session.name.split('/').pop();
    let content = "# Sesión Jules #" + sid + "\n\n";
    content += "**Estado:** " + session.state + "\n";
    content += "**Prompt:** " + session.prompt + "\n\n";
    content += "## Cronología de Actividad\n\n";

    activities.forEach(act => {
        let activityType = 'INFO';
        if (act.userMessaged) activityType = 'Usuario';
        else if (act.agentMessaged) activityType = 'Jules';
        else if (act.planGenerated) activityType = 'Plan Generado';
        else if (act.planApproved) activityType = 'Plan Aprobado';
        else if (act.progressUpdated) activityType = 'Progreso: ' + act.progressUpdated.title;
        else if (act.sessionCompleted) activityType = 'Completado';
        else if (act.sessionFailed) activityType = 'Fallido';
        else if (act.artifactGenerated) activityType = 'Artefacto: ' + ((act.artifactGenerated.artifact && act.artifactGenerated.artifact.name) || '---');

        const date = new Date(act.createTime).toLocaleString();
        const separator = "\n--- Actividad: " + activityType + " ---\n";
        content += separator + "\n*Fecha: " + date + "*\n\n";

        if (act.userMessaged) {
            content += act.userMessaged.userMessage + "\n";
        } else if (act.agentMessaged) {
            content += act.agentMessaged.agentMessage + "\n";
        } else if (act.progressUpdated) {
            if (act.progressUpdated.description) content += act.progressUpdated.description + "\n";
            const steps = act.progressUpdated.steps || [];
            if (steps.length > 0) {
                content += "PASOS:\n" + steps.map(s => ((s.index || 0) + 1) + ". " + s.title + ": " + (s.description || '')).join('\n') + "\n";
            }
        } else if (act.sessionCompleted) {
            content += "Commit: " + (act.sessionCompleted.commitMessage || '---') + "\n";
        } else if (act.sessionFailed) {
            content += "Razón: " + (act.sessionFailed.reason || 'Desconocida') + "\n";
        } else if (act.artifactGenerated) {
            const art = act.artifactGenerated.artifact;
            if (art) {
                if (art.changeSet) {
                    content += "\nCÓDIGO (DIFF):\n```diff\n" + art.changeSet.gitPatch.unidiffPatch + "\n```\n";
                }
                if (art.bashOutput) {
                    content += "\nCOMANDO: " + art.bashOutput.command + "\nOUTPUT:\n```\n" + art.bashOutput.output + "\n```\n";
                }
            }
        }
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jules-session-' + sid + '.md';
    a.click();
}

window.askAboutStep = function(stepIndex, stepTitle) {
    const input = $('v2-chat-input');
    if (input) {
        input.value = "Respecto al paso " + stepIndex + " (" + stepTitle + "): " + input.value;
        input.focus();
    }
}

window.analyzeSelectedWithClaude = async function() {
    const selectedCheckboxes = document.querySelectorAll('.session-checkbox:checked');
    if (selectedCheckboxes.length === 0) return;

    const sids = Array.from(selectedCheckboxes).map(cb => cb.getAttribute('data-sid'));
    const sessions = window.julesSessionsCache || [];

    showToast("Recopilando logs y analizando...", "amber");
    let context = "Analiza las siguientes sesiones de Jules (incluyendo logs recientes):\n\n";

    for (const sid of sids) {
        const s = sessions.find(sess => sess.name.endsWith(sid));
        if (s) {
            context += "--- SESIÓN #" + sid + " ---\n";
            context += "TAREA: " + (s.title || s.prompt) + "\n";
            context += "REPO: " + (s.sourceContext?.source || '---') + "\n";
            context += "RAMA: " + (s.sourceContext?.githubRepoContext?.startingBranch || '---') + "\n";
            context += "ESTADO: " + s.state + "\n";
            context += "FECHA: " + s.createTime + "\n";

            try {
                const sName = s.name.startsWith('sessions/') ? s.name : 'sessions/' + sid;
                const activityData = await window.julesApi.getActivities(sName, 5);
                const activities = activityData.activities || [];
                if (activities.length > 0) {
                    context += "LOGS RECIENTES:\n";
                    activities.forEach(a => {
                        const msg = a.agentMessaged?.agentMessage || a.progressUpdated?.title || a.description || 'Actividad';
                        context += "- [" + a.createTime.split('T')[1].split('.')[0] + "] " + msg.substring(0, 100) + "\n";
                    });
                }
            } catch(e) { console.warn("Could not fetch logs for " + sid, e); }

            context += "\n";
        }
    }

    context += "¿Qué patrones identificas en estas sesiones? ¿Hay algún problema común o sugerencia de mejora?";

    // Send to Claude
    localStorage.setItem('hy_neural_pending_prompt', context);
    switchView('chat');

    // Auto-focus chat input and show pre-filled message (already handled by switchView -> loadV2Messages if we integrate it)
    if ($('v2-chat-input')) {
        $('v2-chat-input').value = context;
        // Trigger resize
        $('v2-chat-input').dispatchEvent(new Event('input'));
    }

    clearHistorySelection();
    showToast("Contexto enviado a Claude", "green");
}

async function handleJulesApiKeyChanged(newKey) {
    console.log("[JULES-AUTH] handleJulesApiKeyChanged triggered.");

    // 1. Detener polling y limpiar retries
    if (typeof stopJulesPolling === 'function') stopJulesPolling();
    if (typeof clearJulesRetry === 'function') clearJulesRetry();

    // 2. Invalidar y abortar peticiones activas
    if (typeof invalidateJulesRequests === 'function') {
        invalidateJulesRequests();
    }

    const trimmedKey = typeof newKey === 'string' ? newKey.trim() : '';

    // 3. Guardar o borrar mediante las utilities
    if (trimmedKey === '') {
        if (typeof removeJulesApiKey === 'function') removeJulesApiKey();
        window.julesSessionsCache = [];
        localStorage.removeItem('jules_sessions_cache');
        window.julesApiAuthState = 'none';

        // Actualizar UI del input
        const input = document.getElementById('jules-panel-api-key-input');
        if (input) {
            input.value = '';
            input.type = 'password';
        }

        const toggleBtn = document.getElementById('jules-panel-api-key-toggle');
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-pressed', 'false');
            toggleBtn.setAttribute('aria-label', 'Mostrar API Key');
            const icon = toggleBtn.querySelector('i');
            if (icon) icon.className = 'fas fa-eye';
        }

        // Cambiar UI a pending-config e iniciar refresh
        setJulesDashboardState('pending-config');
        if (typeof fetchJulesSources === 'function') fetchJulesSources();
    } else {
        if (typeof saveJulesApiKey === 'function') {
            saveJulesApiKey(trimmedKey);
        }

        // Actualizar UI del input
        const input = document.getElementById('jules-panel-api-key-input');
        if (input) {
            input.value = trimmedKey;
        }

        window.julesApiAuthState = 'configured';
        updateConfigCardStateIndicator();

        // Resetear backoff
        resetJulesBackoff();

        // 4. Ejecutar exactamente un refresh coordinado
        await refreshJulesDataCoordinated();

        // 5. Iniciar polling sólo si el resultado fue exitoso (ready o empty) y no hay un intervalo activo
        const successStates = ['ready', 'empty'];
        if (window.julesApiAuthState === 'authenticated' && successStates.includes(window.currentJulesState) && !window.sessionPollInterval) {
            if (typeof startJulesPolling === 'function') startJulesPolling();
        }
    }
}
window.handleJulesApiKeyChanged = handleJulesApiKeyChanged;
