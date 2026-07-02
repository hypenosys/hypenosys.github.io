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

window.confirmSendToJules = function() {
    const userNote = document.getElementById('jules-user-note').value.trim();
    const currentSession = window.sessions.find(s => s.id === window.currentSessionId);
    const task = window._activeTaskContext;

    // Build session context summary string (last 3 messages)
    let sessionContext = `Session: ${currentSession?.title || window.currentSessionId || 'N/A'}\n`;
    if (currentSession && currentSession.messages.length > 0) {
        const recent = currentSession.messages.slice(-3);
        recent.forEach(m => {
            sessionContext += `- ${m.role.toUpperCase()}: ${m.content.substring(0, 150)}${m.content.length > 150 ? '...' : ''}\n`;
        });
    }

    const payload = {
        claude_response: window._pendingJulesText,
        user_note: userNote,
        session_context: sessionContext,
        source_task: task || null,
        rama: task ? (task.rama || task.branch) : null,
        timestamp: new Date().toISOString()
    };

    // Save to localStorage
    localStorage.setItem('jules_task_payload', JSON.stringify(payload));

    // Fallbacks for backward compatibility
    localStorage.setItem('jules_clipboard', window._pendingJulesText);
    if (window._activeTaskContext) {
        localStorage.setItem('jules_linked_task_id', window._activeTaskContext.id);
    }

    showToast('Neural Link establecido. Redirigiendo...');

    if (task) {
        localStorage.setItem('hy_jules_handoff', JSON.stringify({
            task: task,
            timestamp: Date.now(),
            source: 'claude-chat'
        }));
    }

    setTimeout(() => window.location.href = '/jules-panel/', 1000);
}

window.sendToJulesByIndex = async function(idx) {
    const currentSession = window.sessions.find(s => s.id === window.currentSessionId);
    if (currentSession && currentSession.messages[idx]) {
        const text = currentSession.messages[idx].content;

        // Build handoff data
        const taskContext = localStorage.getItem('hy_neural_task_context');
        let task = null;
        if (taskContext) {
            try { task = JSON.parse(taskContext); } catch(e){}
        }

        const payload = {
            claude_response: text,
            user_note: "",
            session_context: `Claude Index Message #${idx}`,
            source_task: task || null,
            rama: task ? (task.rama || task.branch) : null,
            timestamp: new Date().toISOString()
        };

        localStorage.setItem('jules_task_payload', JSON.stringify(payload));

        if (task) {
            localStorage.setItem('hy_jules_handoff', JSON.stringify({
                task: task,
                timestamp: Date.now(),
                source: 'claude-chat'
            }));
        }

        showToast('Redirigiendo a Jules Panel...');
        setTimeout(() => window.location.href = '/jules-panel/', 800);
    }
}
