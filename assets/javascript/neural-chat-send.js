/* ════════════════════════════════════════
   NEURAL CHAT SEND & STREAM
   ════════════════════════════════════════ */

window.isThinkingEnabled = false;
window.attachedImage = null;

window.setSendMode = function(mode) {
    window.currentSendMode = mode;
    document.querySelectorAll('.dual-send-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.mode === mode);
    });
    document.getElementById('chat-input-container').className = `bg-[#1e1f29] border border-[#44475a] rounded-2xl p-3 flex flex-col gap-2 focus-within:border-[#bd93f9]/50 focus-within:shadow-[0_0_20px_rgba(189,147,249,0.1)] transition-all duration-500 ${mode === 'jules' ? 'mode-jules' : ''}`;

    window.chatInput.placeholder = mode === 'claude' ? "¿En qué puedo ayudarte hoy?" : "Enviar orden directa a Jules...";
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
            saveSessions(); // [FIX 2B] Emitir inmediatamente
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
    if (currentSession && currentSession.title === 'Nueva Conversación' && content) {
        currentSession.title = content.substring(0, 40) + (content.length > 40 ? '...' : '');
    }

    window.chatInput.value = '';
    window.chatInput.style.height = 'auto';

    // FEATURE #1: Thinking Animation UI
    window.thinkingIndicator.classList.remove('hidden');
    window.thinkingIndicator.innerHTML = '<div class="thinking-dots"><span>.</span><span>.</span><span>.</span></div>';
    window.sendBtn.disabled = true;
    window.chatInput.disabled = true;

    try {
        const modelType = config.modelType || 'chat';
        const isStandardProvider = provider === 'ollama' || provider === 'anthropic' || provider === 'custom' || provider === 'openai' || provider === 'openrouter' || provider === 'nvidia_nim';

        if (modelType === 'image-gen') {
            await sendMessageImageGen(currentSession, config);
        } else if (modelType === 'audio' && !config.useTextInAudioMode) {
            if (content) await sendMessageCustom(currentSession, config);
        } else if (isStandardProvider) {
            // Store sources for the upcoming message
            const currentSources = window._lastDocsMetadata || [];
            window._lastDocsMetadata = null;

            // Optimistic UI: Add user message and render immediately
            const userMsg = { role: 'user', content: content, timestamp: Date.now() };
            currentSession.messages.push(userMsg);

            renderMessages();
            renderSessionList();
            saveSessions();

            await window.NeuralChatCore.sendMessage({
                session: currentSession,
                userMessage: content,
                saveCallback: () => saveSessions(),
                skipUserMessagePush: true,
                onToken: () => {
                    // Update sources on the placeholder if needed
                    const lastMsg = currentSession.messages[currentSession.messages.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant') {
                        lastMsg.sources = currentSources;
                    }
                    renderMessages();
                },
                onDone: () => {
                    window.thinkingIndicator.classList.add('hidden');
                    renderMessages();
                    renderSessionList();
                },
                onError: (err) => {
                    window.thinkingIndicator.classList.add('hidden');
                    appendSystemMessage(err.message, 'error');
                    renderMessages();
                }
            });
        } else {
            throw new Error(`Proveedor ${provider} no implementado aún en Neural Chat.`);
        }
    } catch (e) {
        console.error('[ClaudeChat] Send error:', e);
        const errorMsg = provider === 'ollama' ? window.ollamaDiscovery.getErrorMessage(e, config.base_url) : e.message;
        appendSystemMessage(errorMsg, 'error');
    } finally {
        window.thinkingIndicator.classList.add('hidden');
        window.sendBtn.disabled = false;
        window.chatInput.disabled = false;
        window.chatInput.focus();
        window.chatMessages.scrollTop = window.chatMessages.scrollHeight;
    }
}

window.sendMessageAnthropic = async function(session, config) {
    const apiKey = config.api_key;
    if (!apiKey) throw new Error('Anthropic API Key no configurada.');

    const lastUserMessage = session.messages[session.messages.length - 1].content;
    const dynamicSystemPrompt = await buildSystemPrompt(lastUserMessage, session.systemPrompt);

    const requestBody = {
        model: config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: session.messages.map(m => ({ role: m.role, content: m.content })),
        system: dynamicSystemPrompt,
        stream: true
    };

    if (window.isThinkingEnabled) {
        requestBody.thinking = { type: "enabled", budget_tokens: 16000 };
        requestBody.max_tokens = 20000;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API Error: ${response.status}`);
    }

    await consumeStream(response, session, 'anthropic');
}

window.sendMessageOllama = async function(session, config) {
    let baseUrl = config.base_url || '';
    if (baseUrl && !baseUrl.startsWith('http')) {
        baseUrl = 'http://' + baseUrl;
    }
    baseUrl = baseUrl.trim().replace(/\/+$/, '');
    if (!baseUrl.endsWith('/v1')) {
        baseUrl += '/v1';
    }
    const model = config.model || 'llama3';

    if (!baseUrl) {
        throw new Error('Base URL de Ollama no configurada. Por favor, configura el endpoint en API CONFIG.');
    }

    const lastUserMessage = session.messages[session.messages.length - 1].content;
    const dynamicSystemPrompt = await buildSystemPrompt(lastUserMessage, session.systemPrompt);

    // Use OpenAI-compatible endpoint for Ollama
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        credentials: 'omit',
        body: JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: dynamicSystemPrompt },
                ...session.messages.map(m => ({ role: m.role, content: m.content }))
            ],
            stream: true
        })
    });

    if (!response.ok) throw new Error(`Ollama Error: ${response.status}`);

    await consumeStream(response, session, 'ollama');
}

window.consumeStream = async function(response, session, provider) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aiContent = '';
    let thinkingContent = '';
    let buffer = '';

    const msgDiv = document.createElement('div');
    msgDiv.className = 'flex justify-start group mb-4';
    msgDiv.innerHTML = `
        <div class="max-w-[85%] p-4 message-claude shadow-xl relative message-bubble">
            <div class="text-[10px] font-black tracking-widest uppercase mb-2 text-[#bd93f9] opacity-70">CLAUDE</div>
            <div id="thinking-block" class="thinking-block hidden"></div>
            <div class="prose prose-invert text-sm" id="streaming-content"></div>
        </div>
    `;
    window.chatMessages.appendChild(msgDiv);
    const streamEl = msgDiv.querySelector('#streaming-content');
    const thinkEl = msgDiv.querySelector('#thinking-block');

    logDebug(`Stream started (Provider: ${provider})`, 'info');

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                try {
                    let data;
                    if (trimmedLine.startsWith('data: ')) {
                        data = JSON.parse(trimmedLine.substring(6));
                    } else {
                        data = JSON.parse(trimmedLine);
                    }

                    if (provider === 'anthropic') {
                        if (data.type === 'content_block_delta') {
                            if (data.delta.type === 'text_delta') {
                                aiContent += data.delta.text;
                            } else if (data.delta.type === 'thinking_delta') {
                                thinkingContent += data.delta.thinking;
                                thinkEl.classList.remove('hidden');
                                thinkEl.textContent = thinkingContent;
                            }
                        }
                    } else if (provider === 'ollama') {
                        // OpenAI compatible stream format
                        const delta = data.choices?.[0]?.delta?.content || data.choices?.[0]?.text || '';
                        aiContent += delta;

                        if (data.error) {
                            logDebug(`Ollama stream error: ${data.error}`, 'error');
                        }
                    }

                    if (aiContent) {
                        streamEl.innerHTML = marked.parse(aiContent);
                    }
                    window.chatMessages.scrollTop = window.chatMessages.scrollHeight;
                } catch (e) {
                    logDebug(`JSON parse error: ${e.message} in line: ${trimmedLine}`, 'warn');
                }
            }
        }
    } catch (e) {
        logDebug(`Stream read error: ${e.message}`, 'error');
        throw e;
    }

    const assistantMsg = {
        role: 'assistant',
        content: aiContent,
        thinking: thinkingContent || undefined
    };
    session.messages.push(assistantMsg);

    // Sync with Neural Thread
    if (localStorage.getItem('hy_neural_active') === 'true') {
        let thread = JSON.parse(localStorage.getItem('hy_neural_thread') || '[]');
        thread.push({ ...assistantMsg, source: 'claude' });
        localStorage.setItem('hy_neural_thread', JSON.stringify(thread));
    }

    saveSessions();
    renderMessages();
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

    saveSessions();
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

    // Detect NIM provider automatically
    const isNIM = (config.base_url || '').includes('nvidia.com') ||
                  (config.model || '').startsWith('nvidia/') ||
                  (config.model || '').startsWith('meta/') ||
                  (config.model || '').startsWith('mistralai/');

    if (isNIM) {
        headers['x-requested-with'] = 'XMLHttpRequest';
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`NIM/Custom API error ${response.status}: ${err}`);
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
            saveSessions();
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

    saveSessions();
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
