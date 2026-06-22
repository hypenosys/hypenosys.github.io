/* ════════════════════════════════════════
   JULES PANEL NEURAL CHAT V2 logic
   ════════════════════════════════════════ */

window.getLinkedJulesSessionId = function() {
    return localStorage.getItem('hy_neural_session_id');
}

window.saveSessionsV2 = function(skipSync = false) {
    try {
        const sessionId = getLinkedJulesSessionId();
        const claudeId = localStorage.getItem('hy_active_claude_session_id');

        if (sessionId) {
            const sessionData = {
                messages: window.chatV2Messages,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem(`hy_neural_context_${sessionId}`, JSON.stringify(sessionData));

            // Sync via BroadcastChannel (nuevo formato NEW_MESSAGE)
            if (window.neuralSyncChannel && !skipSync && window.chatV2Messages.length > 0) {
                const lastMsg = window.chatV2Messages[window.chatV2Messages.length - 1];
                window.neuralSyncChannel.postMessage({
                    type: 'NEW_MESSAGE',
                    julesSessionId: sessionId,
                    claudeConversationId: claudeId,
                    message: {
                        role: lastMsg.role,
                        content: lastMsg.content,
                        timestamp: lastMsg.timestamp || Date.now()
                    }
                });
            }
        }

        if (claudeId) {
            const allSessions = JSON.parse(localStorage.getItem('hy_chat_v2_sessions') || '{}');
            allSessions[claudeId] = {
                messages: window.chatV2Messages,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem('hy_chat_v2_sessions', JSON.stringify(allSessions));
        }
    } catch (e) {
        console.warn('[ChatV2] Failed to save session:', e);
    }
}

window.loadV2Messages = function() {
    try {
        const sessionId = getLinkedJulesSessionId();
        if (sessionId) {
            const saved = localStorage.getItem(`hy_neural_context_${sessionId}`);
            if (saved) {
                const sessionData = JSON.parse(saved);
                window.chatV2Messages = sessionData.messages || [];
                renderChatV2Messages();
                return;
            }
        }

        const claudeId = localStorage.getItem('hy_active_claude_session_id');
        if (!claudeId) {
            window.chatV2Messages = [];
            renderChatV2Messages();
            return;
        }

        const allSessions = JSON.parse(localStorage.getItem('hy_chat_v2_sessions') || '{}');
        const session = allSessions[claudeId];
        window.chatV2Messages = session ? (session.messages || []) : [];
        renderChatV2Messages();
    } catch (e) {
        console.warn('[ChatV2] Failed to load messages:', e);
        window.chatV2Messages = [];
        renderChatV2Messages();
    }
}

window.triggerAutomatedAnalysis = async function(output) {
    const analyzedKey = `v2_jules_analyzed_${output.session_id}_${output.status}`;
    if (localStorage.getItem(analyzedKey)) return;
    localStorage.setItem(analyzedKey, 'true');

    window.chatV2Messages.push({ role: 'system', content: `Analizando resultado de Jules (Sesión #${output.session_id})...` });
    renderChatV2Messages();

    try {
        const config = getActiveConfig();
        const prompt = `Jules ha completado una operación (Estado: ${output.status}).\n\nDETALLES:\n- Sesión: #${output.session_id}\n- Tarea: ${output.title}\n- Repo: ${output.repo}\n\nAnaliza el resultado y prepara un resumen accionable.`;

        const messages = [
            { role: 'system', content: 'Eres un analista de operaciones de agentes autónomos.' },
            { role: 'user', content: prompt }
        ];

        const analysis = await callCustomProvider(config, messages);
        window.chatV2Messages.push({ role: 'assistant', content: `[ANÁLISIS AUTOMÁTICO JULES]\n\n${analysis}` });
        renderChatV2Messages();
    } catch(e) {
        console.error("Auto-analysis failed", e);
    }
}

window.showChatLiveActivity = function(tel) {
    const monitor = $('chat-live-monitor');
    const status = $('chat-live-status');
    if (!monitor || !status) return;

    monitor.classList.remove('hidden');
    status.textContent = `[${tel.tag}] ${tel.msg}`;

    if (window.activityTimeout) clearTimeout(window.activityTimeout);
    window.activityTimeout = setTimeout(() => {
        monitor.classList.add('hidden');
    }, 10000);
}

window.buildSystemPrompt = async function(userMessage, basePrompt) {
    let systemPrompt = basePrompt || "Eres un asistente técnico del estudio de videojuegos Hypenosys. Ayudas al equipo a planificar e implementar tareas de desarrollo. Responde siempre en español, de forma directa y técnica.";

    const t = window.JulesPanelState.activePayload?.source_task;
    if (t) {
        const blockingInfo = (t.blocks && t.blocks.length > 0) ? `Bloquea a: ${t.blocks.join(', ')}` : 'No bloquea a nadie';
        const blockedByInfo = (t.blocked_by && t.blocked_by.length > 0) ? `Bloqueada por: ${t.blocked_by.join(', ')}` : 'No tiene bloqueos';

        systemPrompt += `\n\n## Tarea activa en contexto\n` +
            `ID: #${t.id}\n` +
            `Título: ${t.titulo || t.title}\n` +
            `Descripción: ${t.descripcion || t.description}\n` +
            `Criterios de Aceptación: ${t.acceptance_criteria || 'N/A'}\n` +
            `Subtareas: ${JSON.stringify(t.subtasks || [])}\n` +
            `Estado: ${t.estado || t.status}\n` +
            `Prioridad: ${t.prioridad || t.priority}\n` +
            `Rama: ${t.rama || 'N/A'}\n` +
            `Milestone: ${t.milestone || 'N/A'}\n` +
            `Repositorio: ${t.repository || t.repo || 'N/A'}\n` +
            `Dependencias: ${blockingInfo} | ${blockedByInfo}\n`;

        const linkedSid = getLinkedJulesSessionId();
        if (linkedSid) {
            try {
                const activities = await window.julesApi.getActivities(linkedSid, 10);
                const logs = (activities.activities || []).map(a => a.description || a.progressUpdated?.title).filter(Boolean).join('\n');
                if (logs) {
                    systemPrompt += `\n### Historial reciente de Jules (Sesión #${linkedSid}):\n${logs}\n`;
                }
            } catch (e) { console.warn("Could not fetch Jules activity for context", e); }
        }
    }
    return systemPrompt;
}

window.getActiveConfig = function() {
    const activeProfileId = localStorage.getItem('activeProfile');
    const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
    if (activeProfileId && profiles[activeProfileId]) {
        return profiles[activeProfileId];
    }
    return JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
}

window.callCustomProvider = async function(config, messages) {
    const baseUrl = (config.base_url || "https://api.anthropic.com/v1").replace(/\/$/, "");
    const isAnthropic = baseUrl.includes("anthropic.com");
    const isOllama = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
    const endpoint = isAnthropic ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`;
    const apiKey = config.api_key || config.apiKey || "";
    const headers = { "Content-Type": "application/json" };
    let body = {};
    if (isAnthropic) {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
        headers["anthropic-dangerous-direct-browser-access"] = "true";
        body = {
            model: config.model || "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            system: messages.find(m => m.role === "system")?.content,
            messages: messages.filter(m => m.role !== "system")
        };
    } else {
        if (!isOllama) headers["Authorization"] = `Bearer ${apiKey}`;
        body = {
            model: config.model || "llama3",
            messages: messages,
            temperature: 0.7
        };
    }
    const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const data = await res.json();
    return isAnthropic ? data.content[0].text : data.choices[0].message.content;
}

window.sendChatV2Msg = async function(retryCount = 0) {
    const input = $('v2-chat-input');
    const sendBtn = $('v2-send-btn');
    const content = input.value.trim();
    if (!content && retryCount === 0) return;

    let claudeId = localStorage.getItem('hy_active_claude_session_id');
    if (!claudeId) {
        claudeId = 'session_' + (window.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15));
        localStorage.setItem('hy_active_claude_session_id', claudeId);
    }

    const config = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
    const apiKey = config.api_key || config.apiKey || localStorage.getItem('jules_api_key');

    if (window.currentSendMode === 'claude') {
        const provider = config.provider || 'none';
        if (provider === 'ollama' || provider === 'custom') {
            if (!config.base_url || !config.model) {
                showToast("Configura Ollama en el chat principal primero", "red");
                input.disabled = false;
                sendBtn.disabled = false;
                return;
            }
        } else if (!apiKey) {
            showToast("Configuración de API requerida", "amber");
            openApiModal();
            return;
        }
    }

    let sessionId = localStorage.getItem('hy_neural_session_id_' + claudeId);
    if (!sessionId) sessionId = getLinkedJulesSessionId();

    const thinking = $('v2-thinking-indicator');

    if (window.currentSendMode === 'jules') {
        if (!sessionId) {
            showToast("No hay sesión Jules activa vinculada", "red");
            return;
        }
        const targetId = sessionId.startsWith('sessions/') ? sessionId : 'sessions/' + sessionId;

        input.disabled = true;
        sendBtn.disabled = true;
        if (thinking) {
            thinking.textContent = "ENVIANDO ORDEN A JULES...";
            thinking.classList.remove('hidden');
        }

        try {
            const ok = await window.julesApi.sendMessage(targetId, content);
            if (ok) {
                window.chatV2Messages.push({ role: 'user', content });
                saveSessionsV2();
                renderChatV2Messages();
                input.value = '';
                input.style.height = 'auto';

                showToast("Orden enviada a Jules", "green");
                addTel("USER", content, "info");

                let attempts = 0;
                const maxAttempts = 15;
                const pollInterval = setInterval(async () => {
                    attempts++;
                    await refreshActivities(getIdSafe(sessionId));
                    if (attempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        if (thinking) thinking.classList.add('hidden');
                    }
                }, 2000);
            }
        } catch (e) {
            showToast("Error al enviar a Jules: " + e.message, "red");
        } finally {
            if (thinking) thinking.classList.add('hidden');
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        }
    } else {
        input.disabled = true;
        sendBtn.disabled = true;

        if (thinking) {
            thinking.textContent = retryCount > 0 ? `REINTENTANDO (${retryCount})...` : "CLAUDE ESTÁ PROCESANDO...";
            thinking.classList.remove('hidden');
        }

        try {
            if (retryCount === 0) {
                window.chatV2Messages.push({ role: 'user', content });
                saveSessionsV2();
                renderChatV2Messages();
                input.value = '';
                input.style.height = 'auto';
            }
            const systemPrompt = "Eres Claude, un asistente experto integrado en el panel de control de Hypenosys. Responde siempre en español y de forma técnica.";

            let finalMessages = window.chatV2Messages.filter(m => ['user', 'assistant', 'jules'].includes(m.role))
                .map(m => ({
                    role: m.role === 'jules' ? 'user' : (m.role === 'assistant' ? 'assistant' : 'user'),
                    content: m.role === 'jules' ? `[JULES ACTIVITY CONTEXT]\n${m.content}` : m.content
                }));

            if (window.JulesPanelState.activePayload?.source_task) {
                const t = window.JulesPanelState.activePayload.source_task;
                const contextPrefix = `[CONTEXTO TAREA #${t.id}: ${t.titulo}]\n`;
                if (finalMessages.length > 0 && finalMessages[finalMessages.length - 1].role === 'user') {
                    finalMessages[finalMessages.length - 1].content = contextPrefix + finalMessages[finalMessages.length - 1].content;
                }
            }

            let baseUrl = (config.base_url || '').trim();
            const isAnthropic = !baseUrl || baseUrl.includes('anthropic.com');
            const isOllama = config.provider === 'ollama';

            if (isAnthropic && !baseUrl) baseUrl = 'https://api.anthropic.com/v1';
            baseUrl = baseUrl.replace(/\/$/, '');

            if (isOllama && !baseUrl.endsWith('/v1')) {
                baseUrl += '/v1';
            }

            let endpoint = isAnthropic ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`;

            const headers = {
                'Content-Type': 'application/json',
                ...(isAnthropic ? {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                } : (!isOllama ? {
                    'Authorization': `Bearer ${apiKey}`
                } : {}))
            };

            const body = isAnthropic ? {
                model: config.model || 'claude-3-5-sonnet-20241022',
                max_tokens: 1024,
                system: systemPrompt,
                messages: finalMessages,
                stream: true
            } : {
                model: config.model || (isOllama ? 'llama3' : ''),
                messages: [{ role: 'system', content: systemPrompt }, ...finalMessages],
                temperature: 0.7,
                stream: true
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            const res = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP ${res.status}`);
            }

            await consumeStreamV2(res, config.provider || (isAnthropic ? 'anthropic' : 'custom'));

        } catch (e) {
            console.error('[ChatV2] Error:', e);
            if ((e.name === 'AbortError' || e.message.toLowerCase().includes('timeout')) && retryCount < 2) {
                addTel("SYSTEM", `Reintentando comunicación (${retryCount + 1}/2)...`, "warn");
                return sendChatV2Msg(retryCount + 1);
            }
            showToast("Error en comunicación con Claude", "red");
            window.chatV2Messages.push({ role: 'system', content: `❌ Error: ${e.message}` });
            saveSessionsV2();
            renderChatV2Messages();
        } finally {
            if (thinking) thinking.classList.add('hidden');
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        }
    }
}

window.consumeStreamV2 = async function(response, provider) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aiContent = '';
    let thinkingContent = '';
    let buffer = '';

    const msgIdx = window.chatV2Messages.length;
    window.chatV2Messages.push({ role: 'assistant', content: '...' });
    renderChatV2Messages();

    const container = $('v2-chat-messages');

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;

                try {
                    const data = JSON.parse(trimmed.startsWith('data: ') ? trimmed.substring(6) : trimmed);

                    if (provider === 'anthropic') {
                        if (data.type === 'content_block_delta') {
                            if (data.delta.type === 'text_delta') {
                                aiContent += data.delta.text;
                            } else if (data.delta.type === 'thinking_delta') {
                                thinkingContent += data.delta.thinking;
                            }
                        }
                    } else {
                        const delta = data.choices?.[0]?.delta?.content || data.choices?.[0]?.text || '';
                        aiContent += delta;
                    }

                    if (aiContent || thinkingContent) {
                        let finalHtml = '';
                        if (thinkingContent) {
                            finalHtml += `<div class="thinking-block">${escapeHtml(thinkingContent)}</div>`;
                        }
                        if (aiContent) {
                            finalHtml += marked.parse(aiContent);
                        }

                        window.chatV2Messages[msgIdx].content = aiContent;
                        if (thinkingContent) window.chatV2Messages[msgIdx].thinking = thinkingContent;

                        const msgEls = container.querySelectorAll('.message-claude');
                        if (msgEls.length > 0) {
                            const lastMsg = msgEls[msgEls.length - 1].querySelector('.prose-invert');
                            if (lastMsg) lastMsg.innerHTML = finalHtml;
                        }
                        container.scrollTop = container.scrollHeight;
                    }
                } catch (e) {}
            }
        }
    } catch (e) {
        console.error('[StreamV2] Read error:', e);
        throw e;
    }

    saveSessionsV2();
    renderChatV2Messages();
}

window.startNewNeuralSession = function() {
    desvincularNeuralSession();

    const newClaudeId = 'session_' + (window.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15));
    localStorage.setItem('hy_active_claude_session_id', newClaudeId);

    window.chatV2Messages = [];

    switchView('chat');

    showToast("Nueva sesión de chat iniciada", "green");
}

window.toggleHistoryCollapse = () => {
    const container = $('jules-history-container');
    const divider = $('neural-divider');
    const label = $('collapse-label');
    const isCollapsed = container.classList.toggle('collapsed');
    divider.classList.toggle('collapsed', isCollapsed);
    label.textContent = isCollapsed ? 'Expandir Historia' : 'Colapsar Historia';
};

window.renderChatV2Messages = function() {
    const container = $('v2-chat-messages');
    if (!container) return;

    if (window.chatV2Messages.length === 0) {
        container.innerHTML = `
            <div id="v2-welcome-screen" style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.4; text-align: center; gap: 15px;">
                <div style="font-size: 48px;">🧠</div>
                <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 20px;">Neural Context Explorer</h2>
                <p style="max-width: 300px; font-size: 13px;">Pregunta a Claude sobre el código, las tareas o solicita ayuda para redactar prompts para Jules.</p>
            </div>`;
        return;
    }

    container.innerHTML = window.chatV2Messages.map((m, idx) => {
        if (m.role === 'system') {
            return `<div class="message-system">${m.content}</div>`;
        }

        let label = 'CLAUDE';
        let roleClass = 'message-claude';
        let labelColor = '#bd93f9';

        if (m.role === 'user') {
            label = 'USER';
            roleClass = 'message-user';
            labelColor = '#f8f8f2';
        } else if (m.role === 'jules') {
            label = 'JULES';
            roleClass = 'message-jules';
            labelColor = '#6272a4';
        } else if (m.role === 'assistant') {
            label = 'CLAUDE';
            roleClass = 'message-claude';
            labelColor = '#bd93f9';
        }

        return `
        <div class="${roleClass}">
            <div style="font-size: 10px; font-weight: 800; opacity: 0.7; margin-bottom: 8px; letter-spacing: 0.05em; color: ${labelColor}">
                ${label}
            </div>
            <div class="prose-invert" style="font-size: 13.5px; line-height: 1.6;">
                ${m.thinking ? `<div class="thinking-block">${escapeHtml(m.thinking)}</div>` : ''}
                ${marked.parse(m.content)}
            </div>
        </div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
}

window.toggleSessionDrawer = () => {
    const drawer = $('sessions-drawer');
    const overlay = $('sessions-drawer-overlay');
    const isOpen = drawer.classList.toggle('open');
    overlay.classList.toggle('open', isOpen);
    if (isOpen) renderSessionDrawerList();
};

window.renderSessionDrawerList = function() {
    const list = $('sessions-drawer-list');
    const sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
    if (sessions.length === 0) {
        list.innerHTML = '<div style="opacity: 0.3; font-style: italic; text-align: center; padding: 40px 0;">No hay sesiones registradas</div>';
        return;
    }

    list.innerHTML = sessions.map(s => {
        const isActive = s.status === 'active';
        const statusColor = isActive ? 'var(--green)' : 'var(--text3)';
        return `
        <div style="background: var(--surface2); border: 1px solid var(--border); border-radius: var(--r-md); padding: 16px; transition: all var(--t-fast); position: relative; overflow: hidden;">
            ${isActive ? `<div style="position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: var(--accent);"></div>` : ''}
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <div style="min-width: 0; flex: 1;">
                    <div id="drawer-name-display-${s.id}" style="font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; display: flex; align-items: center; gap: 8px;" onclick="restoreSessionFromDrawer('${s.id}')">
                        ${s.name}
                    </div>
                    <input id="drawer-name-edit-${s.id}" type="text" class="cfg-input hidden" value="${s.name}" onblur="saveRenameFromDrawer('${s.id}')" onkeydown="if(event.key==='Enter') this.blur()" style="height: 28px; font-size: 13px; padding: 4px 8px; margin-top: 4px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                        <span style="font-size: 9px; color: ${statusColor}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;">
                            ${isActive ? `<span class="u-dot" style="width:5px; height:5px;"></span>` : ''} ${isActive ? 'ACTIVA' : 'ARCHIVADA'}
                        </span>
                        <span style="font-size: 9px; color: var(--text3); font-family: var(--font-mono);">#${s.id}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button onclick="renameFromDrawer('${s.id}')" class="icon-btn" title="Renombrar" style="width: 28px; height: 28px; background: rgba(255,255,255,0.03); border: 1px solid var(--border);">✏️</button>
                    <button onclick="archiveFromDrawer('${s.id}')" class="icon-btn" title="Archivar" style="width: 28px; height: 28px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); ${!isActive ? 'opacity: 0.2; pointer-events: none;' : ''}">🗄️</button>
                    <button onclick="deleteFromDrawer('${s.id}')" class="icon-btn" title="Eliminar" style="width: 28px; height: 28px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); color: var(--red);">🗑️</button>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--text2); font-family: var(--font-mono); margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--border);">
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; display: flex; align-items: center; gap: 6px;">
                    <i class="fas fa-tasks" style="font-size: 8px; color: var(--accent2);"></i> ${s.task_title}
                </span>
                <span style="color: var(--text3);">${new Date(s.start).toLocaleDateString()}</span>
            </div>
        </div>`;
    }).join('');
}

window.renameFromDrawer = (sid) => {
    $(`drawer-name-display-${sid}`).classList.add('hidden');
    const edit = $(`drawer-name-edit-${sid}`);
    edit.classList.remove('hidden');
    edit.focus();
};

window.saveRenameFromDrawer = (sid) => {
    const edit = $(`drawer-name-edit-${sid}`);
    const newName = edit.value.trim();
    if (newName) {
        const sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
        const s = sessions.find(sess => sess.id === sid);
        if (s) {
            s.name = newName;
            localStorage.setItem('hy_neural_sessions', JSON.stringify(sessions));
            if (getLinkedJulesSessionId() === sid) {
                localStorage.setItem('hy_neural_session_name', newName);
            }
        }
    }
    renderSessionDrawerList();
};

window.archiveFromDrawer = (sid) => {
    const sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
    const s = sessions.find(sess => sess.id === sid);
    if (s) {
        s.status = 'archived';
        localStorage.setItem('hy_neural_sessions', JSON.stringify(sessions));
        if (getLinkedJulesSessionId() === sid) {
            desvincularNeuralSession();
        }
        renderSessionDrawerList();
    }
};

window.deleteFromDrawer = (sid) => {
    if (!confirm('¿Eliminar sesión permanentemente?')) return;
    let sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
    sessions = sessions.filter(s => s.id !== sid);
    localStorage.setItem('hy_neural_sessions', JSON.stringify(sessions));
    if (getLinkedJulesSessionId() === sid) {
        desvincularNeuralSession();
    }
    renderSessionDrawerList();
};

window.restoreSessionFromDrawer = (sid) => {
    const sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
    const s = sessions.find(sess => sess.id === sid);
    if (!s) return;

    localStorage.setItem('hy_neural_active', s.status === 'active' ? 'true' : 'false');
    const claudeId = localStorage.getItem('hy_active_claude_session_id');
    if (claudeId) {
        localStorage.setItem(`hy_neural_session_id_${claudeId}`, s.id);
    }
    localStorage.setItem('hy_neural_session_id', s.id);
    localStorage.setItem('hy_neural_session_name', s.name);
    localStorage.setItem('hy_neural_session_start', s.start);

    if (s.task_id) {
        const task = (window.JulesPanelState?.tasks || []).find(t => String(t.id) === String(s.task_id));
        if (task) localStorage.setItem('hy_neural_task_context', JSON.stringify(task));
    }
    window.location.reload();
}
