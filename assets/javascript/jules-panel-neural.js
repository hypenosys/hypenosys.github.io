/* ════════════════════════════════════════
   JULES PANEL NEURAL & CHAT MODULE
   ════════════════════════════════════════ */

window.JULES_PANEL_NEURAL_STORAGE = 'hy_jules_panel_neural_sessions';
window.JULES_PANEL_NEURAL_ACTIVE_ID = 'hy_jules_panel_neural_active_id';

window.julesPanelSessions = [];
window.currentJulesPanelSessionId = null;
window.julesPanelPollInterval = null;

function saveJulesPanelSessions() {
    window.NeuralChatCore.saveSessions(window.JULES_PANEL_NEURAL_STORAGE, window.julesPanelSessions);
}

window.loadJulesPanelSessions = function() {
    window.julesPanelSessions = window.NeuralChatCore.getSessions(window.JULES_PANEL_NEURAL_STORAGE);
    window.currentJulesPanelSessionId = localStorage.getItem(window.JULES_PANEL_NEURAL_ACTIVE_ID);
}

/**
 * Initialize Neural Chat for Jules Panel
 */
window.initJulesPanelNeuralChat = function() {
    if (window._julesPanelNeuralInitialized) return;
    console.log("[Jules Panel Neural] Initializing...");

    window.loadJulesPanelSessions();

    if (window.julesPanelSessions.length === 0) {
        window.createNewJulesPanelSession();
    } else if (!window.currentJulesPanelSessionId) {
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
        if (e.key === window.JULES_PANEL_NEURAL_STORAGE && $('sessions-drawer')?.classList.contains('open')) {
            window.loadJulesPanelSessions();
            window.renderJulesPanelSessionDrawerList();
        }
    });

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
        idPrefix: 'jp_sess_'
    });
    window.julesPanelSessions.unshift(newSession);
    saveJulesPanelSessions();
    window.loadJulesPanelSession(newSession.id);
}

window.loadJulesPanelSession = function(id) {
    window.currentJulesPanelSessionId = id;
    localStorage.setItem(window.JULES_PANEL_NEURAL_ACTIVE_ID, id);

    const session = window.julesPanelSessions.find(s => s.id === id);
    if (!session) return;

    window.renderChatV2Messages();
}

window.sendChatV2Msg = async function() {
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
        window.createNewJulesPanelSession();
        setTimeout(() => window.sendChatV2Msg(), 100);
        return;
    }

    input.value = '';
    input.style.height = 'auto';

    const thinkingIndicator = $('v2-thinking-indicator');
    if (thinkingIndicator) thinkingIndicator.classList.remove('hidden');

    console.log("[Jules Panel Neural] Message sent from Jules Panel Neural");
    await window.NeuralChatCore.sendMessage({
        session: session,
        userMessage: msg,
        saveCallback: saveJulesPanelSessions,
        onToken: () => {
            window.renderChatV2Messages();
        },
        onDone: () => {
            if (thinkingIndicator) thinkingIndicator.classList.add('hidden');
            window.renderChatV2Messages();
        },
        onError: (err) => {
            if (thinkingIndicator) thinkingIndicator.classList.add('hidden');
            showToast(err.message, "red");
            window.renderChatV2Messages();
        }
    });
}

window.renderChatV2Messages = function() {
    const container = $('v2-chat-messages');
    if (!container) return;

    const session = window.julesPanelSessions.find(s => s.id === window.currentJulesPanelSessionId);
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

    session.messages.forEach((msg, idx) => {
        const div = document.createElement('div');
        div.className = 'jules-activity-entry jules-activity-entry--' + (msg.role === 'assistant' ? 'agent' : 'user');
        div.dataset.id = 'local-' + idx;

        const icon = msg.role === 'assistant' ? '🤖' : '👤';
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('es-ES') : '--:--';
        const isAssistant = msg.role === 'assistant';
        const isJules = msg.source === 'jules';

        const actionBtn = isAssistant ?
            '<div class="activity-actions" style="margin-top: 8px; display: flex; gap: 8px;">' +
              '<button class="btn btn-ghost btn-sm" style="font-size: 9px; padding: 2px 8px;" onclick="window.sendToJulesFromLocal(' + idx + ')">' +
                '<i class="fas fa-arrow-right"></i> → ENVIAR A JULES' +
              '</button>' +
            '</div>' : '';

        const renderedContent = isAssistant && window.marked ? marked.parse(msg.content) : window.NeuralChatCore.escapeHtml(msg.content);

        div.innerHTML =
            '<span class="activity-icon">' + icon + '</span>' +
            '<div class="activity-body">' +
              '<div class="activity-header">' +
                '<span class="activity-originator">' + (isJules ? 'JULES' : (isAssistant ? 'CLAUDE' : 'USUARIO')) + '</span>' +
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
    if (!sid) { showToast("No hay sesión activa vinculada", "red"); return; }

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
        showToast("Sesión eliminada", "red");
    };

    if (window.showConfirmationToast) {
        window.showConfirmationToast("¿Seguro que quieres borrar esta sesión? Esta acción no se puede deshacer.", performDelete);
    } else if (window.confirm("¿Seguro que quieres borrar esta sesión? Esta acción no se puede deshacer.")) {
        performDelete();
    }
}
