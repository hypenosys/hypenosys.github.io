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
    const container = $('chat-v2-container');
    if (!container) return;

    // This would typically merge session activities and local messages
    // For now, it's a placeholder for the logic
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
