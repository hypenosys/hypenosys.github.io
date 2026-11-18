/* ════════════════════════════════════════
   NEURAL CHAT JULES INTEGRATION
   ════════════════════════════════════════ */

window.julesPollInterval = null;

window.startJulesPolling = function(sessionId) {
    stopJulesPolling();
    if (!sessionId) return;

    const poll = async () => {
        const path = sessionId.startsWith('sessions/') ? sessionId : 'sessions/' + sessionId;

        try {
            const data = await window.julesApi.getActivities(path, 50);
            const activities = data.activities || [];

            const agentMessages = activities.filter(a => a.agentMessaged);
            if (agentMessages.length > 0) {
                const currentSession = window.sessions.find(s => s.id === window.currentSessionId);
                if (!currentSession) return;

                let changed = false;
                agentMessages.forEach(act => {
                    const content = act.agentMessaged.agentMessage;
                    const timestamp = act.createTime;

                    // Check if this message is already in our session messages
                    const exists = currentSession.messages.some(m =>
                        m.role === 'assistant' &&
                        m.content === content &&
                        m.createTime === timestamp
                    );

                    if (!exists) {
                        currentSession.messages.push({
                            role: 'assistant',
                            content: content,
                            createTime: timestamp,
                            source: 'jules'
                        });
                        changed = true;
                    }
                });

                if (changed) {
                    saveSessions(false, 'jules-polling-new-msgs');
                    renderMessages();
                }
            }

            // Update Activity Feed
            if (window._updateActivityFeed) {
                window._updateActivityFeed(activities);
            }

            // Dispatch event to sync and re-render Jules History Workspace!
            window.dispatchEvent(new CustomEvent('julesActivitiesUpdated', {
                detail: {
                    sessionId: sessionId,
                    activities: activities
                }
            }));

            // If session is completed or failed, stop polling
            const isDone = activities.some(a => a.sessionCompleted || a.sessionFailed);
            if (isDone) {
                stopJulesPolling();
            }
        } catch (e) {
            console.warn('[Jules Polling] Error:', e);
        }
    };

    poll(); // Initial poll
    window.julesPollInterval = setInterval(poll, 5000);
}

window.stopJulesPolling = function() {
    if (window.julesPollInterval) {
        clearInterval(window.julesPollInterval);
        window.julesPollInterval = null;
    }
}

window.analyzeJulesOutput = async function(output, isInitial = false) {
    // Ignore if already analyzed or if it's just 'QUEUED'/'PLANNING' unless it's initial load
    const analyzedKey = `jules_analyzed_${output.session_id}_${output.status}`;
    if (localStorage.getItem(analyzedKey)) return;

    // Only analyze terminal states for automatic noise reduction
    if (!['COMPLETED', 'FAILED', 'AWAITING_PLAN_APPROVAL'].includes(output.status)) return;

    localStorage.setItem(analyzedKey, 'true');
    if (isInitial) return; // Don't spam analysis on page refresh

    if (!window.currentSessionId) createNewSession();

    const currentSession = window.sessions.find(s => s.id === window.currentSessionId);
    const prompt = `Jules ha completado una operación (Estado: ${output.status}).\n\nDETALLES:\n- Sesión: #${output.session_id}\n- Tarea: ${output.title}\n- Repo: ${output.repo}\n\nAnaliza el resultado, detecta si hay errores o puntos de atención, y prepara un resumen accionable.`;

    // Add a special system message to show it's analyzing
    appendSystemMessage(`Analizando output de Jules (Sesión #${output.session_id})...`, 'info');

    try {
        const config = getActiveConfig();
        const analysisMessages = [
            { role: 'system', content: 'Eres un analista de operaciones de agentes autónomos. Tu objetivo es interpretar el éxito o fracaso de Jules y dar feedback claro al desarrollador.' },
            { role: 'user', content: prompt }
        ];

        const analysis = await callCustomProvider(config, analysisMessages);

        if (analysis) {
            currentSession.messages.push({
                role: 'assistant',
                content: `[ANÁLISIS JULES: #${output.session_id}]\n\n${analysis}`,
                jules_analysis: true
            });
            saveSessions(false, 'jules-output-analysis');
            renderMessages();
        }
    } catch (e) {
        console.error("[Neural Link] Jules analysis failed:", e);
    }
}

window.desvincularSesion = function() {
    Object.keys(localStorage).filter(k => k.startsWith('hy_neural_')).forEach(k => localStorage.removeItem(k));
    window._activeTaskContext = null;
    showToast('Sesión desvinculada');
    renderSessionList();
}

window.sendToJules = function(text) {
    window._pendingJulesText = text;
    const drawer = document.getElementById('jules-drawer');
    const overlay = document.getElementById('jules-drawer-overlay');
    const preview = document.getElementById('jules-claude-preview');
    const taskInfo = document.getElementById('jules-drawer-task-info');

    preview.textContent = text.substring(0, 500) + (text.length > 500 ? '...' : '');

    if (window._activeTaskContext) {
        const t = window._activeTaskContext;
        taskInfo.innerHTML = `
            <div class="font-bold text-[#bd93f9]">Tarea #${t.id}</div>
            <div class="mt-1">${t.titulo || t.title}</div>
        `;
    } else {
        taskInfo.textContent = 'Ninguna tarea vinculada';
    }

    drawer.classList.add('open');
    overlay.classList.add('active');
    document.getElementById('jules-user-note').focus();
}

window.closeJulesDrawer = function() {
    document.getElementById('jules-drawer').classList.remove('open');
    document.getElementById('jules-drawer-overlay').classList.remove('active');
}

// A single handoff format for the drawer and individual Claude messages.
// It never sends automatically: Jules receives an editable draft on navigation.
window.handoffClaudeToJules = function(text, note = '', sourceTask = null, conversation = null) {
    const currentSession = conversation || (window.sessions || []).find(s => s.id === window.currentSessionId);
    const task = sourceTask || window._activeTaskContext || null;
    const linked = currentSession?.metadata?.linkedJulesTaskId
        || currentSession?.metadata?.linkedJulesSessionId
        || (currentSession?.id ? localStorage.getItem('hy_neural_session_id_' + currentSession.id) : null);
    const recent = (currentSession?.messages || []).slice(-3);
    const context = 'Sesión Claude: ' + (currentSession?.title || 'Sin título') + '\n' +
        recent.map(m => (m.source === 'jules' ? 'Jules' : m.role) + ': ' + String(m.content || '').slice(0, 180)).join('\n');
    const payload = {
        claude_response: String(text || '').slice(0, 20000),
        user_note: String(note || '').slice(0, 3000),
        session_context: context.slice(0, 1200),
        claude_conversation_id: currentSession?.id || null,
        linked_jules_session_id: linked || null,
        source_task: task,
        rama: task?.rama || task?.branch || null,
        timestamp: Date.now()
    };
    if (!payload.claude_response.trim()) return false;
    localStorage.setItem('jules_task_payload', JSON.stringify(payload));
    localStorage.removeItem('hy_neural_new_task_sent');
    localStorage.setItem('hy_jules_handoff', JSON.stringify({
        source: 'claude-chat',
        intent: linked ? 'continue-session' : 'new-task',
        task,
        claude_conversation_id: currentSession?.id || null,
        linked_jules_session_id: linked || null,
        timestamp: Date.now()
    }));
    window.location.assign('/jules-panel/');
    return true;
};

window.confirmSendToJules = function() {
    const note = document.getElementById('jules-user-note')?.value.trim() || '';
    const conversation = (window.sessions || []).find(s => s.id === window.currentSessionId);
    window.handoffClaudeToJules(window._pendingJulesText, note, window._activeTaskContext, conversation);
};

window.sendToJulesByIndex = async function(idx) {
    const conversation = (window.sessions || []).find(s => s.id === window.currentSessionId);
    const message = conversation?.messages?.[idx];
    if (!message || !String(message.content || '').trim()) return;
    let task = window._activeTaskContext || null;
    if (!task) {
        try { task = JSON.parse(localStorage.getItem('hy_neural_task_context') || 'null'); } catch {}
    }
    window.handoffClaudeToJules(message.content, '', task, conversation);
};
