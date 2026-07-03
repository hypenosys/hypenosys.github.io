/* ════════════════════════════════════════
   NEURAL CHAT SEND & STREAM
   ════════════════════════════════════════ */

window.isThinkingEnabled = false;
window.attachedImage = null;

const timeoutPromise = (ms) => new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), ms)
);

window.setSendMode = function(mode) {
    window.currentSendMode = mode;

    const label = document.getElementById('current-mode-label');
    if (label) label.textContent = mode.toUpperCase();

    document.getElementById('chat-input-container').className = `bg-[#1e1f29] border border-[#44475a] rounded-2xl p-3 flex flex-col gap-2 focus-within:border-[#bd93f9]/50 focus-within:shadow-[0_0_20px_rgba(189,147,249,0.1)] transition-all duration-500 ${mode === 'jules' ? 'mode-jules' : ''}`;

    window.chatInput.placeholder = mode === 'claude' ? "¿En qué puedo ayudarte hoy?" : "Enviar orden directa a Jules...";
};

window.toggleModeDropdown = function() {
    const dropdown = document.getElementById('mode-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
};

window.sendMessage = async function() {
    const content = window.chatInput.value.trim();
    if ((!content && !window.attachedImage) || window.sendBtn.disabled) return;

    // Auto-create session if none exists
    if (!window.currentSessionId) {
        createNewSession();
    }

    // Look in active or archived sessions
    const currentSession = window.sessions.find(s => s.id === window.currentSessionId) || window.archivedSessions.find(s => s.id === window.currentSessionId);

    // Handle Jules Direct Mode
    if (window.currentSendMode === 'jules') {
        const sessionId = localStorage.getItem('hy_neural_session_id_' + window.currentSessionId);

        if (!sessionId) {
            showToast('No hay sesión Jules vinculada a esta charla. Redirigiendo...');
            const taskContext = localStorage.getItem('hy_neural_task_context');
            if (taskContext) {
                try {
                    const task = JSON.parse(taskContext);
                    localStorage.setItem('hy_jules_handoff', JSON.stringify({
                        task: task,
                        timestamp: Date.now(),
                        source: 'claude-chat'
                    }));
                } catch(e) {
                    console.error('Error stringifying handoff task:', e);
                }
            }
            setTimeout(() => {
                window.location.href = '/jules-panel/';
            }, 1000);
            return;
        }

        const userMsg = { role: 'user', content: content, timestamp: Date.now() };
        if (currentSession) {
            currentSession.messages.push(userMsg);
            saveSessions(false, 'jules-direct-user-msg'); // [FIX 2B] Emitir inmediatamente
            renderMessages();
        }

        window.sendBtn.disabled = true;
        window.chatInput.disabled = true;
        try {
            const targetId = sessionId.startsWith('sessions/') ? sessionId : 'sessions/' + sessionId;
            const ok = await window.julesApi.sendMessage(targetId, content);
            if (ok) {
                window.chatInput.value = '';
                window.chatInput.style.height = 'auto';

                // Sync with Neural Thread
                let thread = JSON.parse(localStorage.getItem('hy_neural_thread') || '[]');
                thread.push({ role: 'user', content: content, source: 'user' });
                localStorage.setItem('hy_neural_thread', JSON.stringify(thread));

                showToast('Orden enviada a Jules');

                // Ensure polling is active
                startJulesPolling(sessionId);
            }
        } catch (e) {
            appendSystemMessage(`Error al enviar a Jules: ${e.message}`, 'error');
        } finally {
            window.sendBtn.disabled = false;
            window.chatInput.disabled = false;
            window.chatInput.focus();
        }
        return;
    }

    // God Mode Command Interception
    if (content.startsWith('/')) {
        handleSlashCommand(content);
        window.chatInput.value = '';
        return;
    }

    const config = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
    const provider = config.provider || 'none';

    if (provider === 'none') {
        alert('Por favor, configura un proveedor de IA en API CONFIG.');
        openSettings();
        return;
    }

    // Logic for sync with Neural Thread if needed
    if (localStorage.getItem('hy_neural_active') === 'true') {
        let thread = JSON.parse(localStorage.getItem('hy_neural_thread') || '[]');
        thread.push({ role: 'user', content: content, timestamp: Date.now(), source: 'user', image: window.attachedImage || undefined });
        localStorage.setItem('hy_neural_thread', JSON.stringify(thread));
    }

    // Clear attached image
    if (window.attachedImage) removeAttachedImage();

    // Set title from first message (Tarea 2.5 - 40 chars)
    if (currentSession && (currentSession.title === 'Nueva Conversación' || !currentSession.title) && content) {
        currentSession.title = content.substring(0, 40) + (content.length > 40 ? '...' : '');
        currentSession.updatedAt = new Date().toISOString();
        saveSessions(false, 'set-title');
        renderSessionList();
    }

    window.chatInput.value = '';
    window.chatInput.style.height = 'auto';

    // FEATURE #1: Thinking Animation UI
    window.thinkingIndicator.classList.remove('hidden');
    window.thinkingIndicator.innerHTML = '<div class="thinking-dots"><span>.</span><span>.</span><span>.</span></div>';
    window.sendBtn.disabled = true;
    window.chatInput.disabled = true;

    if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] send clicked");

    try {
        if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] message validated");
        const modelType = config.modelType || 'chat';
        const isStandardProvider = provider === 'ollama' || provider === 'anthropic' || provider === 'custom' || provider === 'openai' || provider === 'openrouter' || provider === 'nvidia_nim';

        if (modelType === 'image-gen') {
            await sendMessageImageGen(currentSession, config);
        } else if (modelType === 'audio' && !config.useTextInAudioMode) {
            if (content) await sendMessageCustom(currentSession, config);
        } else if (isStandardProvider) {
            // DOCUMENTATION FAIL-OPEN LOGIC
            const docsEnabled = localStorage.getItem('hypenosys_docs_context_enabled') !== 'false';
            let docsContext = null;

            if (docsEnabled && window.JulesDocsBridge?.getDocContext) {
                try {
                    docsContext = await Promise.race([
                        window.JulesDocsBridge.getDocContext(content),
                        timeoutPromise(3500)
                    ]);
                } catch (error) {
                    console.warn('[DocsBridge] failed; continuing without docs', error);
                    if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[DocsBridge] failed; continuing without docs");
                    docsContext = null;
                }
            } else {
                if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] skipping docs");
            }

            // SVN CONTEXT INJECTION
            const svnEnabled = localStorage.getItem('hypenosys_svn_context_enabled') === 'true';
            let svnContext = null;

            if (svnEnabled && window.JulesSvnBridge?.getSvnContext) {
                try {
                    svnContext = await Promise.race([
                        window.JulesSvnBridge.getSvnContext(content),
                        timeoutPromise(3500)
                    ]);
                } catch (error) {
                    console.warn('[SvnBridge] failed; continuing without svn', error);
                    svnContext = null;
                }
            }

            // Optimistic UI: Add user message and render immediately
            const userMsg = { role: 'user', content: content, timestamp: Date.now() };
            currentSession.messages.push(userMsg);
            currentSession.updatedAt = new Date().toISOString();

            renderMessages();
            if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] user message rendered");
            renderSessionList();
            saveSessions(false, 'user-message');

        // FEATURE #1: Thinking Animation UI
        window.thinkingIndicator.classList.remove('hidden');
        window.thinkingIndicator.innerHTML = '<div class="thinking-dots"><span>.</span><span>.</span><span>.</span></div> <span class="text-[10px] ml-2">CLAUDE ESTÁ PENSANDO...</span>';
        if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] thinking indicator shown");

            let baseSystemPrompt = await window.JulesDocsBridge.buildSystemPrompt(content, currentSession.systemPrompt);

            // Store sources for the upcoming message (captured during buildSystemPrompt)
            const currentSources = window._lastDocsMetadata || [];
            window._lastDocsMetadata = null;

            const dynamicSystemPrompt = baseSystemPrompt + (docsContext || "") + (svnContext || "");

            if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] sending to provider");

            await window.NeuralChatCore.sendMessage({
                session: currentSession,
                userMessage: content,
                systemPrompt: dynamicSystemPrompt,
                saveCallback: () => {
                    saveSessions(false, 'core-save-callback');
                    renderSessionList();
                },
                skipUserMessagePush: true,
                onToken: (token, fullContent) => {
                    window.thinkingIndicator.classList.add('hidden');
                    // Update sources on the placeholder if needed
                    const lastMsg = currentSession.messages[currentSession.messages.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant') {
                        lastMsg.sources = currentSources;
                    }
                    renderMessages();
                    // Periodic save during streaming to prevent loss if refresh occurs
                    if (fullContent.length % 50 < token.length) {
                        saveSessions(true, 'streaming-incremental'); // skipSync to avoid flooding BroadcastChannel
                    }
                },
                onDone: (fullContent) => {
                    if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] provider response received");
                    window.thinkingIndicator.classList.add('hidden');
                    if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] assistant rendered");
                    renderMessages();
                    renderSessionList();
                    saveSessions(false, 'assistant-done');
                    if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] send finished");
                },
                onError: (err) => {
                    if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] send failed:", err.message);
                    window.thinkingIndicator.classList.add('hidden');
                    appendSystemMessage(err.message, 'error');
                    renderMessages();
                }
            });
        } else {
            throw new Error(`Proveedor ${provider} no implementado aún en Neural Chat.`);
        }
    } catch (e) {
        if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] send failed:", e.message);
        console.error('[ClaudeChat] Send error:', e);

        // Use provider-specific logic for general catch (if it didn't come from onError)
        let errorMsg = e.message;
        if (provider === 'ollama' && window.ollamaDiscovery) {
            errorMsg = window.ollamaDiscovery.getErrorMessage(e, config.base_url);
        }
        appendSystemMessage(errorMsg, 'error');
    } finally {
        window.thinkingIndicator.classList.add('hidden');
        window.sendBtn.disabled = false;
        window.chatInput.disabled = false;
        window.chatInput.focus();
        window.chatMessages.scrollTop = window.chatMessages.scrollHeight;
    }
}


window.sendMessageCustom = async function(session, config) {
    const baseUrl = (config.base_url || '').trim();
    if (!baseUrl) throw new Error('Base URL no configurada para proveedor Custom.');

    const modelType = config.modelType || 'chat';
    const messages = session.messages.map(m => {
        if (modelType === 'vision' && m.image) {
            return {
                role: m.role,
                content: [
                    { type: "image_url", image_url: { url: m.image } },
                    { type: "text", text: m.content }
                ]
            };
        }
        return { role: m.role, content: m.content };
    });

    const lastUserMessage = session.messages[session.messages.length - 1].content;
    const dynamicSystemPrompt = await buildSystemPrompt(lastUserMessage, session.systemPrompt);

    if (dynamicSystemPrompt) {
        messages.unshift({ role: 'system', content: dynamicSystemPrompt });
    }

    const aiContent = await callCustomProvider(config, messages);

    const assistantMsg = {
        role: 'assistant',
        content: aiContent
    };
    session.messages.push(assistantMsg);

    // Sync with Neural Thread
    if (localStorage.getItem('hy_neural_active') === 'true') {
        let thread = JSON.parse(localStorage.getItem('hy_neural_thread') || '[]');
        thread.push({ ...assistantMsg, source: 'claude' });
        localStorage.setItem('hy_neural_thread', JSON.stringify(thread));
    }

    // If model type is TTS, play response
    if (modelType === 'audio' && config.ttsEnabled) {
        playTTS(aiContent, config);
    }

    saveSessions(false, 'custom-provider-done');
    renderMessages();

    // FEATURE 1: Check for session compaction
    if (session.messages.length >= 20 && !session._compacting) {
        compactSession(session);
    }
}

window.callCustomProvider = async function(config, messages) {
    const baseUrl = (config.base_url || '').replace(/\/$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

    const payload = {
        model: config.model,
        messages: messages,
        max_tokens: 1024,
        temperature: 0.7,
        stream: false
    };

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        // Delegate error classification to NeuralProviderClient if possible or handle locally
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`AI request failed for provider ${config.provider} at ${baseUrl}. Status: ${response.status}. ${errText}`);
    }

    const data = await response.json();

    // OpenAI-compatible response format
    return data.choices?.[0]?.message?.content
        || data.choices?.[0]?.text
        || JSON.stringify(data);
}

window.playTTS = async function(text, config) {
    const baseUrl = (config.base_url || '').trim().replace(/\/+$/, '');
    const apiKey = config.api_key;

    try {
        const response = await fetch(`${baseUrl}/audio/speech`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: config.model,
                input: text,
                voice: 'default'
            })
        });

        if (!response.ok) return;

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
    } catch (e) {
        console.error('TTS failed:', e);
    }
}

window.compactSession = async function(session) {
    session._compacting = true;

    try {
        const config = getActiveConfig();
        const provider = config.provider;

        const prompt = "Resume esta conversación manteniendo: decisiones tomadas, contexto técnico clave, y próximos pasos pendientes. Descarta saludos y mensajes redundantes. Responde solo con el resumen técnico.";

        // Construct a temporary context for compaction
        const messagesToCompact = session.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

        const compactionMessages = [
            { role: 'system', content: 'Eres un experto en gestión de contexto para IAs.' },
            { role: 'user', content: `${prompt}\n\nCONVERSACIÓN A RESUMIR:\n${messagesToCompact}` }
        ];

        let summary = "";

        // Use custom provider call logic (most robust)
        summary = await callCustomProvider(config, compactionMessages);

        if (summary) {
            // Replace all messages with the summary
            session.messages = [
                {
                    role: 'assistant',
                    content: `[SESIÓN COMPACTADA]\n\n${summary}\n\n*El historial anterior ha sido archivado para optimizar el contexto.*`,
                    compacted: true
                }
            ];
            saveSessions(false, 'compaction-done');
            if (window.currentSessionId === session.id) {
                renderMessages();
                showToast("Sesión compactada automáticamente", "info");
            }
        }
    } catch (e) {
        console.error("[Neural Link] Compaction failed:", e);
    } finally {
        delete session._compacting;
    }
}

window.sendMessageImageGen = async function(session, config) {
    const baseUrl = (config.base_url || '').trim().replace(/\/+$/, '');
    const apiKey = config.api_key;
    const model = config.model;
    const resolution = document.getElementById('image-resolution')?.value || '1024x1024';

    const lastMessage = session.messages[session.messages.length - 1];

    const response = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            prompt: lastMessage.content,
            n: 1,
            size: resolution
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.data[0].url;

    session.messages.push({
        role: 'assistant',
        content: `![Generada](${imageUrl})`
    });

    saveSessions(false, 'image-gen-done');
    renderMessages();
}

window.copyMessage = function(idx) {
    const currentSession = window.sessions.find(s => s.id === window.currentSessionId);
    if (currentSession && currentSession.messages[idx]) {
        copyToClipboard(currentSession.messages[idx].content);
    }
}

window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text);
    showToast('Copiado al portapapeles');
}
