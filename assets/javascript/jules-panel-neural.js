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
