/* ════════════════════════════════════════
   JULES PANEL NEURAL & CHAT MODULE
   ════════════════════════════════════════ */

window.JULES_PANEL_NEURAL_STORAGE = 'claude_chat_sessions';
window.JULES_PANEL_NEURAL_ACTIVE_ID = 'hy_active_claude_session_id';

window.julesPanelSessions = [];
window.currentJulesPanelSessionId = null;
window.julesPanelPollInterval = null;

let isNeuralChatProcessing = false;

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
    window.broadcastNeuralEvent('sessions-updated', window.currentJulesPanelSessionId);
}

window.loadJulesPanelSessions = function() {
    window.julesPanelSessions = window.NeuralChatCore.getSessions(window.JULES_PANEL_NEURAL_STORAGE);
    window.currentJulesPanelSessionId = localStorage.getItem(window.JULES_PANEL_NEURAL_ACTIVE_ID);
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
        window.renderNeuralChatHistory();
        setNeuralProcessingState(false);
        return;
    }
    console.log("[Jules Panel Neural] Initializing...");

    migrateJulesPanelSessions();
    setNeuralProcessingState(false);
    window.loadJulesPanelSessions();

    if (window.julesPanelSessions.length === 0 && !window.location.search.includes('skip_auto_session')) {
        window.createNewJulesPanelSession();
    } else if (!window.currentJulesPanelSessionId && !window.location.search.includes('skip_auto_session')) {
        window.loadJulesPanelSession(window.julesPanelSessions[0].id);
    } else {
        window.loadJulesPanelSession(window.currentJulesPanelSessionId);
    }

    // Bind UI Events
    const sendBtn = $('v2-send-btn');
    const chatInput = $('v2-chat-input');

    if (sendBtn) {
        sendBtn.onclick = () => window.sendChatV2Msg();
    }

    // Chat Header Profile Selector Initialization
    const chatProfileBtn = document.getElementById('active-profile-btn-chat');
    const chatProfileDropdown = document.getElementById('profile-dropdown-chat');
    if (chatProfileBtn && chatProfileDropdown) {
        chatProfileBtn.onclick = (e) => {
            e.stopPropagation();
            chatProfileDropdown.classList.toggle('hidden');
        };
        document.addEventListener('click', (e) => {
            if (!chatProfileBtn.contains(e.target) && !chatProfileDropdown.contains(e.target)) {
                chatProfileDropdown.classList.add('hidden');
            }
        });
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

    // Setup Listeners
    window.addEventListener('julesActivitiesUpdated', (e) => {
        const { sessionId, activities } = e.detail;
        const currentJulesSid = getLinkedJulesSessionId();
        if (sessionId === currentJulesSid) {
            _syncJulesActivitiesToSession(activities);
        }
    });

    window.addEventListener('storage', (e) => {
        if (e.key === window.JULES_PANEL_NEURAL_STORAGE || e.key === window.JULES_PANEL_NEURAL_ACTIVE_ID) {
            window.loadJulesPanelSessions();
            if ($('sessions-drawer')?.classList.contains('open')) {
                window.renderJulesPanelSessionDrawerList();
            }
        }
    });

    // Real-time synchronization channel
    window.neuralSyncChannel = new BroadcastChannel('hypenosys_neural_sessions_sync');
    window.neuralSyncChannel.onmessage = (event) => {
        window.handleNeuralSyncMessage(
            event.data,
            () => {
                window.julesPanelSessions = window.NeuralChatCore.getSessions(window.JULES_PANEL_NEURAL_STORAGE);
                window.currentJulesPanelSessionId = localStorage.getItem(window.JULES_PANEL_NEURAL_ACTIVE_ID);
            },
            (sessionId) => {
                if (window.currentJulesPanelSessionId !== sessionId) {
                    window.loadJulesPanelSession(sessionId, true);
                }
            },
            () => {
                window.renderChatV2Messages();
                window.renderNeuralChatHistory();
            }
        );
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
    window.currentJulesPanelSessionId = id;
    localStorage.setItem(window.JULES_PANEL_NEURAL_ACTIVE_ID, id);

    if (!skipBroadcast) {
        window.broadcastNeuralEvent('active-session-changed', id);
    }

    const session = window.julesPanelSessions.find(s => s.id === id);
    if (!session) return;

    // Switch view to chat if not already there
    if (window.switchView) {
        const chatBtn = document.querySelector('.hnav-link[data-view="chat"]');
        window.switchView('chat', chatBtn);
    }

    setNeuralProcessingState(false);
    window.renderChatV2Messages();
    window.renderNeuralChatHistory();

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

    // Direct JULES Mode
    if (window.currentSendMode === 'jules') {
        await window.sendNeuralMessage();
        return;
    }

    // RUNNERS Mode
    if (window.currentSendMode === 'runners') {
        const config = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
        const provider = config.provider || 'none';
        if (provider === 'none') {
            showToast('Configura un proveedor de IA para usar el modo Runners.', 'red');
            return;
        }

        const session = window.julesPanelSessions.find(s => s.id === window.currentJulesPanelSessionId);
        if (!session) {
            window.createNewJulesPanelSession();
            setTimeout(() => window.sendChatV2Msg(), 100);
            return;
        }

        if (!window.JulesExecBridge) {
            showToast('El bridge de ejecución (JulesExecBridge) no está disponible en este momento.', 'red');
            return;
        }

        input.value = '';
        input.style.height = 'auto';

        setNeuralProcessingState(true);
        const thinkingIndicator = $('v2-thinking-indicator');
        if (thinkingIndicator) {
            thinkingIndicator.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-1"></i> IA GENERANDO CÓDIGO...';
        }

        try {
            const requestedLang = window.currentRunnersLang || 'auto';
            const langInstruction = requestedLang === 'auto' ? "Python por defecto, o Javascript si el contexto lo sugiere" : requestedLang.toUpperCase();
            const systemPrompt = `Eres un generador de scripts para ejecución inmediata. Tu objetivo es escribir código funcional (${langInstruction}) que resuelva la petición del usuario. Responde ÚNICAMENTE con el código necesario, sin explicaciones ni bloques de markdown. El código se ejecutará en un sandbox aislado sin internet.`;

            await window.NeuralChatCore.sendMessage({
                session: session,
                userMessage: msg,
                systemPrompt: systemPrompt,
                saveCallback: () => {
                    saveJulesPanelSessions();
                    window.renderNeuralChatHistory();
                },
                onToken: () => {
                    window.renderChatV2Messages();
                },
                onDone: (fullContent) => {
                    setNeuralProcessingState(false);
                    window.renderChatV2Messages();
                    window.renderNeuralChatHistory();

                    // Clean code and execute
                    let cleanCode = fullContent.replace(/```(python|javascript|js)?\n?|```/g, '').trim();
                    let lang = requestedLang;

                    if (lang === 'auto') {
                        lang = (cleanCode.includes('console.log') || cleanCode.includes('const ') || cleanCode.includes('let ')) ? 'javascript' : 'python';
                    }

                    if (window.JulesExecBridge) {
                        const b64 = window.JulesExecBridge.b64EncodeUnicode(cleanCode);
                        window.JulesExecBridge.confirmExecution(b64, lang);
                    }
                },
                onError: (err) => {
                    setNeuralProcessingState(false);
                    showToast("Error generando código: " + err.message, 'red');
                    window.renderChatV2Messages();
                }
            });
        } catch (e) {
            setNeuralProcessingState(false);
            showToast(e.message, 'red');
        }
        return;
    }

    // CLAUDE (AI) Mode
    const session = window.julesPanelSessions.find(s => s.id === window.currentJulesPanelSessionId);
    if (!session) {
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

    try {
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

        const currentSources = window._lastDocsMetadata || [];
        window._lastDocsMetadata = null;

        await window.NeuralChatCore.sendMessage({
            session: session,
            userMessage: msg,
            systemPrompt: dynamicSystemPrompt,
            saveCallback: () => {
                saveJulesPanelSessions();
                window.renderNeuralChatHistory();
            },
            onToken: () => {
                const lastMsg = session.messages[session.messages.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                    lastMsg.sources = currentSources;
                }
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

    // Update Linking Status Bar
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
    window.currentSendMode = mode;
    document.querySelectorAll('.jules-neural-mode-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.mode === mode);
    });
    const wrapper = $('chat-input-wrapper');
    if (wrapper) {
        // wrapper.classList.toggle('mode-jules', mode === 'jules'); // Optional: Add extra styling if needed
    }
    const input = $('v2-chat-input');
    if (input) {
        input.placeholder = mode === 'claude' ? "Pregunta a Claude..." : "Enviar orden directa a Jules...";
    }
}

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
window.openClaudeSessionSelector = function() {
    const sessions = window.NeuralChatCore.getSessions(window.JULES_PANEL_NEURAL_STORAGE);

    let html = '<div style="margin-bottom:15px; font-size:13px; color:var(--text2)">Selecciona una conversación de Claude para activar en el panel:</div>';

    if (sessions.length === 0) {
        html += '<div style="padding:20px; text-align:center; border:1px dashed var(--border); border-radius:8px; font-size:12px;">No hay conversaciones disponibles.</div>';
    } else {
        html += '<div style="max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">';
        sessions.slice(0, 15).forEach(s => {
            html += `<button onclick="window.selectClaudeFromSelector('${s.id}')" class="btn btn-ghost" style="width:100%; justify-content:flex-start; text-align:left; padding:10px; height:auto;">
                <div style="font-weight:700; font-size:12px; margin-bottom:2px;">${window.NeuralChatCore.escapeHtml(s.title)}</div>
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
                    <h3 class="modal-title">Conversación Claude</h3>
                    <button class="icon-btn" onclick="document.getElementById('neural-selector-modal').remove()">✕</button>
                </div>
                <div class="modal-body">${html}</div>
                <div class="modal-foot">
                    <button class="btn btn-primary btn-sm" onclick="window.createNewJulesPanelSession(); document.getElementById('neural-selector-modal').remove(); setTimeout(()=>window.handleJulesSendInterception(window.pendingJulesMessage), 300);">+ Nueva Conversación</button>
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('neural-selector-modal').remove()">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.selectClaudeFromSelector = function(id) {
    document.getElementById('neural-selector-modal').remove();
    window.loadJulesPanelSession(id);
    // Re-evaluar siguiente paso
    setTimeout(() => window.handleJulesSendInterception(window.pendingJulesMessage), 100);
}

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
            window.renderChatV2Messages();
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
            window.renderChatV2Messages();
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
   TAB AND DRAWER INTEGRATION
   ════════════════════════════════════════ */

window.switchJulesPanelChatView = function(view) {
    const chatTab = document.getElementById('tab-chat-v2');
    const activityTab = document.getElementById('tab-activity-v2');
    const chatView = document.getElementById('panel-chat-view');
    const activityView = document.getElementById('panel-activity-view');

    if (view === 'chat') {
        if (chatTab) {
            chatTab.classList.add('border-b-[#bd93f9]', 'text-[#bd93f9]');
            chatTab.classList.remove('border-b-transparent', 'text-[#6272a4]');
        }
        if (activityTab) {
            activityTab.classList.add('border-b-transparent', 'text-[#6272a4]');
            activityTab.classList.remove('border-b-[#bd93f9]', 'text-[#bd93f9]');
        }
        if (chatView) chatView.style.display = 'flex';
        if (activityView) activityView.style.display = 'none';

        window.renderChatV2Messages();
    } else {
        if (activityTab) {
            activityTab.classList.add('border-b-[#bd93f9]', 'text-[#bd93f9]');
            activityTab.classList.remove('border-b-transparent', 'text-[#6272a4]');
        }
        if (chatTab) {
            chatTab.classList.add('border-b-transparent', 'text-[#6272a4]');
            chatTab.classList.remove('border-b-[#bd93f9]', 'text-[#bd93f9]');
        }
        if (chatView) chatView.style.display = 'none';
        if (activityView) activityView.style.display = 'flex';

        const activeId = localStorage.getItem('hy_neural_session_id') || window.getLinkedJulesSessionId();
        if (activeId && window._loadAndRenderActivityTab) {
            window._loadAndRenderActivityTab(activeId);
        }
    }
}

window.toggleContextDrawer = function() {
    const drawer = document.getElementById('v2-context-drawer');
    if (!drawer) return;
    const isClosed = drawer.style.transform === 'translateX(100%)' || drawer.style.transform === '';
    drawer.style.transform = isClosed ? 'translateX(0)' : 'translateX(100%)';

    if (isClosed) {
        window.renderContextDrawerDetails();
    }
}

window.renderContextDrawerDetails = function() {
    const container = document.getElementById('v2-drawer-task-details');
    if (!container) return;

    const taskContextRaw = localStorage.getItem('hy_neural_task_context');
    const repo = localStorage.getItem('hypenosys_active_repo') || '---';
    const branch = localStorage.getItem('hypenosys_active_branch') || '---';

    let html = `
        <div style="margin-bottom: 14px;">
            <div style="font-size: 10px; font-weight: 800; color: var(--accent2); text-transform: uppercase; margin-bottom: 4px;">Repositorio</div>
            <div style="font-family: var(--font-mono); font-size: 11px; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: var(--r-sm); border: 1px solid var(--border); overflow: hidden; text-overflow: ellipsis;">${repo}</div>
        </div>
        <div style="margin-bottom: 14px;">
            <div style="font-size: 10px; font-weight: 800; color: var(--accent2); text-transform: uppercase; margin-bottom: 4px;">Rama Activa</div>
            <div style="font-family: var(--font-mono); font-size: 11px; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: var(--r-sm); border: 1px solid var(--border); overflow: hidden; text-overflow: ellipsis;">${branch}</div>
        </div>
    `;

    if (taskContextRaw) {
        try {
            const task = JSON.parse(taskContextRaw);
            html += `
                <div style="margin-bottom: 14px; border-top: 1px solid var(--border); padding-top: 14px;">
                    <div style="font-size: 10px; font-weight: 800; color: var(--accent2); text-transform: uppercase; margin-bottom: 4px;">Tarea Vinculada</div>
                    <div style="font-weight: 700; color: #fff; margin-bottom: 6px;">#${task.id} - ${task.titulo || task.title}</div>
                    <div style="font-size: 11px; line-height: 1.5; background: rgba(0,0,0,0.1); padding: 10px; border-radius: var(--r-sm); border: 1px solid var(--border); max-height: 150px; overflow-y: auto;">
                        ${task.descripcion || task.description || 'Sin descripción.'}
                    </div>
                </div>
            `;
        } catch (e) {
            console.warn("[Context Drawer] Error parsing task context:", e);
        }
    } else {
        html += `
            <div style="margin-bottom: 14px; border-top: 1px solid var(--border); padding-top: 14px; text-align: center; padding: 20px 0; color: var(--text3);">
                <i class="fas fa-unlink" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                Sin tarea Jules vinculada.
            </div>
        `;
    }

    container.innerHTML = html;
}

/* ════════════════════════════════════════
   ACTIVIDAD TAB & LINE SELECTION
   ════════════════════════════════════════ */

window._loadAndRenderActivityTab = async function(sessionId) {
    const container = document.getElementById('neural-jules-history');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text3);"><i class="fas fa-spinner fa-spin mr-2"></i> Cargando historial...</div>';

    try {
        const path = sessionId.startsWith('sessions/') ? sessionId : 'sessions/' + sessionId;
        const data = await window.julesApi.getActivities(path, 50);
        const activities = data.activities || [];

        if (activities.length === 0) {
            container.innerHTML = '<div class="notif-empty" style="padding: 40px; text-align: center; color: var(--text3);">Sin actividad en esta sesión</div>';
            return;
        }

        const welcomeScreen = document.getElementById('history-welcome-screen');
        if (welcomeScreen) welcomeScreen.style.display = 'none';

        container.innerHTML = activities.reverse().map(act => {
            const time = new Date(act.createTime).toLocaleTimeString();
            const id = act.id;
            let type = 'INFO';
            let content = act.description || '';
            let extra = '';

            if (act.userMessaged) { type = 'USER'; content = act.userMessaged.userMessage; }
            else if (act.agentMessaged) { type = 'AGENT'; content = act.agentMessaged.agentMessage; }
            else if (act.planGenerated) {
                type = 'PLAN';
                content = 'Plan generado';
                const steps = act.planGenerated.plan?.steps || [];
                extra = `<ol class="jules-plan-steps" style="margin-top: 8px; padding-left: 20px;">${steps.map(s =>
                    `<li><strong>${s.title}</strong>${s.description ? ': ' + s.description : ''}</li>`
                ).join('')}</ol>`;
            }
            else if (act.planApproved) { type = 'PLAN'; content = 'Plan aprobado por el usuario'; }
            else if (act.progressUpdated) { type = 'PROG'; content = `<strong>${act.progressUpdated.title || ''}</strong>${act.progressUpdated.description ? ' — ' + act.progressUpdated.description : ''}`; }
            else if (act.sessionCompleted) { type = 'DONE'; content = 'Sesión completada correctamente'; }
            else if (act.sessionFailed) { type = 'FAIL'; content = 'Sesión fallida: ' + (act.sessionFailed.reason || '---'); }

            if (act.artifacts?.length) {
                act.artifacts.forEach(artifact => {
                    if (artifact.changeSet?.gitPatch) {
                        const msg = artifact.changeSet.gitPatch.suggestedCommitMessage || '';
                        extra += `<div class="jules-artifact jules-artifact--diff" style="margin-top:8px; padding:8px; background:rgba(0,0,0,0.2); border-radius:4px; font-family:var(--font-mono); font-size:11px;">📄 <em>${msg}</em></div>`;
                    }
                    if (artifact.bashOutput) {
                        const cmd = window.NeuralChatCore.escapeHtml(artifact.bashOutput.command || '');
                        const out = window.NeuralChatCore.escapeHtml(artifact.bashOutput.output || '');
                        extra += `<div class="jules-artifact jules-artifact--bash" style="margin-top:8px; padding:8px; background:#000; border-radius:4px; font-family:var(--font-mono); font-size:11px; border:1px solid var(--border);">
                            <code style="color:var(--cyan);">$ ${cmd}</code>
                            <pre style="color:#fff; margin-top:4px; overflow-x:auto;">${out}</pre>
                        </div>`;
                    }
                });
            }

            const typeClass = type.toLowerCase();

            return `
                <div class="jules-activity-entry jules-activity-entry--${typeClass}" data-activity-id="${id}" onclick="window.handleActivityRowClick(event, '${id}')" style="display: flex; gap: 12px; padding: 12px; border-bottom: 1px solid var(--border); transition: background 0.2s; position: relative; cursor: pointer;">
                    <div onclick="window.handleActivityCheckboxClick(event, '${id}')" style="display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <input type="checkbox" class="activity-line-checkbox" data-id="${id}" style="cursor: pointer;">
                    </div>
                    <span class="activity-icon" style="flex-shrink: 0; font-size: 16px;">
                        ${type === 'USER' ? '👤' : (type === 'AGENT' ? '🤖' : '⚙️')}
                    </span>
                    <div class="activity-body" style="flex: 1; min-width: 0;">
                        <div class="activity-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                            <span class="activity-originator" style="font-weight: 700; font-size: 11px; color: var(--text2);">${type}</span>
                            <span class="activity-time" style="font-size: 10px; color: var(--text3);">${time}</span>
                        </div>
                        <div class="activity-content" style="font-size: 12.5px; line-height: 1.5; color: var(--text);">${content}</div>
                        ${extra}
                    </div>
                </div>
            `;
        }).join('');

        window.clearActivitySelection();

    } catch (e) {
        container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--red); font-size:12px;">Error al cargar actividades: ${e.message}</div>`;
    }
}

window.handleActivityRowClick = function(event, id) {
    if (event.target.tagName === 'INPUT' || event.target.closest('input')) return;
    window.toggleActivitySelection(id);
}

window.handleActivityCheckboxClick = function(event, id) {
    event.stopPropagation();
    window.toggleActivitySelection(id);
}

window.toggleActivitySelection = function(id) {
    const checkbox = document.querySelector(`.activity-line-checkbox[data-id="${id}"]`);
    const row = document.querySelector(`.jules-activity-entry[data-activity-id="${id}"]`);
    if (!checkbox || !row) return;

    const newState = !checkbox.checked;
    checkbox.checked = newState;
    row.classList.toggle('selected', newState);
    if (newState) {
        row.style.background = 'rgba(124, 58, 237, 0.08)';
    } else {
        row.style.background = 'transparent';
    }

    window.updateActivitySelectionUI();
}

window.updateActivitySelectionUI = function() {
    const selected = document.querySelectorAll('.activity-line-checkbox:checked');
    const count = selected.length;

    const toolbar = document.getElementById('neural-selection-toolbar');
    const countEl = document.getElementById('selection-count');

    if (toolbar && countEl) {
        if (count > 0) {
            toolbar.style.display = 'flex';
            countEl.innerText = count;
        } else {
            toolbar.style.display = 'none';
        }
    }
}

window.clearActivitySelection = function() {
    document.querySelectorAll('.activity-line-checkbox').forEach(cb => {
        cb.checked = false;
        const row = cb.closest('.jules-activity-entry');
        if (row) {
            row.classList.remove('selected');
            row.style.background = 'transparent';
        }
    });
    window.updateActivitySelectionUI();
}

window.analyzeSelectedWithClaude = async function() {
    const selectedHistory = document.querySelectorAll('.session-checkbox:checked');
    const selectedActivity = document.querySelectorAll('.activity-line-checkbox:checked');

    if (selectedHistory.length > 0) {
        const sids = Array.from(selectedHistory).map(cb => cb.getAttribute('data-sid'));
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

        window.switchView('chat');
        if ($('v2-chat-input')) {
            $('v2-chat-input').value = context;
            $('v2-chat-input').dispatchEvent(new Event('input'));
        }

        window.clearHistorySelection();
        showToast("Contexto de sesiones enviado a Claude", "green");
    } else if (selectedActivity.length > 0) {
        showToast("Recopilando logs y analizando...", "amber");
        let context = "Analiza la siguiente actividad de Jules:\n\n";

        selectedActivity.forEach(cb => {
            const row = cb.closest('.jules-activity-entry');
            if (row) {
                const originator = row.querySelector('.activity-originator')?.innerText || 'INFO';
                const time = row.querySelector('.activity-time')?.innerText || '';
                const content = row.querySelector('.activity-content')?.innerText || '';
                context += `-[${time}] [${originator}] ${content}\n`;
            }
        });

        context += "\n¿Qué opinas sobre este progreso/error? ¿Qué sugerencias o próximos pasos recomiendas?";

        window.switchJulesPanelChatView('chat');

        const input = $('v2-chat-input');
        if (input) {
            input.value = context;
            input.dispatchEvent(new Event('input'));
            input.focus();
        }

        window.clearActivitySelection();
        showToast("Actividad cargada para análisis", "green");
    }
}
