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
        if (e.key === window.JULES_PANEL_NEURAL_STORAGE) {
            window.loadJulesPanelSessions();
            if ($('sessions-drawer')?.classList.contains('open')) {
                window.renderJulesPanelSessionDrawerList();
            }
        }
    });

    // Docs Integration Toggle
    const docsBadge = document.getElementById('docs-status-badge');
    if (docsBadge) {
        docsBadge.classList.remove('hidden');
        if (window.DocsBridge && window.DocsBridge.updateDocsStatusBadge) {
            window.DocsBridge.updateDocsStatusBadge();
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

window.loadJulesPanelSession = function(id) {
    window.currentJulesPanelSessionId = id;
    localStorage.setItem(window.JULES_PANEL_NEURAL_ACTIVE_ID, id);

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
        // Hybrid Docs Search Integration (Panel side)
        let docsContextPrompt = "";
        const docsEnabled = localStorage.getItem('hypenosys_docs_context_enabled') !== 'false';
        if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge-Panel] enabled: " + docsEnabled);

        if (docsEnabled && window.DocsBridge) {
            try {
                if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge-Panel] query: \"" + msg + "\"");
                const results = await window.DocsIndex.search(msg, 5);
                if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge-Panel] results:", results);

                if (results && results.length > 0) {
                    const docsContext = await window.DocsBridge.getContextForQuery(msg, { limit: 5 });
                    if (docsContext) {
                        const guardrail = "\n\nUsa únicamente el CONTEXTO DOCUMENTAL DE HYPENOSYS para responder sobre la documentación.\nNo inventes carpetas, tecnologías, herramientas, estructura del repositorio ni contenido no presente en las fuentes.\nSi el contexto no contiene la respuesta, dilo explícitamente.\n\n";
                        docsContextPrompt = "\n\n" + docsContext + guardrail;

                        if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge-Panel] contextChars: " + docsContext.length);
                        if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge-Panel] injected: true");

                        window._lastDocsMetadata = await window.DocsBridge.getSourceMetadata(results);
                    }
                } else {
                    const isAskingStructure = /organiza|estructura|carpetas|folders|donde esta|dónde está/i.test(msg);
                    if (isAskingStructure) {
                        const allDocs = await window.DocsIndex.getAllDocs();
                        if (allDocs && allDocs.length > 0) {
                            const directories = new Set();
                            allDocs.forEach(d => {
                                const parts = d.path.split('/');
                                if (parts.length > 1) directories.add(parts[0]);
                            });
                            if (directories.size > 0) {
                                const dirList = Array.from(directories).sort().join('\n- ');
                                docsContextPrompt = "\n\nCONTEXTO DE ESTRUCTURA REAL (hypenosys/docs):\nEl repositorio está organizado en las siguientes carpetas principales:\n- " + dirList + "\n\nInstrucción: Usa esta lista real para responder sobre la organización. No inventes otras carpetas.\n";
                            }
                        }
                    }
                    const fallbackGuardrail = "\n\nNo hay contexto documental suficiente disponible para responder con certeza sobre la documentación de Hypenosys.\nNo inventes información sobre la estructura del repositorio ni carpetas que no conozcas.\nSi te preguntan por la estructura y no tienes fragmentos que la describan, indica que no tienes acceso a esa información ahora mismo.\n";
                    docsContextPrompt += fallbackGuardrail;
                }
            } catch (e) {
                console.warn("[DocsBridge] Search failed in panel", e);
            }
        }

        // Store sources for this turn
        const currentSources = window._lastDocsMetadata || [];
        window._lastDocsMetadata = null;

        await window.NeuralChatCore.sendMessage({
            session: session,
            userMessage: msg,
            systemPrompt: (session.systemPrompt || "") + docsContextPrompt,
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
        showToast("Error en la comunicación con el proveedor", "red");
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

        const isLinked = s.metadata && s.metadata.linkedJulesTaskId;
        const linkedTitle = isLinked ? (s.metadata.linkedJulesTaskTitle || s.metadata.linkedJulesTaskId) : '';

        return '<div class="chat-history-item' + (isActive ? ' active' : '') + (isLinked ? ' linked' : '') + '" onclick="window.loadJulesPanelSession(\'' + s.id + '\')">' +
                 '<div class="chat-dot"></div>' +
                 '<div class="chat-content-wrap">' +
                    '<div class="chat-title" title="' + window.NeuralChatCore.escapeHtml(displayTitle) + '">' + window.NeuralChatCore.escapeHtml(displayTitle) + '</div>' +
                    (isLinked ? '<div class="chat-link-meta"><i class="fas fa-link"></i> ' + window.NeuralChatCore.escapeHtml(linkedTitle) + '</div>' : '') +
                 '</div>' +
                 '<button class="btn-delete-session" onclick="window.deleteJulesPanelSession(event, \'' + s.id + '\')" title="Borrar">' +
                   '<i class="fas fa-trash"></i>' +
                 '</button>' +
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

    if (!session) {
        if (statusLabel) statusLabel.innerHTML = 'No hay conversación activa vinculada. <button onclick="window.openClaudeSessionSelector()" class="btn btn-ghost btn-xs" style="color:var(--accent2); text-decoration:underline; margin-left:10px">Elegir conversación</button>';
        if (statusMonitor) statusMonitor.classList.remove('hidden');
    } else {
        const isLinked = session.metadata && session.metadata.linkedJulesTaskId;
        const linkedTitle = isLinked ? (session.metadata.linkedJulesTaskTitle || session.metadata.linkedJulesTaskId) : 'Ninguna';

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
            '<div class="activity-actions" style="margin-top: 8px; display: flex; gap: 8px;">' +
              '<button class="btn btn-ghost btn-sm" style="font-size: 9px; padding: 2px 8px;" onclick="window.sendToJulesFromLocal(' + idx + ')">' +
                '<i class="fas fa-arrow-right"></i> → ENVIAR A JULES' +
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
    document.querySelectorAll('.dual-send-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.mode === mode);
    });
    const wrapper = $('chat-input-wrapper');
    if (wrapper) {
        wrapper.classList.toggle('mode-jules', mode === 'jules');
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
    const sessionTitle = session ? session.title : 'esta sesión';

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

    const confirmMsg = "¿Seguro que quieres borrar la sesión \"" + sessionTitle + "\"? Esta acción no se puede deshacer.";

    if (window.showConfirmationToast) {
        window.showConfirmationToast(confirmMsg, performDelete);
    } else if (window.confirm(confirmMsg)) {
        performDelete();
    }
}
