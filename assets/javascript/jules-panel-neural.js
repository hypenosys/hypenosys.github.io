/* ════════════════════════════════════════
   JULES PANEL NEURAL & CHAT MODULE
   ════════════════════════════════════════ */

window.JULES_PANEL_NEURAL_STORAGE = 'claude_chat_sessions';
window.JULES_PANEL_NEURAL_ACTIVE_ID = 'hy_active_claude_session_id';

window.julesPanelSessions = [];
window.currentJulesPanelSessionId = null;
window.julesPanelPollInterval = null;

let isNeuralChatProcessing = false;

// Neural Workspace Work Mode State Model
window.NeuralWorkspaceState = {
  activeMode: 'claude', // 'claude' or 'jules'
  activeClaudeConversationId: null,
  activeJulesSessionId: null
};

window.getNeuralWorkspaceState = function() {
    return window.NeuralWorkspaceState;
};

window.persistNeuralWorkspaceState = function() {
    localStorage.setItem('hypenosys_neural_workspace_mode', window.NeuralWorkspaceState.activeMode);
    if (window.NeuralWorkspaceState.activeClaudeConversationId) {
        localStorage.setItem('hy_active_claude_session_id', window.NeuralWorkspaceState.activeClaudeConversationId);
    } else {
        localStorage.removeItem('hy_active_claude_session_id');
    }
    if (window.NeuralWorkspaceState.activeJulesSessionId) {
        localStorage.setItem('hy_neural_session_id', window.NeuralWorkspaceState.activeJulesSessionId);
    } else {
        localStorage.removeItem('hy_neural_session_id');
    }
};

window.resolveLinkedClaudeConversationId = function(julesSessionId) {
    if (!julesSessionId) return null;
    const cleanId = julesSessionId.replace('sessions/', '');
    const found = (window.julesPanelSessions || []).find(s => {
        const lid = window.resolveLinkedJulesId(s);
        return lid && (lid.replace('sessions/', '') === cleanId);
    });
    return found ? found.id : null;
};

window.resolveActiveJulesSessionId = function() {
    // 1. window.NeuralWorkspaceState.activeJulesSessionId
    let sid = window.NeuralWorkspaceState?.activeJulesSessionId;
    if (sid) {
        sid = sid.replace('sessions/', '');
        const exists = (window.julesSessionsCache || []).some(s => s.name.endsWith(sid));
        if (exists) return sid;
    }

    // 2. localStorage.hy_neural_session_id
    sid = localStorage.getItem('hy_neural_session_id');
    if (sid) {
        sid = sid.replace('sessions/', '');
        const exists = (window.julesSessionsCache || []).some(s => s.name.endsWith(sid));
        if (exists) return sid;
    }

    // 3. ID activo del estado global existente (window.JulesPanelState.activeSessionId)
    sid = window.JulesPanelState?.activeSessionId;
    if (sid) {
        sid = sid.replace('sessions/', '');
        const exists = (window.julesSessionsCache || []).some(s => s.name.endsWith(sid));
        if (exists) return sid;
    }

    // 4. Sesión válida más reciente del historial Jules
    if (window.julesSessionsCache && window.julesSessionsCache.length > 0) {
        const firstSession = window.julesSessionsCache[0];
        if (firstSession && firstSession.name) {
            return firstSession.name.split('/').pop();
        }
    }

    // 5. Estado vacío
    return null;
};

window.handleObsoleteJulesSession = function(obsoleteSid) {
    console.log("[Jules History] Cleaning up obsolete Jules session ID:", obsoleteSid);

    // 1. Clean the ID from state and localStorage
    if (window.NeuralWorkspaceState.activeJulesSessionId === obsoleteSid) {
        window.NeuralWorkspaceState.activeJulesSessionId = null;
    }
    const hyNeuralSessionId = localStorage.getItem('hy_neural_session_id');
    if (hyNeuralSessionId === obsoleteSid) {
        localStorage.removeItem('hy_neural_session_id');
    }
    if (window.JulesPanelState && window.JulesPanelState.activeSessionId === obsoleteSid) {
        window.JulesPanelState.activeSessionId = null;
    }

    // Remove from julesSessionsCache if present
    if (window.julesSessionsCache) {
        const initialLen = window.julesSessionsCache.length;
        window.julesSessionsCache = window.julesSessionsCache.filter(s => !s.name.endsWith(obsoleteSid));
        if (window.julesSessionsCache.length !== initialLen) {
            localStorage.setItem('jules_sessions_cache', JSON.stringify(window.julesSessionsCache));
            if (window.updateNeuralHistory) {
                window.updateNeuralHistory(window.julesSessionsCache);
            }
        }
    }

    // 2. Resolve the next valid session
    const nextSid = window.resolveActiveJulesSessionId();
    if (nextSid) {
        window.NeuralWorkspaceState.activeJulesSessionId = nextSid;
        localStorage.setItem('hy_neural_session_id', nextSid);
        if (window.JulesPanelState) {
            window.JulesPanelState.activeSessionId = nextSid;
        }

        // Load the new resolved session
        window.loadAndRenderJulesSession(nextSid, true);
        window.startNeuralWorkspacePolling(nextSid);
    } else {
        // Show empty state
        window.renderJulesEmptyState();
    }
};

window.restoreNeuralWorkspaceState = function() {
    let savedMode = localStorage.getItem('hypenosys_neural_workspace_mode');
    if (savedMode !== 'claude' && savedMode !== 'jules') {
        savedMode = 'claude';
    }
    window.NeuralWorkspaceState.activeMode = savedMode;

    let savedClaudeId = localStorage.getItem('hy_active_claude_session_id');
    let claudeSession = window.julesPanelSessions.find(s => s.id === savedClaudeId);
    if (!claudeSession) {
        claudeSession = window.julesPanelSessions.find(s => !s.archived) || window.julesPanelSessions[0];
        if (claudeSession) {
            savedClaudeId = claudeSession.id;
        } else {
            savedClaudeId = null;
        }
    }
    window.NeuralWorkspaceState.activeClaudeConversationId = savedClaudeId;
    window.currentJulesPanelSessionId = savedClaudeId;

    let canonicalJulesId = window.resolveLinkedJulesId(claudeSession);
    let savedJulesId = localStorage.getItem('hy_neural_session_id');

    if (canonicalJulesId) {
        window.NeuralWorkspaceState.activeJulesSessionId = canonicalJulesId;
    } else {
        window.NeuralWorkspaceState.activeJulesSessionId = savedJulesId || null;
    }

    window.persistNeuralWorkspaceState();
};

window.setNeuralWorkspaceMode = function(mode, options = {}) {
    if (mode !== 'claude' && mode !== 'jules') {
        console.error("[Neural Workspace] Invalid mode:", mode);
        return;
    }

    console.log("[Neural Workspace] Setting mode to:", mode);
    window.NeuralWorkspaceState.activeMode = mode;

    // Update tab elements
    const tabClaude = $('neural-tab-claude');
    const tabJules = $('neural-tab-jules');
    if (tabClaude && tabJules) {
        tabClaude.setAttribute('aria-selected', mode === 'claude' ? 'true' : 'false');
        tabClaude.setAttribute('tabindex', mode === 'claude' ? '0' : '-1');
        tabClaude.classList.toggle('active', mode === 'claude');

        tabJules.setAttribute('aria-selected', mode === 'jules' ? 'true' : 'false');
        tabJules.setAttribute('tabindex', mode === 'jules' ? '0' : '-1');
        tabJules.classList.toggle('active', mode === 'jules');
    }

    // Update composer segmented controls
    document.querySelectorAll('.jules-neural-mode-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.mode === mode);
    });

    const innerToggle = document.querySelector('.jules-neural-mode-toggle');
    if (innerToggle) {
        innerToggle.style.display = 'flex';
    }

    // Update "+ Nueva sesión" button text and behavior dynamically
    const newBtn = $('hdr-new-btn');
    if (newBtn) {
        newBtn.innerHTML = mode === 'claude' ? '<i class="fas fa-plus mr-1"></i> Nueva conversación' : '<i class="fas fa-plus mr-1"></i> Nueva sesión Jules';
    }

    // Switch workspace container visibilities
    const isClaude = mode === 'claude';
    const claudeWorkspace = document.getElementById('neural-claude-workspace');
    const julesWorkspace = document.getElementById('neural-jules-workspace');

    if (claudeWorkspace) {
        claudeWorkspace.hidden = !isClaude;
        claudeWorkspace.setAttribute('aria-hidden', String(!isClaude));
    }
    if (julesWorkspace) {
        julesWorkspace.hidden = isClaude;
        julesWorkspace.setAttribute('aria-hidden', String(isClaude));
    }

    const ngHistory = $('ng-history');
    const ngChatHistory = $('ng-chat-history');

    if (isClaude) {
        window.currentSendMode = 'claude';
        const input = $('v2-chat-input');
        if (input) {
            input.placeholder = "Escribe un mensaje para Claude...";
        }

        // Toggle sidebars
        if (ngHistory) {
            ngHistory.style.display = 'none';
            ngHistory.classList.add('hidden');
        }
        if (ngChatHistory) {
            ngChatHistory.style.display = 'block';
            ngChatHistory.classList.remove('hidden');
            const label = ngChatHistory.querySelector('.nav-label span');
            if (label) label.textContent = "CLAUDE CHAT HISTORY";
        }

        window.renderChatV2Messages();
        window.renderNeuralChatHistory();

        // Stop Jules polling when not on Jules tab
        window.stopNeuralWorkspacePolling();
    } else {
        window.currentSendMode = 'jules';
        const input = $('v2-chat-input');
        if (input) {
            input.placeholder = "Enviar instrucción directa a Jules...";
        }

        // Toggle sidebars
        if (ngChatHistory) {
            ngChatHistory.style.display = 'none';
            ngChatHistory.classList.add('hidden');
        }
        if (ngHistory) {
            ngHistory.style.display = 'block';
            ngHistory.classList.remove('hidden');
            const label = ngHistory.querySelector('.nav-label span');
            if (label) label.textContent = "JULES HISTORY";
        }

        // Resolve active session based on priority list
        const julesSessionId = window.resolveActiveJulesSessionId();
        if (julesSessionId) {
            window.NeuralWorkspaceState.activeJulesSessionId = julesSessionId;
            localStorage.setItem('hy_neural_session_id', julesSessionId);
            if (window.JulesPanelState) {
                window.JulesPanelState.activeSessionId = julesSessionId;
            }

            window.loadAndRenderJulesSession(julesSessionId, true);
            window.startNeuralWorkspacePolling(julesSessionId);
        } else {
            window.NeuralWorkspaceState.activeJulesSessionId = null;
            localStorage.removeItem('hy_neural_session_id');
            if (window.JulesPanelState) {
                window.JulesPanelState.activeSessionId = null;
            }
            window.renderJulesEmptyState();
        }

        // Refresh sidebar Jules history
        if (window.updateNeuralHistory && window.julesSessionsCache) {
            window.updateNeuralHistory(window.julesSessionsCache);
        }
    }

    // Toggle the hidden class of #v2-task-context based on mode and session presence
    const v2TaskContext = document.getElementById('v2-task-context');
    if (v2TaskContext) {
        if (!isClaude && window.NeuralWorkspaceState.activeJulesSessionId) {
            v2TaskContext.classList.remove('hidden');
        } else {
            v2TaskContext.classList.add('hidden');
        }
    }

    window.persistNeuralWorkspaceState();

    if (window.neuralSyncChannel) {
        window.neuralSyncChannel.postMessage({ type: 'workspace-mode-changed', mode: mode, sessionId: window.currentJulesPanelSessionId });
    }
};

window.selectLinkedClaudeConversation = function(conversationId, options = {}) {
    console.log("[Neural Workspace] Selecting Claude conversation:", conversationId);
    window.NeuralWorkspaceState.activeClaudeConversationId = conversationId;
    window.currentJulesPanelSessionId = conversationId;

    const session = window.julesPanelSessions.find(s => s.id === conversationId);
    const linkedJulesId = window.resolveLinkedJulesId(session);

    if (linkedJulesId) {
        window.NeuralWorkspaceState.activeJulesSessionId = linkedJulesId;
    }
    window.persistNeuralWorkspaceState();

    // Re-render
    if (window.NeuralWorkspaceState.activeMode === 'claude') {
        window.renderChatV2Messages();
        window.renderNeuralChatHistory();
    } else {
        // If we are in Jules mode, load the newly selected pair's Jules task!
        const julesSessionId = window.resolveActiveJulesSessionId();
        if (julesSessionId) {
            window.loadAndRenderJulesSession(julesSessionId, true);
            window.startNeuralWorkspacePolling(julesSessionId);
        } else {
            window.renderJulesEmptyState();
        }
        if (window.updateNeuralHistory && window.julesSessionsCache) {
            window.updateNeuralHistory(window.julesSessionsCache);
        }
    }
};

window.selectLinkedJulesSession = function(julesSessionId, options = {}) {
    console.log("[Neural Workspace] Selecting Jules session:", julesSessionId);
    const cleanJulesId = julesSessionId ? julesSessionId.replace('sessions/', '') : null;
    window.NeuralWorkspaceState.activeJulesSessionId = cleanJulesId;

    window.persistNeuralWorkspaceState();

    if (window.NeuralWorkspaceState.activeMode === 'jules') {
        if (cleanJulesId) {
            window.loadAndRenderJulesSession(cleanJulesId, true);
            window.startNeuralWorkspacePolling(cleanJulesId);
        } else {
            window.renderJulesEmptyState();
        }
        if (window.updateNeuralHistory && window.julesSessionsCache) {
            window.updateNeuralHistory(window.julesSessionsCache);
        }
    } else {
        window.renderChatV2Messages();
        window.renderNeuralChatHistory();
    }
};

window.renderJulesEmptyState = function() {
    window.stopNeuralWorkspacePolling();

    const julesLinkingBar = document.getElementById('jules-linking-bar');
    if (julesLinkingBar) julesLinkingBar.innerHTML = '';

    const welcome = document.getElementById('history-welcome-screen');
    if (welcome) {
        welcome.style.display = 'flex';
        welcome.classList.remove('hidden');

        welcome.innerHTML = `
            <div style="font-size: 40px;">⚡</div>
            <h3 style="font-family: var(--font-head); font-weight: 700; font-size: 16px; color: var(--accent2);">No hay sesiones de Jules disponibles</h3>
            <p style="max-width: 320px; font-size: 12px; color: var(--text3); margin-bottom: 15px;">
                Crea una nueva sesión de Jules para comenzar.
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; align-items: center;">
                <button class="btn btn-primary btn-sm" id="btn-create-jules-new-empty" style="box-shadow: 0 0 15px rgba(124, 58, 237, 0.3); font-size: 11px;">
                    <i class="fas fa-plus mr-1"></i> Nueva sesión Jules
                </button>
            </div>
        `;

        const btnCreate = document.getElementById('btn-create-jules-new-empty');
        if (btnCreate) {
            btnCreate.onclick = () => {
                if (window.openNewTaskModal) {
                    window.openNewTaskModal('running');
                } else {
                    console.error("[Jules Panel] openNewTaskModal no encontrada");
                }
            };
        }
    }

    const historyContainer = document.getElementById('neural-jules-history');
    if (historyContainer) {
        historyContainer.innerHTML = '';
        historyContainer.style.display = 'none';
    }

    const v2TaskContext = $('v2-task-context');
    if (v2TaskContext) v2TaskContext.classList.add('hidden');
};

window.renderJulesLinkingBar = function() {
    const bar = document.getElementById('jules-linking-bar');
    if (!bar) return;

    const activeMode = window.NeuralWorkspaceState?.activeMode;
    if (activeMode !== 'jules') {
        bar.innerHTML = '';
        return;
    }

    const julesSessionId = window.NeuralWorkspaceState?.activeJulesSessionId;
    if (!julesSessionId) {
        bar.innerHTML = '';
        return;
    }

    const linkedClaudeId = window.resolveLinkedClaudeConversationId(julesSessionId);
    if (linkedClaudeId) {
        const session = window.julesPanelSessions.find(s => s.id === linkedClaudeId);
        const claudeTitle = session ? session.title : 'Conversación #' + linkedClaudeId;

        bar.innerHTML = `
            <div class="neural-linking-bar">
                <div class="neural-linking-bar-left">
                    <span class="neural-link-badge claude-jules">Claude + Jules</span>
                    <span class="neural-linking-bar-title">Conversación Claude vinculada:</span>
                    <span class="neural-linking-bar-value" title="${window.escapeHtml(claudeTitle)}">${window.escapeHtml(claudeTitle)}</span>
                </div>
                <div class="neural-linking-bar-actions">
                    <button class="btn btn-ghost btn-xs" id="btn-view-in-claude" style="color: var(--accent2); font-weight: 700;"><i class="fas fa-eye mr-1"></i> Ver en Claude</button>
                    <button class="btn btn-ghost btn-xs" id="btn-change-claude-link" style="color: var(--accent2);"><i class="fas fa-exchange-alt mr-1"></i> Cambiar conversación</button>
                    <button class="btn btn-ghost btn-xs" id="btn-unlink-claude-link" style="color: var(--red);"><i class="fas fa-unlink mr-1"></i> Desvincular</button>
                </div>
            </div>
        `;

        const btnView = document.getElementById('btn-view-in-claude');
        const btnChange = document.getElementById('btn-change-claude-link');
        const btnUnlink = document.getElementById('btn-unlink-claude-link');

        if (btnView) {
            btnView.onclick = () => {
                window.setNeuralWorkspaceMode('claude');
            };
        }
        if (btnChange) {
            btnChange.onclick = () => {
                window.openClaudeSessionSelector();
            };
        }
        if (btnUnlink) {
            btnUnlink.onclick = () => {
                window.unlinkClaudeFromJulesTask(linkedClaudeId);
            };
        }
    } else {
        bar.innerHTML = `
            <div class="neural-linking-bar">
                <div class="neural-linking-bar-left">
                    <span class="neural-link-badge claude-only">Jules Only</span>
                    <span class="neural-linking-bar-title" style="color: var(--text3); text-transform: none; font-weight: normal; font-size: 12.5px;">Esta sesión Jules todavía no tiene una conversación Claude vinculada.</span>
                </div>
                <div class="neural-linking-bar-actions">
                    <button class="btn btn-primary btn-xs" id="btn-create-claude-link" style="box-shadow: 0 0 10px rgba(124, 58, 237, 0.2);"><i class="fas fa-plus mr-1"></i> Crear conversación Claude</button>
                    <button class="btn btn-ghost btn-xs" id="btn-link-claude-link" style="color: var(--accent2);"><i class="fas fa-link mr-1"></i> Vincular conversación existente</button>
                </div>
            </div>
        `;

        const btnCreate = document.getElementById('btn-create-claude-link');
        const btnLink = document.getElementById('btn-link-claude-link');

        if (btnCreate) {
            btnCreate.onclick = () => {
                window.createNewClaudeFromJulesSession(julesSessionId);
            };
        }
        if (btnLink) {
            btnLink.onclick = () => {
                window.openClaudeSessionSelector();
            };
        }
    }
};

window.createNewClaudeFromJulesSession = function(julesSessionId) {
    if (!julesSessionId) return;

    const cleanJulesId = julesSessionId.replace('sessions/', '');

    // Find task in cache for a good title
    const cachedTask = (window.julesSessionsCache || []).find(s => s.name.endsWith(cleanJulesId));
    const title = cachedTask ? (cachedTask.title || cachedTask.prompt || 'Conversación vinculada') : 'Conversación vinculada';

    const newSession = window.NeuralChatCore.createSession({
        title: title,
        idPrefix: 'session_'
    });

    newSession.metadata = newSession.metadata || {};
    newSession.metadata.linkedJulesTaskId = cleanJulesId;
    if (cachedTask && (cachedTask.title || cachedTask.prompt)) {
        newSession.metadata.linkedJulesTaskTitle = cachedTask.title || cachedTask.prompt;
    }

    window.julesPanelSessions.unshift(newSession);
    saveJulesPanelSessions();

    localStorage.setItem('hy_neural_session_id_' + newSession.id, cleanJulesId);

    window.selectLinkedJulesSession(cleanJulesId);
    showToast("Conversación Claude vinculada creada", "green");
};

window.neuralWorkspacePollInterval = null;

window.startNeuralWorkspacePolling = function(sessionId) {
    window.stopNeuralWorkspacePolling();
    if (!sessionId) return;

    const poll = async () => {
        const cleanSid = sessionId.replace('sessions/', '');
        const targetSessionName = 'sessions/' + cleanSid;

        try {
            const activityData = await window.julesApi.getActivities(targetSessionName, 100);
            const freshRawActivities = activityData.activities || [];

            // Check if active session changed during request
            const currentJulesSid = window.NeuralWorkspaceState?.activeJulesSessionId;
            if (!currentJulesSid || currentJulesSid.replace('sessions/', '') !== cleanSid) {
                return;
            }

            // Retrieve cached to merge
            let cachedActivities = [];
            try {
                const cachedStr = localStorage.getItem(`jules_activities_cache_${cleanSid}`);
                if (cachedStr) {
                    cachedActivities = JSON.parse(cachedStr);
                }
            } catch (e) {}

            let mergedFresh = [...freshRawActivities];
            if (cachedActivities && cachedActivities.length > 0) {
                cachedActivities.forEach(cached => {
                    const exists = mergedFresh.some(fresh => (fresh.id && fresh.id === cached.id) || (fresh.messageId && fresh.messageId === cached.messageId));
                    if (!exists) {
                        mergedFresh.push(cached);
                    }
                });
            }

            const normalized = mergedFresh.map(act => window.normalizeJulesActivity(act, cleanSid)).filter(Boolean);
            const unique = window.deduplicateActivities(normalized);

            window.renderNormalizedActivities(unique, false);

            localStorage.setItem(`jules_activities_cache_${cleanSid}`, JSON.stringify(unique));
            _syncJulesActivitiesToSession(freshRawActivities);

            const isDone = freshRawActivities.some(a => a.sessionCompleted || a.sessionFailed);
            if (isDone) {
                window.stopNeuralWorkspacePolling();
            }
        } catch (e) {
            console.warn("[Neural Workspace Polling] Error:", e);
        }
    };

    poll(); // immediate initial call
    window.neuralWorkspacePollInterval = setInterval(poll, 5000);
};

window.stopNeuralWorkspacePolling = function() {
    if (window.neuralWorkspacePollInterval) {
        clearInterval(window.neuralWorkspacePollInterval);
        window.neuralWorkspacePollInterval = null;
    }
};

/**
 * Controla el estado de procesamiento del chat neural (indicador visual y botón enviar)
 */
function setNeuralProcessingState(isProcessing) {
    isNeuralChatProcessing = isProcessing;
    const thinkingIndicator = $('v2-thinking-indicator');
    const sendBtn = $('v2-send-btn');

    if (thinkingIndicator) {
        if (isProcessing) {
            thinkingIndicator.classList.remove('hidden');
        } else {
            thinkingIndicator.classList.add('hidden');
        }
    }

    if (sendBtn) {
        sendBtn.disabled = isProcessing;
        sendBtn.style.opacity = isProcessing ? '0.5' : '1';
        sendBtn.style.pointerEvents = isProcessing ? 'none' : 'auto';
    }
}
window.setJulesPanelNeuralProcessingState = setNeuralProcessingState;

function saveJulesPanelSessions() {
    window.NeuralChatCore.saveSessions(window.JULES_PANEL_NEURAL_STORAGE, window.julesPanelSessions);
    if (window.neuralSyncChannel) {
        window.neuralSyncChannel.postMessage({ type: 'session-updated' });
    }
}

window.loadJulesPanelSessions = function() {
    window.julesPanelSessions = window.NeuralChatCore.getSessions(window.JULES_PANEL_NEURAL_STORAGE);
    window.currentJulesPanelSessionId = localStorage.getItem(window.JULES_PANEL_NEURAL_ACTIVE_ID);

    // Populate NeuralWorkspaceState
    window.NeuralWorkspaceState.activeClaudeConversationId = window.currentJulesPanelSessionId;
    const session = window.julesPanelSessions.find(s => s.id === window.currentJulesPanelSessionId);
    if (session) {
        const linkedJulesId = window.resolveLinkedJulesId(session);
        if (linkedJulesId) {
            window.NeuralWorkspaceState.activeJulesSessionId = linkedJulesId;
        }
    }

    window.renderNeuralChatHistory();
}

/**
 * Migración defensiva de sesiones del panel a la key unificada de Claude.
 */
function migrateJulesPanelSessions() {
    const OLD_KEY = 'hy_jules_panel_neural_sessions';
    const NEW_KEY = 'claude_chat_sessions';
    const OLD_ACTIVE_ID = 'hy_jules_panel_neural_active_id';
    const NEW_ACTIVE_ID = 'hy_active_claude_session_id';

    const oldData = localStorage.getItem(OLD_KEY);
    if (!oldData || localStorage.getItem(OLD_KEY + '_migrated') === 'true') return;

    try {
        const oldSessions = JSON.parse(oldData);
        if (!Array.isArray(oldSessions) || oldSessions.length === 0) return;

        console.log("[Migration] Migrating Jules Panel sessions to unified Claude storage...");

        // Backup
        localStorage.setItem('hy_bak_' + OLD_KEY, oldData);
        const currentClaudeData = localStorage.getItem(NEW_KEY);
        if (currentClaudeData) localStorage.setItem('hy_bak_' + NEW_KEY, currentClaudeData);

        let claudeSessions = JSON.parse(currentClaudeData || '[]');
        let migratedCount = 0;

        oldSessions.forEach(oldSess => {
            const existingIdx = claudeSessions.findIndex(s => s.id === oldSess.id);
            if (existingIdx !== -1) {
                // Fusionar mensajes
                const existing = claudeSessions[existingIdx];
                oldSess.messages.forEach(m => {
                    const exists = existing.messages.some(em =>
                        em.content === m.content && em.role === m.role && em.timestamp === m.timestamp
                    );
                    if (!exists) {
                        existing.messages.push(m);
                        existing.messages.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
                    }
                });
                // Preservar metadata del panel
                existing.metadata = existing.metadata || {};
                if (oldSess.repoFullName) existing.metadata.repoFullName = oldSess.repoFullName;
                if (oldSess.repoName) existing.metadata.repoName = oldSess.repoName;
            } else {
                // Nueva sesión, normalizar metadata
                oldSess.metadata = oldSess.metadata || {};
                if (oldSess.repoFullName) oldSess.metadata.repoFullName = oldSess.repoFullName;
                if (oldSess.repoName) oldSess.metadata.repoName = oldSess.repoName;
                claudeSessions.push(oldSess);
                migratedCount++;
            }
        });

        localStorage.setItem(NEW_KEY, JSON.stringify(claudeSessions));
        localStorage.setItem(OLD_KEY + '_migrated', 'true');

        // Sync active ID if needed
        const oldActiveId = localStorage.getItem(OLD_ACTIVE_ID);
        if (oldActiveId && !localStorage.getItem(NEW_ACTIVE_ID)) {
            localStorage.setItem(NEW_ACTIVE_ID, oldActiveId);
        }

        console.log(`[Migration] Successfully migrated ${migratedCount} sessions.`);
    } catch (e) {
        console.error("[Migration] Error migrating sessions:", e);
    }
}

/**
 * Initialize Neural Chat for Jules Panel
 */
window.initJulesPanelNeuralChat = function() {
    if (window._julesPanelNeuralInitialized) {
        window.restoreNeuralWorkspaceState();
        window.setNeuralWorkspaceMode(window.NeuralWorkspaceState.activeMode);
        return;
    }
    console.log("[Jules Panel Neural] Initializing...");

    migrateJulesPanelSessions();
    setNeuralProcessingState(false);
    window.loadJulesPanelSessions();

    if (window.julesPanelSessions.length === 0 && !window.location.search.includes('skip_auto_session')) {
        window.createNewJulesPanelSession();
    } else {
        window.restoreNeuralWorkspaceState();
    }

    // Bind UI Events
    const sendBtn = $('v2-send-btn');
    const chatInput = $('v2-chat-input');

    if (sendBtn) {
        sendBtn.onclick = () => window.sendChatV2Msg();
    }

    if (chatInput) {
        chatInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.sendChatV2Msg();
            }
        };
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
    }

    // Bind tab events for the premium segmented workspace mode selector
    const tabContainer = document.getElementById('neural-workspace-tabs');
    if (tabContainer) {
        tabContainer.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('[data-neural-mode]');
            if (tabBtn) {
                const mode = tabBtn.getAttribute('data-neural-mode');
                window.setNeuralWorkspaceMode(mode);
            }
        });
    }

    // Bind event delegation for the composer mode selector options
    const composerToggle = document.querySelector('.jules-neural-mode-toggle');
    if (composerToggle) {
        composerToggle.addEventListener('click', (e) => {
            const optBtn = e.target.closest('[data-mode]');
            if (optBtn) {
                const mode = optBtn.getAttribute('data-mode');
                window.setNeuralWorkspaceMode(mode);
            }
        });
    }

    // Keyboard navigation on tabs
    if (tabContainer) {
        const tabs = Array.from(tabContainer.querySelectorAll('[role="tab"]'));
        tabs.forEach((tab, index) => {
            tab.addEventListener('keydown', (e) => {
                let targetTab = null;
                if (e.key === 'ArrowRight') {
                    targetTab = tabs[(index + 1) % tabs.length];
                } else if (e.key === 'ArrowLeft') {
                    targetTab = tabs[(index - 1 + tabs.length) % tabs.length];
                } else if (e.key === 'Home') {
                    targetTab = tabs[0];
                } else if (e.key === 'End') {
                    targetTab = tabs[tabs.length - 1];
                }

                if (targetTab) {
                    targetTab.focus();
                    targetTab.click();
                    e.preventDefault();
                }
            });
        });
    }

    // Set initial mode on first render
    window.setNeuralWorkspaceMode(window.NeuralWorkspaceState.activeMode);

    // Setup Listeners
    window.addEventListener('julesActivitiesUpdated', (e) => {
        const { sessionId, activities } = e.detail;
        const currentJulesSid = getLinkedJulesSessionId();
        const cleanSessionId = sessionId ? sessionId.replace('sessions/', '') : '';
        const cleanCurrentJulesSid = currentJulesSid ? currentJulesSid.replace('sessions/', '') : '';

        if (cleanSessionId === cleanCurrentJulesSid && cleanCurrentJulesSid) {
            if (activities) {
                localStorage.setItem(`jules_activities_cache_${cleanCurrentJulesSid}`, JSON.stringify(activities));
            }
            window.loadAndRenderJulesSession(cleanCurrentJulesSid, false);
            _syncJulesActivitiesToSession(activities || []);
        }
    });

    window.addEventListener('storage', (e) => {
        if (e.key === window.JULES_PANEL_NEURAL_STORAGE || e.key === window.JULES_PANEL_NEURAL_ACTIVE_ID || e.key === 'hypenosys_neural_workspace_mode') {
            window.loadJulesPanelSessions();
            if ($('sessions-drawer')?.classList.contains('open')) {
                window.renderJulesPanelSessionDrawerList();
            }

            window.restoreNeuralWorkspaceState();
            window.setNeuralWorkspaceMode(window.NeuralWorkspaceState.activeMode);
        }
    });

    // Real-time synchronization channel
    window.neuralSyncChannel = new BroadcastChannel('hypenosys_neural_sessions_sync');
    window.neuralSyncChannel.onmessage = (event) => {
        const { type, sessionId, mode } = event.data;
        if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Jules Panel Sync] Message received:", type, sessionId, mode);

        window.loadJulesPanelSessions();

        if (mode && mode !== window.NeuralWorkspaceState.activeMode) {
            window.NeuralWorkspaceState.activeMode = mode;
        }

        if (type === 'active-session-changed' && sessionId) {
            if (window.currentJulesPanelSessionId !== sessionId) {
                window.loadJulesPanelSession(sessionId, true);
            }
        } else {
            window.restoreNeuralWorkspaceState();
            window.setNeuralWorkspaceMode(window.NeuralWorkspaceState.activeMode);
        }
    };

    // Docs Integration Toggle
    const docsBadge = document.getElementById('docs-status-badge');
    if (docsBadge) {
        docsBadge.classList.remove('hidden');
        if (window.JulesDocsBridge && window.JulesDocsBridge.updateDocsStatusBadge) {
            window.JulesDocsBridge.updateDocsStatusBadge();
        }
    }

    // SVN Integration Toggle
    const svnBadge = document.getElementById('svn-status-badge');
    if (svnBadge) {
        if (window.JulesSvnBridge && window.JulesSvnBridge.updateSvnStatusBadge) {
            window.JulesSvnBridge.updateSvnStatusBadge();
        }
    }

    window._julesPanelNeuralInitialized = true;
    console.log("[Jules Panel Neural] Jules Panel Neural initialized");
}

function _syncJulesActivitiesToSession(activities) {
    const session = window.julesPanelSessions.find(s => s.id === window.currentJulesPanelSessionId);
    if (!session) return;

    const agentMessages = activities.filter(a => a.agentMessaged);
    if (agentMessages.length === 0) return;

    let changed = false;
    agentMessages.forEach(act => {
        const content = act.agentMessaged.agentMessage;
        const timestamp = act.createTime;

        const exists = session.messages.some(m =>
            m.role === 'assistant' &&
            m.content === content &&
            (m.timestamp === timestamp || m.createTime === timestamp)
        );

        if (!exists) {
            session.messages.push({
                role: 'assistant',
                content: content,
                createTime: timestamp,
                timestamp: new Date(timestamp).getTime(),
                source: 'jules'
            });
            changed = true;
        }
    });

    if (changed) {
        saveJulesPanelSessions();
        window.renderChatV2Messages();
    }
}

window.createNewJulesPanelSession = function() {
    const newSession = window.NeuralChatCore.createSession({
        title: 'Nueva Conversación',
        idPrefix: 'session_'
    });

    // Auto-associate with current repo
    const currentRepo = localStorage.getItem('hypenosys_active_repo');
    newSession.metadata = newSession.metadata || {};
    if (currentRepo) {
        newSession.metadata.repoFullName = currentRepo;
        newSession.metadata.repoName = currentRepo.split('/').pop();
    }

    window.julesPanelSessions.unshift(newSession);
    saveJulesPanelSessions();
    window.loadJulesPanelSession(newSession.id);
    window.renderNeuralChatHistory();
}

window.loadJulesPanelSession = function(id, skipBroadcast = false) {
    if (!skipBroadcast && window.neuralSyncChannel) {
        window.neuralSyncChannel.postMessage({ type: 'active-session-changed', sessionId: id });
    }

    const session = window.julesPanelSessions.find(s => s.id === id);
    if (!session) return;

    // Switch view to chat if not already there
    if (window.switchView && window.JulesPanelState?.currentView !== 'chat') {
        const chatBtn = document.querySelector('.hnav-link[data-view="chat"]');
        window.switchView('chat', chatBtn);
    }

    setNeuralProcessingState(false);
    window.selectLinkedClaudeConversation(id);

    if (window.updateSidebarContextLabel) window.updateSidebarContextLabel();
}

window.sendChatV2Msg = async function() {
    if (isNeuralChatProcessing) {
        console.log("[Jules Panel Neural] Busy processing, ignoring double send.");
        return;
    }

    const input = $('v2-chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    if (window.currentSendMode === 'jules') {
        await window.sendNeuralMessage();
        return;
    }

    // AI/Claude mode
    const session = window.julesPanelSessions.find(s => s.id === window.currentJulesPanelSessionId);
    if (!session) {
        // En lugar de crear una nueva, pedimos seleccionar una o crearla.
        // Pero para mantener compatibilidad simple por ahora, la creamos si no hay ninguna.
        window.createNewJulesPanelSession();
        setTimeout(() => window.sendChatV2Msg(), 100);
        return;
    }

    // Ensure repo association on first message if missing
    if (!session.metadata?.repoFullName) {
        const currentRepo = localStorage.getItem('hypenosys_active_repo');
        if (currentRepo) {
            session.metadata = session.metadata || {};
            session.metadata.repoFullName = currentRepo;
            session.metadata.repoName = currentRepo.split('/').pop();
            if (window.updateSidebarContextLabel) window.updateSidebarContextLabel();
        }
    }

    input.value = '';
    input.style.height = 'auto';

    setNeuralProcessingState(true);

    console.log("[Jules Panel Neural] Message sent from Jules Panel Neural");
    try {
        // DOCUMENTATION FAIL-OPEN LOGIC
        const docsEnabled = localStorage.getItem('hypenosys_docs_context_enabled') !== 'false';
        let docsContext = null;

        if (docsEnabled && window.JulesDocsBridge?.getDocContext) {
            try {
                docsContext = await Promise.race([
                    window.JulesDocsBridge.getDocContext(msg),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500))
                ]);
            } catch (error) {
                console.warn('[DocsBridge] failed; continuing without docs', error);
                docsContext = null;
            }
        }

        // SVN CONTEXT INJECTION
        const svnEnabled = localStorage.getItem('hypenosys_svn_context_enabled') === 'true';
        let svnContext = null;

        if (svnEnabled && window.JulesSvnBridge?.getSvnContext) {
            try {
                svnContext = await Promise.race([
                    window.JulesSvnBridge.getSvnContext(msg),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500))
                ]);
            } catch (error) {
                console.warn('[SvnBridge] failed; continuing without svn', error);
                svnContext = null;
            }
        }

        const baseSystemPrompt = await window.JulesDocsBridge.buildSystemPrompt(msg, session.systemPrompt);
        const dynamicSystemPrompt = baseSystemPrompt + (docsContext || "") + (svnContext || "");

        // Store sources for this turn
        const currentSources = window._lastDocsMetadata || [];
        window._lastDocsMetadata = null;

        await window.NeuralChatCore.sendMessage({
            session: session,
            userMessage: msg,
            systemPrompt: dynamicSystemPrompt,
            onToken: () => {
                const lastMsg = session.messages[session.messages.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                    lastMsg.sources = currentSources;
                }
                window.renderChatV2Messages();
            },
            saveCallback: () => {
                saveJulesPanelSessions();
                window.renderNeuralChatHistory();
            },
            onToken: () => {
                window.renderChatV2Messages();
            },
            onDone: () => {
                setNeuralProcessingState(false);
                window.renderChatV2Messages();
                window.renderNeuralChatHistory();
            },
            onError: (err) => {
                setNeuralProcessingState(false);
                showToast(err.message, "red");
                window.renderChatV2Messages();
            }
        });
    } catch (e) {
        setNeuralProcessingState(false);
        showToast(e.message, "red");
    }
}

window.renderNeuralChatHistory = function() {
    const container = $('chat-history-list');
    if (!container) return;

    const sessions = (window.julesPanelSessions || []).filter(s => !s.archived);

    if (sessions.length === 0) {
        container.innerHTML = '<div class="notif-empty" style="font-size: 10px; padding: 10px;">Sin historial de chat</div>';
        return;
    }

    container.innerHTML = sessions.map(function(s) {
        const isActive = s.id === window.currentJulesPanelSessionId;

        // Title logic: title -> first user message -> "Nueva conversación"
        let displayTitle = s.title;
        if (!displayTitle || displayTitle.toLowerCase() === 'nueva conversación') {
            const firstUserMsg = s.messages.find(m => m.role === 'user');
            if (firstUserMsg) {
                displayTitle = firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '');
            } else {
                displayTitle = 'Nueva conversación';
            }
        }

        const isLinked = !!(s.metadata && s.metadata.linkedJulesTaskId);
        const linkedTitle = isLinked ? (s.metadata.linkedJulesTaskTitle || s.metadata.linkedJulesTaskId) : 'Sin tarea vinculada';
        const statusClass = isLinked ? 'linked' : 'unlinked';

        return '<div class="chat-history-item ' + (isActive ? 'active' : '') + ' ' + statusClass + '" onclick="window.loadJulesPanelSession(\'' + s.id + '\')">' +
                 '<div class="chat-dot"></div>' +
                 '<div class="chat-content-wrap">' +
                    '<div class="chat-title" title="' + window.NeuralChatCore.escapeHtml(displayTitle) + '">' + window.NeuralChatCore.escapeHtml(displayTitle) + '</div>' +
                    '<div class="chat-link-meta"><i class="fas ' + (isLinked ? 'fa-link' : 'fa-info-circle') + '"></i> ' + window.NeuralChatCore.escapeHtml(linkedTitle) + '</div>' +
                 '</div>' +
                 '<div class="chat-history-actions">' +
                    '<button class="btn-action-session" onclick="window.renameJulesPanelSession(event, \'' + s.id + '\')" title="Renombrar"><i class="fas fa-edit"></i></button>' +
                    '<button class="btn-action-session" onclick="window.archiveJulesPanelSession(event, \'' + s.id + '\')" title="Archivar"><i class="fas fa-archive"></i></button>' +
                    '<button class="btn-delete-session" onclick="window.deleteJulesPanelSession(event, \'' + s.id + '\')" title="Borrar"><i class="fas fa-trash"></i></button>' +
                 '</div>' +
               '</div>';
    }).join('');
}

window.renderChatV2Messages = function() {
    const container = $('v2-chat-messages');
    if (!container) return;

    const session = window.julesPanelSessions.find(s => s.id === window.currentJulesPanelSessionId);

    // Update Premium Claude Linking Status Bar
    const bar = document.getElementById('claude-linking-bar');
    if (bar) {
        if (!session) {
            bar.innerHTML = '';
        } else {
            const linkedId = window.resolveLinkedJulesId(session);
            if (linkedId) {
                const cleanLinkedId = linkedId.replace('sessions/', '');
                let taskTitle = '#' + cleanLinkedId;
                const cachedTask = (window.julesSessionsCache || []).find(s => s.name.endsWith(cleanLinkedId));
                if (cachedTask && (cachedTask.title || cachedTask.prompt)) {
                    taskTitle = '#' + cleanLinkedId + ' · ' + (cachedTask.title || cachedTask.prompt);
                } else if (session.metadata?.linkedJulesTaskTitle) {
                    taskTitle = '#' + cleanLinkedId + ' · ' + session.metadata.linkedJulesTaskTitle;
                }

                bar.innerHTML = `
                    <div class="neural-linking-bar">
                        <div class="neural-linking-bar-left">
                            <span class="neural-link-badge claude-jules">Claude + Jules</span>
                            <span class="neural-linking-bar-title">Vinculada con Jules:</span>
                            <span class="neural-linking-bar-value" title="${window.NeuralChatCore.escapeHtml(taskTitle)}">${window.NeuralChatCore.escapeHtml(taskTitle)}</span>
                        </div>
                        <div class="neural-linking-bar-actions">
                            <button class="btn btn-ghost btn-xs" id="btn-view-in-jules" style="color: var(--accent2); font-weight: 700;"><i class="fas fa-eye mr-1"></i> Ver en Jules</button>
                            <button class="btn btn-ghost btn-xs" id="btn-change-jules-task" style="color: var(--accent2);"><i class="fas fa-exchange-alt mr-1"></i> Cambiar tarea</button>
                            <button class="btn btn-ghost btn-xs" id="btn-unlink-jules-task" style="color: var(--red);"><i class="fas fa-unlink mr-1"></i> Desvincular</button>
                        </div>
                    </div>
                `;

                const btnView = document.getElementById('btn-view-in-jules');
                const btnChange = document.getElementById('btn-change-jules-task');
                const btnUnlink = document.getElementById('btn-unlink-jules-task');

                if (btnView) {
                    btnView.onclick = () => {
                        window.setNeuralWorkspaceMode('jules');
                    };
                }
                if (btnChange) {
                    btnChange.onclick = () => {
                        window.openJulesTaskSelector();
                    };
                }
                if (btnUnlink) {
                    btnUnlink.onclick = () => {
                        window.unlinkClaudeFromJulesTask(session.id);
                    };
                }
            } else {
                bar.innerHTML = `
                    <div class="neural-linking-bar">
                        <div class="neural-linking-bar-left">
                            <span class="neural-link-badge claude-only">Claude Only</span>
                            <span class="neural-linking-bar-title" style="color: var(--text3); text-transform: none; font-weight: normal; font-size: 12.5px;">Esta conversación todavía no tiene una sesión Jules vinculada.</span>
                        </div>
                        <div class="neural-linking-bar-actions">
                            <button class="btn btn-primary btn-xs" id="btn-create-jules-task" style="box-shadow: 0 0 10px rgba(124, 58, 237, 0.2);"><i class="fas fa-plus mr-1"></i> Crear sesión Jules</button>
                            <button class="btn btn-ghost btn-xs" id="btn-link-jules-task" style="color: var(--accent2);"><i class="fas fa-link mr-1"></i> Vincular sesión existente</button>
                        </div>
                    </div>
                `;

                const btnCreate = document.getElementById('btn-create-jules-task');
                const btnLink = document.getElementById('btn-link-jules-task');

                if (btnCreate) {
                    btnCreate.onclick = () => {
                        window.startLinkedJulesCreationFlow();
                    };
                }
                if (btnLink) {
                    btnLink.onclick = () => {
                        window.openJulesTaskSelector();
                    };
                }
            }
        }
    }

    // Update Linking Status Bar (Legacy compatibility fallback)
    const statusLabel = $('chat-live-status');
    const statusMonitor = $('chat-live-monitor');
    const statusDot = statusMonitor ? statusMonitor.querySelector('.live-dot') : null;

    if (!session) {
        if (statusLabel) statusLabel.innerHTML = 'No hay conversación activa vinculada. <button onclick="window.openClaudeSessionSelector()" class="btn btn-ghost btn-xs" style="color:var(--accent2); text-decoration:underline; margin-left:10px">Elegir conversación</button>';
        if (statusMonitor) statusMonitor.classList.remove('hidden');
        if (statusDot) statusDot.style.background = 'var(--text3)';
    } else {
        // Expanded Linkage Logic
        const isLinked = Boolean(
            session.linkedJulesTaskId ||
            session.julesTaskId ||
            session.julesSessionId ||
            session.metadata?.linkedJulesTaskId ||
            session.metadata?.julesTaskId ||
            session.metadata?.julesSessionId
        );
        const linkedTitle = isLinked ? (session.metadata?.linkedJulesTaskTitle || session.metadata?.linkedJulesTaskId || session.julesTaskId || session.julesSessionId || 'Vinculada') : 'Ninguna';

        if (statusLabel) {
            if (isLinked) {
                statusLabel.innerHTML = `Conversación: <strong>${window.NeuralChatCore.escapeHtml(session.title)}</strong> · Jules: <strong>${window.NeuralChatCore.escapeHtml(linkedTitle)}</strong>
                <button onclick="window.openJulesTaskSelector()" class="btn btn-ghost btn-xs" style="color:var(--accent2); margin-left:10px">Cambiar tarea</button>
                <button onclick="window.unlinkClaudeFromJulesTask('${session.id}')" class="btn btn-ghost btn-xs" style="color:var(--red); margin-left:5px">Desvincular</button>`;
            } else {
                statusLabel.innerHTML = `Conversación: <strong>${window.NeuralChatCore.escapeHtml(session.title)}</strong> · Sin tarea Jules vinculada
                <button onclick="window.openJulesTaskSelector()" class="btn btn-ghost btn-xs" style="color:var(--accent2); margin-left:10px">Vincular tarea Jules</button>`;
            }
        }
        if (statusMonitor) statusMonitor.classList.remove('hidden');

        // Update Dot Color
        if (statusDot) {
            statusDot.style.background = isLinked ? 'var(--accent)' : 'var(--green)';
            statusDot.style.boxShadow = isLinked ? '0 0 8px var(--accent)' : '0 0 8px var(--green)';
        }
    }

    if (!session) return;

    const welcome = container.querySelector('#v2-welcome-screen');
    if (session.messages.length > 0) {
        if (welcome) welcome.style.display = 'none';
    } else {
        if (welcome) welcome.style.display = 'flex';
        container.innerHTML = '';
        container.appendChild(welcome);
        return;
    }

    const welcomeHTML = welcome ? welcome.outerHTML : '';
    container.innerHTML = welcomeHTML;

    // Al renderizar historial, nos aseguramos que el indicador esté oculto
    setNeuralProcessingState(false);

    const githubUser = window.githubApi ? window.githubApi.user : null;

    session.messages.forEach((msg, idx) => {
        const div = document.createElement('div');
        div.className = 'jules-activity-entry jules-activity-entry--' + (msg.role === 'assistant' ? 'agent' : 'user');
        div.dataset.id = 'local-' + idx;

        const isAssistant = msg.role === 'assistant';
        const isJules = msg.source === 'jules';
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('es-ES') : '--:--';

        let iconHTML = isAssistant ? '🤖' : '👤';
        let displayName = isJules ? 'JULES' : (isAssistant ? 'CLAUDE' : 'USUARIO');

        // Apply Authenticated User Identity if role is user
        if (!isAssistant && githubUser) {
            displayName = githubUser.login || githubUser.name || 'USUARIO';
            if (githubUser.avatar_url) {
                iconHTML = '<img src="' + githubUser.avatar_url + '" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">';
            }
        }

        const actionBtn = isAssistant ?
            '<div class="neural-message-actions absolute -bottom-3 right-4 flex gap-1.5 z-10">' +
              '<button onclick="window.copyMessage(' + idx + ')" class="neural-action-mini" title="Copiar respuesta">' +
                '<i class="fas fa-copy"></i> <span class="desktop-only">Copiar</span>' +
              '</button>' +
              '<button class="neural-action-mini" title="Enviar a Jules" onclick="window.sendToJulesFromLocal(' + idx + ')">' +
                '<i class="fas fa-bolt"></i> <span class="desktop-only">→ Jules</span>' +
              '</button>' +
            '</div>' : '';

        const renderedContent = isAssistant && window.marked ? marked.parse(msg.content) : window.NeuralChatCore.escapeHtml(msg.content);

        div.innerHTML =
            '<span class="activity-icon">' + iconHTML + '</span>' +
            '<div class="activity-body">' +
              '<div class="activity-header">' +
                '<span class="activity-originator">' + displayName + '</span>' +
                '<span class="activity-time">' + time + '</span>' +
              '</div>' +
              '<div class="activity-content">' + renderedContent + '</div>' +
              actionBtn +
            '</div>';

        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}

// "Revisar Cambios" Logic
document.addEventListener('DOMContentLoaded', () => {
    const optReview = $('opt-review');
    if (optReview) {
        optReview.addEventListener('click', async () => {
            if (optReview.classList.contains('active')) {
                await openReviewChangesMode();
            }
        });
    }
});

async function openReviewChangesMode() {
    const repo = window.JulesPanelState.activeRepo ? window.JulesPanelState.activeRepo.replace('sources/github/', '') : null;
    const branch = window.JulesPanelState.activeBranch;

    if (!repo || !branch) {
        showToast("Selecciona un repo y rama para revisar cambios", "amber");
        return;
    }

    addTel("SYSTEM", "Cargando cambios para revisión en " + branch, "info");

    try {
        const token = getGitHubToken();
        const repoInfo = await window.githubApi.getRepo(repo);
        const base = repoInfo.default_branch;

        const res = await fetch('https://api.github.com/repos/' + repo + '/compare/' + base + '...' + branch, {
            headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.v3.diff' }
        });

        if (!res.ok) throw new Error("No se pudo obtener el diff de GitHub");

        const diff = await res.text();

        if (!diff || diff.trim().length === 0) {
            showToast("No hay cambios pendientes en esta rama respecto a " + base, "info");
            return;
        }

        const drawer = $('drawer');
        const overlay = $('dr-overlay');
        if (drawer && overlay) {
            drawer.classList.add('open');
            overlay.classList.add('open');
            $('dr-title').innerText = 'Revisar Cambios: ' + branch;
            $('dr-sub').innerText = repo;
            switchDrawerTab('diff', document.querySelectorAll('.dr-tab')[1]);
            const diffCont = $('diff-content');
            if (diffCont) {
                diffCont.innerHTML = '<pre class="diff-viewer">' + window.NeuralChatCore.escapeHtml(diff) + '</pre>';
            }
        }
    } catch (e) {
        console.error("Review changes failed", e);
        showToast("Error al cargar cambios: " + e.message, "red");
    }
}

window.switchDrawerTab = function(tab, el) {
    document.querySelectorAll('.dr-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    document.querySelectorAll('.dr-panel').forEach(p => p.classList.remove('active'));
    const panel = $('dr-panel-' + tab);
    if (panel) panel.classList.add('active');
}

window.setSendMode = function(mode) {
    window.setNeuralWorkspaceMode(mode);
};

window.toggleSessionDrawer = function() {
    const drawer = $('sessions-drawer');
    const overlay = $('sessions-drawer-overlay');
    if (!drawer || !overlay) return;

    const isOpen = drawer.classList.toggle('open');
    overlay.classList.toggle('open');

    if (isOpen) {
        window.renderJulesPanelSessionDrawerList();
    }
}

window.renderJulesPanelSessionDrawerList = function() {
    const listContainer = $('sessions-drawer-list');
    if (!listContainer) return;

    const sessions = [...window.julesPanelSessions]
        .filter(s => !s.archived)
        .sort((a, b) => {
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

    if (sessions.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text3); font-size:13px;">No hay sesiones guardadas</div>';
        return;
    }

    listContainer.innerHTML = sessions.map(function(s) {
        const shortId = s.id ? s.id.substring(s.id.lastIndexOf('_') + 1).substring(0, 8) : '--------';
        const timeLabel = window.getTimeAgo ? window.getTimeAgo(s.createdAt) : s.createdAt;

        return '<div class="session-drawer-item' + (s.id === window.currentJulesPanelSessionId ? ' active' : '') + '" onclick="window.selectJulesPanelSessionFromDrawer(\'' + s.id + '\')" style="padding:14px; border:1px solid var(--border); border-radius:var(--r-sm); cursor:pointer; transition:all 0.2s; background:var(--surface); margin-bottom: 8px; position: relative;">' +
                '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px; padding-right: 70px;">' +
                    '<span style="font-family:var(--font-mono); font-size:10px; color:var(--accent2); font-weight:700;">#' + shortId + '</span>' +
                    '<span style="font-size:10px; color:var(--text3);">' + timeLabel + '</span>' +
                '</div>' +
                '<div style="font-size:13px; font-weight:600; color:var(--text); line-height:1.4; word-break:break-word; padding-right: 70px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">' + window.NeuralChatCore.escapeHtml(s.title) + '</div>' +
                '<div class="session-drawer-actions" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); display: flex; gap: 6px;">' +
                    '<button onclick="window.renameJulesPanelSession(event, \'' + s.id + '\')" class="session-action-btn" title="Renombrar"><i class="fas fa-edit"></i></button>' +
                    '<button onclick="window.archiveJulesPanelSession(event, \'' + s.id + '\')" class="session-action-btn" title="Archivar"><i class="fas fa-archive"></i></button>' +
                    '<button onclick="window.deleteJulesPanelSession(event, \'' + s.id + '\')" class="session-action-btn danger" title="Borrar"><i class="fas fa-trash"></i></button>' +
                '</div>' +
            '</div>';
    }).join('');
}

window.selectJulesPanelSessionFromDrawer = function(id) {
    window.toggleSessionDrawer();
    window.loadJulesPanelSession(id);
}

window.copyMessage = function(idx) {
    const session = window.julesPanelSessions.find(s => s.id === window.currentJulesPanelSessionId);
    if (session && session.messages[idx]) {
        const text = session.messages[idx].content;
        navigator.clipboard.writeText(text);
        showToast('Copiado al portapapeles', 'green');
    }
}

window.sendToJulesFromLocal = function(idx) {
    const session = window.julesPanelSessions.find(s => s.id === window.currentJulesPanelSessionId);
    if (!session || !session.messages[idx]) return;
    const msg = session.messages[idx];

    const promptTextarea = document.querySelector('#session-prompt');
    if (promptTextarea) {
        promptTextarea.value = msg.content;
        if (window.switchView) window.switchView('neural');
        showToast('Prompt cargado en Jules ⚡', 'green');
    }
}

window.sendNeuralMessage = async function() {
    const input = $('v2-chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    // Safety check: LINKED_SESSION_MISMATCH
    const activeClaudeId = window.NeuralWorkspaceState?.activeClaudeConversationId;
    if (activeClaudeId) {
        const session = window.julesPanelSessions.find(s => s.id === activeClaudeId);
        const expectedJulesId = window.resolveLinkedJulesId(session);
        if (expectedJulesId) {
            const cleanExpected = expectedJulesId.replace('sessions/', '');
            const cleanActiveJules = window.NeuralWorkspaceState.activeJulesSessionId ? window.NeuralWorkspaceState.activeJulesSessionId.replace('sessions/', '') : '';
            if (cleanExpected !== cleanActiveJules) {
                // Reconcile and block
                window.NeuralWorkspaceState.activeJulesSessionId = cleanExpected;
                window.persistNeuralWorkspaceState();
                showToast("Discrepancia detectada (LINKED_SESSION_MISMATCH). Workspace reconciliado. Reintente el envío.", "red");
                window.setNeuralWorkspaceMode(window.NeuralWorkspaceState.activeMode);
                throw new Error('LINKED_SESSION_MISMATCH');
            }
        }
    }

    const sid = getLinkedJulesSessionId();
    if (!sid) {
        // Intercept and open linkers
        window.handleJulesSendInterception(msg);
        return;
    }

    const targetId = sid.startsWith('sessions/') ? sid : 'sessions/' + sid;
    input.value = '';

    const session = window.julesPanelSessions.find(s => s.id === window.currentJulesPanelSessionId);
    if (session) {
        session.messages.push({ role: 'user', content: msg, timestamp: Date.now() });
        saveJulesPanelSessions();
        window.renderChatV2Messages();
    }

    try {
        const ok = await window.julesApi.sendMessage(targetId, msg);
        if (ok) {
            addTel("USER", "Mensaje enviado a Jules", "info");
            refreshActivities(sid);
        }
    } catch (e) {
        showToast("Error al enviar: " + e.message, "red");
    }
}

window.approvePlan = async function(sessionId) {
    try {
        const sid = sessionId.startsWith('sessions/') ? sessionId : 'sessions/' + sessionId;
        await window.julesApi.approvePlan(sid);
        showToast("Plan aprobado. Jules comenzará la ejecución.", "green");
        addTel("USER", "Plan aprobado", "success");
        refreshActivities(sessionId);
    } catch (e) {
        showToast("Error al aprobar plan: " + e.message, "red");
    }
}

// Ensure error handling doesn't use template literals
/**
 * Intercepta el envío a Jules cuando falta contexto (Conversación o Tarea)
 */
window.handleJulesSendInterception = function(message) {
    window.pendingJulesMessage = message;

    // 1. Validar conversación Claude
    if (!window.currentJulesPanelSessionId) {
        window.openClaudeSessionSelector();
        return;
    }

    // 2. Validar vínculo a tarea Jules
    const sid = getLinkedJulesSessionId();
    if (!sid) {
        window.openJulesTaskSelector();
        return;
    }

    // Si llegamos aquí por error, reintentar envío normal
    window.sendNeuralMessage();
}

/**
 * Abre un selector para elegir una conversación de Claude existente
 */
window.openClaudeSessionSelector = function(linkJulesSessionId = '', julesSessionTitle = '') {
    const sessions = window.NeuralChatCore.getSessions(window.JULES_PANEL_NEURAL_STORAGE);

    let html = `<div style="margin-bottom:15px; font-size:13px; color:var(--text2)">${linkJulesSessionId ? 'Selecciona una conversación de Claude para vincular con esta sesión Jules:' : 'Selecciona una conversación de Claude para activar en el panel:'}</div>`;

    if (sessions.length === 0) {
        html += '<div style="padding:20px; text-align:center; border:1px dashed var(--border); border-radius:8px; font-size:12px;">No hay conversaciones disponibles.</div>';
    } else {
        html += '<div style="max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">';
        sessions.slice(0, 15).forEach(s => {
            const escapedTitle = window.NeuralChatCore.escapeHtml(s.title);
            const escapedJulesTitle = window.NeuralChatCore.escapeHtml(julesSessionTitle).replace(/'/g, "\\'");
            html += `<button onclick="window.selectClaudeFromSelector('${s.id}', '${linkJulesSessionId}', '${escapedJulesTitle}')" class="btn btn-ghost" style="width:100%; justify-content:flex-start; text-align:left; padding:10px; height:auto;">
                <div style="font-weight:700; font-size:12px; margin-bottom:2px;">${escapedTitle}</div>
                <div style="font-size:10px; color:var(--text3); font-family:var(--font-mono); opacity:0.7;">ID: ${s.id.slice(-8)} · ${new Date(s.createdAt).toLocaleDateString()}</div>
            </button>`;
        });
        html += '</div>';
    }

    // Usar modal genérico si existe o crear uno rápido
    const modalHtml = `
        <div id="neural-selector-modal" class="modal-overlay open" style="z-index:9999">
            <div class="modal-card glass" style="max-width:400px">
                <div class="modal-head">
                    <h3 class="modal-title">${linkJulesSessionId ? 'Vincular Claude' : 'Conversación Claude'}</h3>
                    <button class="icon-btn" onclick="document.getElementById('neural-selector-modal').remove()">✕</button>
                </div>
                <div class="modal-body">${html}</div>
                <div class="modal-foot">
                    ${linkJulesSessionId ? '' : `<button class="btn btn-primary btn-sm" onclick="window.createNewJulesPanelSession(); document.getElementById('neural-selector-modal').remove(); setTimeout(()=>window.handleJulesSendInterception(window.pendingJulesMessage), 300);">+ Nueva Conversación</button>`}
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('neural-selector-modal').remove()">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.selectClaudeFromSelector = function(id, linkJulesSessionId = '', julesSessionTitle = '') {
    const modal = document.getElementById('neural-selector-modal');
    if (modal) modal.remove();

    if (linkJulesSessionId) {
        window.linkClaudeToJulesTask(id, linkJulesSessionId, julesSessionTitle);
        // Automatically select the freshly linked Jules session
        window.selectLinkedJulesSession(linkJulesSessionId);
    } else {
        window.loadJulesPanelSession(id);
        // Re-evaluar siguiente paso
        setTimeout(() => window.handleJulesSendInterception(window.pendingJulesMessage), 100);
    }
}

window.openClaudeSessionSelectorForJulesSession = function(sid, title) {
    window.openClaudeSessionSelector(sid, title);
};

/**
 * Abre un selector para elegir una tarea de Jules (Jules Session) real
 */
window.openJulesTaskSelector = function() {
    const tasks = window.julesSessionsCache || [];

    let html = '<div style="margin-bottom:15px; font-size:13px; color:var(--text2)">Selecciona la tarea de Jules a la que quieres enviar este mensaje:</div>';

    if (tasks.length === 0) {
        html += '<div style="padding:20px; text-align:center; border:1px dashed var(--border); border-radius:8px; font-size:12px;">No se encontraron tareas de Jules recientes.</div>';
    } else {
        html += '<div style="max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">';
        tasks.slice(0, 15).forEach(t => {
            const sid = t.name.split('/').pop();
            const title = t.title || t.prompt || 'Sin título';
            html += `<button onclick="window.selectJulesTaskFromSelector('${sid}', '${window.NeuralChatCore.escapeHtml(title).replace(/'/g, "\\'")}')" class="btn btn-ghost" style="width:100%; justify-content:flex-start; text-align:left; padding:10px; height:auto;">
                <div style="font-weight:700; font-size:12px; margin-bottom:2px;">${window.NeuralChatCore.escapeHtml(title)}</div>
                <div style="font-size:10px; color:var(--text3); font-family:var(--font-mono); opacity:0.7;">#${sid} · ${t.state}</div>
            </button>`;
        });
        html += '</div>';
    }

    const modalHtml = `
        <div id="neural-selector-modal" class="modal-overlay open" style="z-index:9999">
            <div class="modal-card glass" style="max-width:400px">
                <div class="modal-head">
                    <h3 class="modal-title">Vincular Tarea Jules</h3>
                    <button class="icon-btn" onclick="document.getElementById('neural-selector-modal').remove()">✕</button>
                </div>
                <div class="modal-body">${html}</div>
                <div class="modal-foot">
                    <button class="btn btn-primary btn-sm" onclick="document.getElementById('neural-selector-modal').remove(); switchView('neural'); showToast('Crea la tarea antes de vincularla', 'info');">+ Nueva Tarea Jules</button>
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('neural-selector-modal').remove()">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.selectJulesTaskFromSelector = function(sid, title) {
    document.getElementById('neural-selector-modal').remove();
    window.linkClaudeToJulesTask(window.currentJulesPanelSessionId, sid, title);

    // Todo listo, enviar mensaje final
    if (window.pendingJulesMessage) {
        const input = $('v2-chat-input');
        if (input) input.value = window.pendingJulesMessage;
        window.sendNeuralMessage();
        window.pendingJulesMessage = null;
    }
}

window.handleJulesApiError = function(e) {
    const msg = e.message || ("HTTP " + e.httpStatus);
    showToast("Error de API: " + msg, "red");
    addTel("SYSTEM", "Error API: " + msg, "error");
}

/* ════════════════════════════════════════
   SESSIONS ACTIONS
   ════════════════════════════════════════ */

window.renameJulesPanelSession = function(event, id) {
    if (event) event.stopPropagation();
    const session = window.julesPanelSessions.find(s => s.id === id);
    if (!session) return;

    const newTitle = window.prompt("Renombrar sesión:", session.title);
    if (newTitle !== null && newTitle.trim() !== "") {
        session.title = newTitle.trim();
        saveJulesPanelSessions();
        window.renderJulesPanelSessionDrawerList();
        if (id === window.currentJulesPanelSessionId) {
            window.renderChatV2Messages();
        }
        showToast("Sesión renombrada", "green");
    }
}

/**
 * Vincula una conversación de Claude con una tarea de Jules
 */
window.linkClaudeToJulesTask = function(claudeId, julesTaskId, julesTaskTitle) {
    if (!claudeId || !julesTaskId) return;

    const sessions = window.NeuralChatCore.getSessions(window.JULES_PANEL_NEURAL_STORAGE);
    const session = sessions.find(s => s.id === claudeId);

    if (session) {
        // Enforce 1-to-1 relationship by unlinking any other Claude session that was linked to this same Jules task
        sessions.forEach(s => {
            const lid = window.resolveLinkedJulesId(s);
            if (s.id !== claudeId && lid && lid.replace('sessions/', '') === julesTaskId.replace('sessions/', '')) {
                if (s.metadata) {
                    delete s.metadata.linkedJulesTaskId;
                    delete s.metadata.linkedJulesTaskTitle;
                }
                localStorage.removeItem('hy_neural_session_id_' + s.id);
            }
        });

        session.metadata = session.metadata || {};
        session.metadata.linkedJulesTaskId = julesTaskId;
        session.metadata.linkedJulesTaskTitle = julesTaskTitle || julesTaskId;
        session.metadata.updatedAt = new Date().toISOString();

        window.NeuralChatCore.saveSessions(window.JULES_PANEL_NEURAL_STORAGE, sessions);
        window.loadJulesPanelSessions(); // Refresh local cache

        // Legacy sync
        localStorage.setItem('hy_neural_session_id_' + claudeId, julesTaskId);
        if (claudeId === window.currentJulesPanelSessionId) {
            localStorage.setItem('hy_neural_session_id', julesTaskId);
            window.NeuralWorkspaceState.activeJulesSessionId = julesTaskId;
            window.persistNeuralWorkspaceState();

            // Re-render based on active workspace mode
            if (window.NeuralWorkspaceState.activeMode === 'claude') {
                window.renderChatV2Messages();
            } else {
                window.loadAndRenderJulesSession(julesTaskId, true);
                window.startNeuralWorkspacePolling(julesTaskId);
            }
        }

        showToast("Conversación vinculada a la tarea de Jules", "green");
    }
}

/**
 * Desvincula una conversación de Claude de su tarea de Jules
 */
window.unlinkClaudeFromJulesTask = function(claudeId) {
    if (!claudeId) return;

    const sessions = window.NeuralChatCore.getSessions(window.JULES_PANEL_NEURAL_STORAGE);
    const session = sessions.find(s => s.id === claudeId);

    if (session && session.metadata) {
        delete session.metadata.linkedJulesTaskId;
        delete session.metadata.linkedJulesTaskTitle;
        session.metadata.updatedAt = new Date().toISOString();

        window.NeuralChatCore.saveSessions(window.JULES_PANEL_NEURAL_STORAGE, sessions);
        window.loadJulesPanelSessions();

        // Legacy cleanup
        localStorage.removeItem('hy_neural_session_id_' + claudeId);
        if (claudeId === window.currentJulesPanelSessionId) {
            localStorage.removeItem('hy_neural_session_id');
            window.NeuralWorkspaceState.activeJulesSessionId = null;
            window.persistNeuralWorkspaceState();

            if (window.NeuralWorkspaceState.activeMode === 'claude') {
                window.renderChatV2Messages();
            } else {
                window.renderJulesEmptyState();
                window.stopNeuralWorkspacePolling();
            }
        }

        showToast("Vínculo con Jules eliminado", "amber");
    }
}

window.archiveJulesPanelSession = function(event, id) {
    if (event) event.stopPropagation();
    const session = window.julesPanelSessions.find(s => s.id === id);
    if (!session) return;

    session.archived = true;
    saveJulesPanelSessions();

    if (id === window.currentJulesPanelSessionId) {
        // Find next non-archived session
        const nextSession = window.julesPanelSessions.find(s => !s.archived);
        if (nextSession) {
            window.loadJulesPanelSession(nextSession.id);
        } else {
            window.createNewJulesPanelSession();
        }
    }

    window.renderJulesPanelSessionDrawerList();
    showToast("Sesión archivada", "amber");
}

window.deleteJulesPanelSession = function(event, id) {
    if (event) event.stopPropagation();

    const session = window.julesPanelSessions.find(s => s.id === id);
    if (!session) return;
    const sessionTitle = session.title;

    const performDelete = () => {
        const index = window.julesPanelSessions.findIndex(s => s.id === id);
        if (index === -1) return;

        window.julesPanelSessions.splice(index, 1);
        saveJulesPanelSessions();

        if (id === window.currentJulesPanelSessionId) {
            const nextSession = window.julesPanelSessions.find(s => !s.archived);
            if (nextSession) {
                window.loadJulesPanelSession(nextSession.id);
            } else {
                window.createNewJulesPanelSession();
            }
        }

        window.renderJulesPanelSessionDrawerList();
        window.renderNeuralChatHistory();
        showToast("Sesión eliminada", "red");
    };

    const isLinked = !!(session.metadata && session.metadata.linkedJulesTaskId);
    const confirmMsg = isLinked ?
        'Esta conversación está vinculada a una tarea Jules. Se borrará el historial local, pero no la tarea remota. ¿Continuar?' :
        "¿Seguro que quieres borrar la sesión \"" + sessionTitle + "\"? Esta acción no se puede deshacer.";

    if (window.showConfirmationToast) {
        window.showConfirmationToast(confirmMsg, performDelete);
    } else if (window.confirm(confirmMsg)) {
        performDelete();
    }
}

/* ════════════════════════════════════════
   CANONICAL HISTORY LOADER & NORMALIZER
   ════════════════════════════════════════ */

window.linkedHistoryLoadRevision = 0;

window.escapeHtml = function(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
};

window.decodeHtmlEntities = function(str) {
    if (!str || typeof str !== 'string') return '';
    const entityMap = {
        '&#039;': "'",
        '&#39;': "'",
        '&apos;': "'",
        '&quot;': '"',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&middot;': '·',
        '&bull;': '•'
    };
    let decoded = str.replace(/&(amp|lt|gt|quot|apos|middot|bull|#\d+|#[xX][a-fA-F0-9]+);/g, function(match, name) {
        if (entityMap[match]) {
            return entityMap[match];
        }
        if (match.startsWith('&#x') || match.startsWith('&#X')) {
            const hex = match.substring(3, match.length - 1);
            return String.fromCharCode(parseInt(hex, 16));
        }
        if (match.startsWith('&#')) {
            const dec = match.substring(2, match.length - 1);
            return String.fromCharCode(parseInt(dec, 10));
        }
        return match;
    });
    return decoded;
};

window.resolveLinkedJulesId = function(conversation) {
    if (!conversation) return null;
    return conversation.linkedJulesTaskId ||
           conversation.linkedJulesSessionId ||
           conversation.julesTaskId ||
           conversation.julesSessionId ||
           conversation.metadata?.linkedJulesTaskId ||
           conversation.metadata?.linkedJulesSessionId ||
           conversation.metadata?.julesTaskId ||
           conversation.metadata?.julesSessionId ||
           localStorage.getItem('hy_neural_session_id_' + conversation.id);
}

window.normalizeJulesActivity = function(raw, sessionId) {
    if (!raw) return null;

    // Deep clone to avoid mutating the original
    const act = JSON.parse(JSON.stringify(raw));

    // Ensure session ID
    act.sessionId = sessionId;

    // Resolve createTime
    const rawTime = act.createTime || act.create_time || act.timestamp || act.updateTime || act.update_time || act.createdAt || act.created_at;
    act.createTime = rawTime ? new Date(rawTime).toISOString() : new Date().toISOString();

    // Resolve id
    if (!act.id) {
        act.id = act.activityId || act.messageId || act.eventId || `gen-${sessionId}-${new Date(act.createTime).getTime()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Resolve originator
    let originator = act.originator || act.actor || 'system';
    if (act.role === 'user' || act.userMessaged) {
        originator = 'user';
    } else if (act.role === 'assistant' || act.role === 'agent' || act.agentMessaged) {
        originator = 'agent';
    }
    act.originator = originator;

    // Ensure description / content mapping - DECODED & RAW (not escaped twice)
    const contentText = act.description || act.content || act.text || '';
    act.description = window.decodeHtmlEntities(contentText);

    // Normalize userMessaged / agentMessaged from generic message/role shapes
    if (originator === 'user' && !act.userMessaged) {
        act.userMessaged = { userMessage: act.description };
    } else if (originator === 'agent' && !act.agentMessaged) {
        act.agentMessaged = { agentMessage: act.description };
    } else {
        if (act.userMessaged) act.userMessaged.userMessage = window.decodeHtmlEntities(act.userMessaged.userMessage || '');
        if (act.agentMessaged) act.agentMessaged.agentMessage = window.decodeHtmlEntities(act.agentMessaged.agentMessage || '');
    }

    if (act.progressUpdated) {
        act.progressUpdated.title = window.decodeHtmlEntities(act.progressUpdated.title || '');
        act.progressUpdated.description = window.decodeHtmlEntities(act.progressUpdated.description || '');
    }

    if (act.planGenerated && act.planGenerated.plan && Array.isArray(act.planGenerated.plan.steps)) {
        act.planGenerated.plan.steps.forEach(s => {
            s.title = window.decodeHtmlEntities(s.title || '');
            s.description = window.decodeHtmlEntities(s.description || '');
        });
    }

    if (act.sessionFailed) {
        act.sessionFailed.reason = window.decodeHtmlEntities(act.sessionFailed.reason || '');
    }

    if (act.artifacts && Array.isArray(act.artifacts)) {
        act.artifacts.forEach(art => {
            if (art.changeSet && art.changeSet.gitPatch) {
                art.changeSet.gitPatch.suggestedCommitMessage = window.decodeHtmlEntities(art.changeSet.gitPatch.suggestedCommitMessage || '');
            }
            if (art.bashOutput) {
                art.bashOutput.command = window.decodeHtmlEntities(art.bashOutput.command || '');
                art.bashOutput.output = window.decodeHtmlEntities(art.bashOutput.output || '');
            }
        });
    }

    return act;
}

window.generateActivitySignature = function(act) {
    if (!act) return '';
    const type = act.agentMessaged ? 'agent' : (act.userMessaged ? 'user' : (act.progressUpdated ? 'progress' : (act.planGenerated ? 'plan' : 'other')));
    const content = act.agentMessaged?.agentMessage || act.userMessaged?.userMessage || act.progressUpdated?.title || act.description || '';
    const ts = act.createTime ? new Date(act.createTime).getTime() : 0;
    const actor = act.originator || '';
    return `${type}-${ts}-${actor}-${content.substring(0, 100)}`;
}

window.deduplicateActivities = function(activities) {
    if (!activities) return [];
    const seenIds = new Set();
    const seenSignatures = new Set();
    const unique = [];

    for (const act of activities) {
        const id = act.id;
        const sig = window.generateActivitySignature(act);

        if (seenIds.has(id)) continue;
        if (sig && seenSignatures.has(sig)) continue;

        seenIds.add(id);
        if (sig) seenSignatures.add(sig);
        unique.push(act);
    }
    return unique;
}

window.renderJulesActivityToHTML = function(act) {
    try {
        if (window.JulesActivitiesModule && typeof window.JulesActivitiesModule.activityToHTML === 'function') {
            return window.JulesActivitiesModule.activityToHTML(act);
        }
    } catch (e) {
        console.warn("[Jules History] Failed rich render, falling back", e);
    }
    if (typeof window.renderActivityLine === 'function') {
        return window.renderActivityLine(act);
    }
    return `<div class="jules-activity-entry"><div>${act.description || ''}</div></div>`;
}

window.clearLinkedJulesHistory = function() {
    const historyContainer = document.getElementById('neural-jules-history');
    if (historyContainer) historyContainer.innerHTML = '';
    const welcomeScreen = document.getElementById('history-welcome-screen');
    if (welcomeScreen) {
        welcomeScreen.classList.remove('hidden');
        welcomeScreen.style.display = 'flex';
        welcomeScreen.innerHTML = `
            <div style="font-size: 40px;">⚡</div>
            <h3 style="font-family: var(--font-head); font-weight: 700; font-size: 16px;">Jules Execution History</h3>
            <p style="max-width: 260px; font-size: 12px;">Aquí se mostrará el progreso real de Jules, cambios de código y logs de ejecución.</p>
        `;
    }
}

window.setJulesHistoryState = function(state, errorMsg = null) {
    const historyContainer = document.getElementById('neural-jules-history');
    const welcomeScreen = document.getElementById('history-welcome-screen');

    if (!welcomeScreen) return;

    if (state === 'none') {
        window.clearLinkedJulesHistory();
    } else if (state === 'loading') {
        if (historyContainer) historyContainer.innerHTML = '';
        welcomeScreen.classList.remove('hidden');
        welcomeScreen.style.display = 'flex';
        welcomeScreen.innerHTML = `
            <div class="auth-loading-spinner" style="width: 24px; height: 24px; border-width: 2px; margin-bottom: 10px;"></div>
            <h3 style="font-family: var(--font-head); font-weight: 700; font-size: 14px;">Cargando historial de Jules...</h3>
            <p style="max-width: 260px; font-size: 11px; opacity: 0.7;">Buscando actividades en la caché y la API neural...</p>
        `;
    } else if (state === 'empty') {
        if (historyContainer) historyContainer.innerHTML = '';
        welcomeScreen.classList.remove('hidden');
        welcomeScreen.style.display = 'flex';
        welcomeScreen.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 10px;">📋</div>
            <h3 style="font-family: var(--font-head); font-weight: 700; font-size: 14px;">Sin actividad todavía</h3>
            <p style="max-width: 260px; font-size: 11px; opacity: 0.7;">Esta sesión está vinculada, pero aún no tiene actividades ni progreso registrado.</p>
        `;
    } else if (state === 'error') {
        welcomeScreen.classList.add('hidden');
        welcomeScreen.style.display = 'none';
        if (historyContainer) {
            historyContainer.innerHTML = `
                <div class="jules-activity-entry" style="border-left: 3px solid var(--red); background: rgba(239, 68, 68, 0.05); padding: 12px; border-radius: 4px; margin: 10px 0;">
                    <div style="color: var(--red); font-weight: bold; margin-bottom: 4px;"><i class="fas fa-exclamation-circle mr-2"></i> Error al cargar el historial</div>
                    <div style="font-size: 11px; opacity: 0.8;">${errorMsg || 'No se pudo recuperar la información de la sesión Jules.'}</div>
                </div>
            `;
        }
    } else if (state === 'ready') {
        welcomeScreen.classList.add('hidden');
        welcomeScreen.style.display = 'none';
    }
}

window.julesHistoryLimit = 50;
window.lastNormalizedList = null;
window.unseenJulesActivitiesCount = 0;
window.previousListLength = 0;

window.loadPreviousJulesActivities = function(event) {
    if (event) event.preventDefault();
    const scrollContainer = document.getElementById('jules-history-container');
    if (!scrollContainer) return;

    const previousScrollHeight = scrollContainer.scrollHeight;
    const previousScrollTop = scrollContainer.scrollTop;

    // Increase visual pagination limit by 50
    window.julesHistoryLimit = (window.julesHistoryLimit || 50) + 50;

    // Re-render visually over cached list
    if (window.lastNormalizedList) {
        window.renderNormalizedActivities(window.lastNormalizedList, false);
    }

    // Preserve visual scroll position exactly
    scrollContainer.scrollTop = previousScrollTop + (scrollContainer.scrollHeight - previousScrollHeight);
};

window.scrollToLastActivity = function(event) {
    if (event) event.preventDefault();
    const scrollContainer = document.getElementById('jules-history-container');
    if (!scrollContainer) return;

    scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
    });

    const btn = document.getElementById('jules-scroll-bottom-btn');
    if (btn) {
        btn.classList.remove('visible');
    }
    window.unseenJulesActivitiesCount = 0;
};

window.initJulesHistoryScrollListener = function() {
    const scrollContainer = document.getElementById('jules-history-container');
    if (!scrollContainer || scrollContainer._scrollListenerWired) return;

    scrollContainer._scrollListenerWired = true;
    scrollContainer.addEventListener('scroll', () => {
        const distanceFromBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
        const isNearBottom = distanceFromBottom <= 100;

        if (isNearBottom) {
            const btn = document.getElementById('jules-scroll-bottom-btn');
            if (btn) {
                btn.classList.remove('visible');
            }
            window.unseenJulesActivitiesCount = 0;
        }
    });
};

window.toggleCollapsibleBlock = function(event, id) {
    if (event) event.preventDefault();
    const el = document.getElementById(id);
    const btn = event.currentTarget || event.target;
    if (!el || !btn) return;

    if (el.classList.contains('collapsed')) {
        el.classList.remove('collapsed');
        el.style.maxHeight = el.scrollHeight + 'px';
        btn.textContent = 'Mostrar menos';
    } else {
        el.classList.add('collapsed');
        el.style.maxHeight = '240px';
        btn.textContent = 'Mostrar más';
    }
};

window.setupCollapsibleHeightChecks = function() {
    const entries = document.querySelectorAll('.jules-timeline-entry .entry-content');
    entries.forEach(el => {
        // Skip if already processed
        if (el.querySelector('.collapsible-wrapper') || el.classList.contains('collapsible-processed')) return;

        const charLength = el.innerText ? el.innerText.length : 0;
        if (el.scrollHeight > 240 || charLength > 1200) {
            el.classList.add('collapsible-processed');
            const rawHtml = el.innerHTML;
            const uniqueId = 'coll-' + Math.random().toString(36).substr(2, 9);

            el.innerHTML = `
                <div class="collapsible-wrapper collapsed" id="${uniqueId}" style="max-height: 240px;">
                    ${rawHtml}
                </div>
                <button class="collapsible-toggle" onclick="window.toggleCollapsibleBlock(event, '${uniqueId}')">Mostrar más</button>
            `;
        }
    });
};

window.renderNormalizedActivities = function(normalizedList, forceScroll) {
    if (window.NeuralWorkspaceState?.activeMode !== 'jules') {
        console.log("[Jules History] Blocked render: activeMode is not jules.");
        return;
    }

    const historyContainer = document.getElementById('neural-jules-history');
    if (!historyContainer) return;

    if (!normalizedList || normalizedList.length === 0) {
        window.setJulesHistoryState('empty');
        return;
    }

    window.setJulesHistoryState('ready');

    // Hide welcome, show history container
    const welcome = document.getElementById('history-welcome-screen');
    if (welcome) {
        welcome.style.display = 'none';
        welcome.classList.add('hidden');
    }
    historyContainer.style.display = 'block';

    // Ensure scroll listener is registered
    window.initJulesHistoryScrollListener();

    // Store in global cache for local pagination actions
    window.lastNormalizedList = normalizedList;
    window.julesHistoryLimit = window.julesHistoryLimit || 50;

    const scrollContainer = document.getElementById('jules-history-container');
    let isNearBottom = false;
    if (scrollContainer) {
        const distanceFromBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
        isNearBottom = distanceFromBottom <= 100; // 100px threshold
    }

    const sorted = [...normalizedList].sort((a, b) => {
        return new Date(a.createTime).getTime() - new Date(b.createTime).getTime();
    });

    // Check if new activities arrived and user is scrolled up
    if (scrollContainer && !forceScroll && !isNearBottom) {
        if (window.previousListLength && sorted.length > window.previousListLength) {
            const diff = sorted.length - window.previousListLength;
            window.unseenJulesActivitiesCount = (window.unseenJulesActivitiesCount || 0) + diff;

            const btn = document.getElementById('jules-scroll-bottom-btn');
            const btnText = document.getElementById('jules-scroll-bottom-text');
            if (btn && btnText) {
                btnText.textContent = `${window.unseenJulesActivitiesCount} nuevas actividades`;
                btn.classList.add('visible');
            }
        }
    }
    window.previousListLength = sorted.length;

    const hasMore = sorted.length > window.julesHistoryLimit;
    const sliced = hasMore ? sorted.slice(-window.julesHistoryLimit) : sorted;

    let html = '';
    if (hasMore) {
        html += `<button class="load-prev-btn" onclick="window.loadPreviousJulesActivities(event)" aria-label="Cargar actividades anteriores"><i class="fas fa-history"></i> Cargar actividades anteriores</button>`;
    }
    html += sliced.map(act => window.renderJulesActivityToHTML(act)).join('');
    historyContainer.innerHTML = html;

    // Run dynamic height check and convert long items to collapsible
    window.setupCollapsibleHeightChecks();

    if (scrollContainer) {
        if (forceScroll || isNearBottom) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;

            // Hide floating button & reset unseen count
            const btn = document.getElementById('jules-scroll-bottom-btn');
            if (btn) {
                btn.classList.remove('visible');
            }
            window.unseenJulesActivitiesCount = 0;
        }
    }
}

window.loadAndRenderJulesSession = async function(sid, forceScroll = false) {
    // Render the Jules inverse linking bar
    if (window.renderJulesLinkingBar) {
        window.renderJulesLinkingBar();
    }

    if (!sid) {
        window.clearLinkedJulesHistory();
        return;
    }

    const revision = window.linkedHistoryLoadRevision;
    const targetSessionName = sid.startsWith('sessions/') ? sid : 'sessions/' + sid;
    const cleanSid = sid.replace('sessions/', '');

    // 1. Load from cache (stale)
    let cachedActivities = [];
    try {
        const cachedStr = localStorage.getItem(`jules_activities_cache_${cleanSid}`);
        if (cachedStr) {
            cachedActivities = JSON.parse(cachedStr);
        }
    } catch (e) {
        console.warn("[Jules History] Failed to parse cached activities", e);
    }

    let renderedSignatures = '';
    if (cachedActivities && cachedActivities.length > 0) {
        const normalized = cachedActivities.map(act => window.normalizeJulesActivity(act, cleanSid)).filter(Boolean);
        const unique = window.deduplicateActivities(normalized);
        window.renderNormalizedActivities(unique, forceScroll);
        renderedSignatures = unique.map(act => window.generateActivitySignature(act)).join('|');
    } else {
        window.setJulesHistoryState('loading');
    }

    // 2. Revalidate asynchronously
    try {
        console.log("REVALIDATION: fetching activities for", targetSessionName);
        const activityData = await window.julesApi.getActivities(targetSessionName, 100);
        const freshRawActivities = activityData.activities || [];
        console.log("REVALIDATION: fetched activities count", freshRawActivities.length);

        if (revision !== window.linkedHistoryLoadRevision) {
            console.log("[Jules History] Stale request discarded (revision changed)", revision, window.linkedHistoryLoadRevision);
            return;
        }

        const currentJulesSid = window.getLinkedJulesSessionId();
        if (currentJulesSid !== cleanSid) {
            console.log("[Jules History] Stale request discarded (active Jules ID changed)");
            return;
        }

        // Merge fresh activities with cached activities to prevent losing any historical records
        let mergedFresh = [...freshRawActivities];
        if (cachedActivities && cachedActivities.length > 0) {
            cachedActivities.forEach(cached => {
                const exists = mergedFresh.some(fresh => (fresh.id && fresh.id === cached.id) || (fresh.messageId && fresh.messageId === cached.messageId));
                if (!exists) {
                    mergedFresh.push(cached);
                }
            });
        }

        // Save merged list to cache
        localStorage.setItem(`jules_activities_cache_${cleanSid}`, JSON.stringify(mergedFresh));

        let mergedRaw = [...mergedFresh];
        try {
            const sessionData = await window.julesApi.getSession(targetSessionName);
            if (sessionData) {
                if (Array.isArray(sessionData.activities)) {
                    mergedRaw = mergedRaw.concat(sessionData.activities);
                }
                if (Array.isArray(sessionData.messages)) {
                    mergedRaw = mergedRaw.concat(sessionData.messages);
                }
                if (Array.isArray(sessionData.events)) {
                    mergedRaw = mergedRaw.concat(sessionData.events);
                }
            }
        } catch (sessErr) {
            console.warn("[Jules History] Failed to load session details fallback", sessErr);
        }

        const normalized = mergedRaw.map(act => window.normalizeJulesActivity(act, cleanSid)).filter(Boolean);
        const unique = window.deduplicateActivities(normalized);
        const newSignatures = unique.map(act => window.generateActivitySignature(act)).join('|');

        if (newSignatures !== renderedSignatures) {
            window.renderNormalizedActivities(unique, forceScroll);
        }
    } catch (err) {
        console.error("[Jules History] API refresh failed:", err);
        if (err.httpStatus === 404 || err.message?.includes('404') || err.message?.toLowerCase().includes('not found')) {
            console.warn("[Jules History] Session not found (404), cleaning up obsolete ID:", cleanSid);
            window.handleObsoleteJulesSession(cleanSid);
            return;
        }
        if (revision === window.linkedHistoryLoadRevision && (!cachedActivities || cachedActivities.length === 0)) {
            window.setJulesHistoryState('error', err.message);
        }
    }
}

window.loadLinkedJulesHistoryForConversation = function(conversation) {
    window.linkedHistoryLoadRevision++;
    window.julesHistoryLimit = 50; // Reset pagination limit on conversation change
    window.unseenJulesActivitiesCount = 0; // Reset unseen activities count
    window.previousListLength = 0; // Reset previous list length tracker

    if (!conversation) {
        window.clearLinkedJulesHistory();
        return;
    }

    const linkedId = window.resolveLinkedJulesId(conversation);
    if (linkedId) {
        window.JulesPanelState.activeSessionId = linkedId;
    } else {
        window.JulesPanelState.activeSessionId = null;
    }

    if (!linkedId) {
        window.clearLinkedJulesHistory();
        return;
    }

    window.loadAndRenderJulesSession(linkedId, true);
}
