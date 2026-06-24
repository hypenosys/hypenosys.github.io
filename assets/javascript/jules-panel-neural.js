/* ════════════════════════════════════════
   JULES PANEL NEURAL & CHAT MODULE
   ════════════════════════════════════════ */

// Mock logic for chat interactions
window.sendNeuralMessage = async function() {
    const input = $('v2-chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    const sid = getLinkedJulesSessionId();
    if (!sid) { showToast("No hay sesión activa vinculada", "red"); return; }

    const targetId = sid.startsWith('sessions/') ? sid : 'sessions/' + sid;
    input.value = '';

    // Optimistic UI
    window.chatV2Messages.push({ role: 'user', content: msg });
    renderChatV2Messages();

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

window.renderChatV2Messages = function() {
    const container = $('v2-chat-messages');
    if (!container) return;

    const sid = getLinkedJulesSessionId();
    if (!sid) {
        if (window.chatV2Messages && window.chatV2Messages.length > 0) {
            _renderLocalMessagesOnly();
        }
        return;
    }

    // JulesActivitiesModule handles the actual polling and rendering for V2
    if (window.JulesActivitiesModule) {
        window.JulesActivitiesModule.startPolling(sid);
    }
}

function _renderLocalMessagesOnly() {
    const container = $('v2-chat-messages');
    if (!container) return;

    const welcome = container.querySelector('#v2-welcome-screen');
    if (welcome) welcome.style.display = 'none';

    // Avoid duplicate rendering
    const existingIds = Array.from(container.querySelectorAll('.jules-activity-entry')).map(el => el.dataset.id);

    window.chatV2Messages.forEach((msg, idx) => {
        const localId = 'local-' + idx;
        if (existingIds.includes(localId)) return;

        const div = document.createElement('div');
        div.className = 'jules-activity-entry jules-activity-entry--' + (msg.role === 'assistant' ? 'agent' : 'user');
        div.dataset.id = localId;

        const icon = msg.role === 'assistant' ? '🤖' : '👤';
        const time = new Date().toLocaleTimeString('es-ES');

        const isClaude = msg.role === 'assistant';
        const actionBtn = isClaude ?
            '<div class="activity-actions" style="margin-top: 8px; display: flex; gap: 8px;">' +
              '<button class="btn btn-ghost btn-sm" style="font-size: 9px; padding: 2px 8px;" onclick="window.sendToJulesFromLocal(' + idx + ')">' +
                '<i class="fas fa-arrow-right"></i> → ENVIAR A JULES' +
              '</button>' +
            '</div>' : '';

        div.innerHTML =
            '<span class="activity-icon">' + icon + '</span>' +
            '<div class="activity-body">' +
              '<div class="activity-header">' +
                '<span class="activity-originator">' + (isClaude ? 'CLAUDE' : 'USUARIO') + '</span>' +
                '<span class="activity-time">' + time + '</span>' +
              '</div>' +
              '<div class="activity-content">' + escapeHtml(msg.content) + '</div>' +
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
        // Get comparison between default branch and current branch
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

        // Show in drawer
        const drawer = $('drawer');
        const overlay = $('dr-overlay');
        if (drawer && overlay) {
            drawer.classList.add('open');
            overlay.classList.add('open');
            $('dr-title').innerText = 'Revisar Cambios: ' + branch;
            $('dr-sub').innerText = repo;

            // Switch to diff tab
            switchDrawerTab('diff', document.querySelectorAll('.dr-tab')[1]);

            const diffCont = $('diff-content');
            if (diffCont) {
                diffCont.innerHTML = '<pre class="diff-viewer">' + escapeHtml(diff) + '</pre>';
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

window.sendChatV2Msg = async function() {
    const input = $('v2-chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    if (window.currentSendMode === 'jules') {
        await window.sendNeuralMessage();
    } else {
        // Claude mode: logic should be implemented in neural-chat-send.js
        // but if we are in jules-panel we might need a bridge
        if (window.sendMessage && typeof window.sendMessage === 'function') {
            await window.sendMessage();
        } else {
            // Fallback for jules-panel
            window.chatV2Messages.push({ role: 'user', content: msg });
            input.value = '';
            renderChatV2Messages();
            addTel("USER", "Enviado a Claude (Simulado)", "info");
        }
    }
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

async function approvePlan(sessionId) {
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

window.toggleSessionDrawer = function() {
    const drawer = $('sessions-drawer');
    const overlay = $('sessions-drawer-overlay');
    if (!drawer || !overlay) return;

    const isOpen = drawer.classList.toggle('open');
    overlay.classList.toggle('open');

    if (isOpen) {
        renderSessionDrawerList();
    }
}

window.renderSessionDrawerList = function() {
    const listContainer = $('sessions-drawer-list');
    if (!listContainer) return;

    let sessions = [];
    try {
        sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
    } catch (e) {
        console.error("Error parsing hy_neural_sessions", e);
    }

    if (sessions.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text3); font-size:13px;">No hay sesiones guardadas</div>';
        return;
    }

    // Sort by date (newest first)
    sessions.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.timestamp || 0);
        const dateB = new Date(b.createdAt || b.timestamp || 0);
        return dateB - dateA;
    });

    listContainer.innerHTML = sessions.map(function(s) {
        const shortId = s.id ? s.id.substring(0, 8) : '--------';
        let title = s.title;

        if (!title && s.messages && s.messages.length > 0) {
            const firstUserMsg = s.messages.find(function(m) { return m.role === 'user'; });
            if (firstUserMsg && firstUserMsg.content) {
                title = firstUserMsg.content.substring(0, 60);
            }
        }

        if (!title) title = "Sin título";

        const truncatedTitle = title.length > 40 ? title.substring(0, 40) + '…' : title;
        const timeLabel = window.getTimeAgo ? window.getTimeAgo(s.createdAt || s.timestamp) : (s.createdAt || s.timestamp || '---');

        return '<div class="session-drawer-item" onclick="selectSessionFromDrawer(\'' + s.id + '\')" style="padding:14px; border:1px solid var(--border); border-radius:var(--r-sm); cursor:pointer; transition:all 0.2s; background:var(--surface);">' +
                '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">' +
                    '<span style="font-family:var(--font-mono); font-size:10px; color:var(--accent2); font-weight:700;">#' + shortId + '</span>' +
                    '<span style="font-size:10px; color:var(--text3);">' + timeLabel + '</span>' +
                '</div>' +
                '<div style="font-size:13px; font-weight:600; color:var(--text); line-height:1.4; word-break:break-word;">' + escapeHtml(truncatedTitle) + '</div>' +
            '</div>';
    }).join('');

    // Add hover effects via JS if needed or rely on CSS if session-drawer-item is defined in styles
}

window.selectSessionFromDrawer = function(id) {
    toggleSessionDrawer();
    localStorage.setItem('hy_active_neural_session', id);

    if (window.loadSession && typeof window.loadSession === 'function') {
        window.loadSession(id);
    } else {
        const url = new URL('/chat/neural/', window.location.origin);
        url.searchParams.set('session_id', id);
        window.location.href = url.toString();
    }
}

/**
 * Persiste los mensajes actuales de chatV2Messages en el almacenamiento local
 * vinculado a la sesión de Jules activa.
 * @param {boolean} skipSync - (Opcional) Evita disparar eventos de sincronización adicionales.
 */
window.saveSessionsV2 = function(skipSync) {
    try {
        const sid = getLinkedJulesSessionId();
        if (!sid) return;

        const sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
        const idx = sessions.findIndex(function(s) { return s.id === sid; });

        if (idx !== -1) {
            sessions[idx].messages = window.chatV2Messages || [];
            localStorage.setItem('hy_neural_sessions', JSON.stringify(sessions));
        }
    } catch (e) {
        console.error("Error en saveSessionsV2:", e);
    }
}

window.sendToJulesFromLocal = function(idx) {
    const msg = window.chatV2Messages[idx];
    if (!msg || !msg.content) return;

    const promptTextarea = document.querySelector('#session-prompt');
    if (promptTextarea) {
        promptTextarea.value = msg.content;
        if (window.switchView) window.switchView('neural');
        showToast('Prompt cargado en Jules ⚡', 'green');
    }
}
