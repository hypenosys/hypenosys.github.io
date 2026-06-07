        let currentSessionId = null;
        let sessions = JSON.parse(localStorage.getItem('claude_chat_sessions') || '[]');
        let isThinkingEnabled = false;
        let attachedImage = null;
        let mediaRecorder = null;
        let audioChunks = [];

        // UI Elements
        const chatMessages = document.getElementById('chat-messages');
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        const thinkingIndicator = document.getElementById('thinking-indicator');
        const toggleThinkingBtn = document.getElementById('toggle-thinking');

        function escapeHtml(str) {
            return String(str ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        async function init() {
            renderSessionList();
            if (sessions.length > 0) {
                loadSession(sessions[0].id);
            }

            // Load profiles and set active
            await loadProfiles();

            const config = getActiveConfig();
            const provider = config.provider || 'anthropic';

            updateActiveProfileUI(config);

            // REAL-TIME Connection Status (GOD MODE Feature)
            checkConnection(provider, config);

            if (provider === 'ollama') {
                document.getElementById('ollama-quick-config').classList.remove('hidden');
            }

            adaptUI(config);
            setupProfileSelector();
        }

        function getActiveConfig() {
            const activeProfileId = localStorage.getItem('activeProfile');
            const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');

            if (activeProfileId && profiles[activeProfileId]) {
                return profiles[activeProfileId];
            }

            return JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
        }

        async function loadProfiles() {
            let profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');

            // Auto-detect NVIDIA NIM
            const currentConfig = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
            if (currentConfig.base_url?.includes('integrate.api.nvidia.com')) {
                profiles['nvidia-nim'] = {
                    ...currentConfig,
                    id: 'nvidia-nim',
                    name: 'NVIDIA NIM',
                    provider: 'custom',
                    modelType: 'chat'
                };
            }

            // Auto-detect Ollama
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 2000);
                const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal }).catch(() => null);
                clearTimeout(timeout);
                if (res && res.ok) {
                    const data = await res.json();
                    profiles['ollama-local'] = {
                        id: 'ollama-local',
                        name: 'Ollama (Local)',
                        provider: 'ollama',
                        base_url: 'http://localhost:11434/v1',
                        api_key: 'ollama',
                        models: data.models.map(m => m.name),
                        model: data.models[0]?.name || 'llama3'
                    };
                }
            } catch (e) {}

            localStorage.setItem('ai_profiles', JSON.stringify(profiles));
            renderProfileDropdown();
        }

        function renderProfileDropdown() {
            const list = document.getElementById('profile-list');
            const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
            const activeId = localStorage.getItem('activeProfile');

            list.innerHTML = Object.values(profiles).map(p => {
                const isNvidia = p.id === 'nvidia-nim';
                const isOllama = p.id === 'ollama-local';
                const icon = isOllama ? '🟢' : (isNvidia ? '⚡' : '👤');

                let modelsHtml = '';
                if (p.models && p.models.length > 0) {
                    modelsHtml = `
                        <div class="pl-6 space-y-1 mt-1">
                            ${p.models.slice(0, 10).map(m => `
                                <div onclick="selectModelFromProfile('${p.id}', '${m}')" class="text-[9px] text-[#6272a4] hover:text-white cursor-pointer truncate">
                                    ${m}
                                </div>
                            `).join('')}
                        </div>
                    `;
                }

                return `
                    <div class="px-3 py-2 border-b border-[#44475a]/30">
                        <div onclick="selectProfile('${p.id}')" class="flex items-center justify-between cursor-pointer group">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px]">${icon}</span>
                                <span class="text-[10px] font-bold ${p.id === activeId ? 'text-[#bd93f9]' : 'text-slate-400'}">${p.name}</span>
                            </div>
                            <button onclick="event.stopPropagation(); deleteProfile('${p.id}')" class="opacity-0 group-hover:opacity-100 text-[#ff5555] text-[10px]">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        ${modelsHtml}
                    </div>
                `;
            }).join('');
        }

        function selectProfile(id) {
            localStorage.setItem('activeProfile', id);
            const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
            const config = profiles[id];
            localStorage.setItem('hy_ai_config', JSON.stringify(config));

            updateActiveProfileUI(config);
            adaptUI(config);
            checkConnection(config.provider, config);
            document.getElementById('profile-dropdown').classList.add('hidden');
        }

        function selectModelFromProfile(profileId, model) {
            localStorage.setItem('activeProfile', profileId);
            const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
            const config = { ...profiles[profileId], model: model };

            // Detect model type from name
            config.modelType = detectModelType(model);

            localStorage.setItem('hy_ai_config', JSON.stringify(config));
            updateActiveProfileUI(config);
            adaptUI(config);
            checkConnection(config.provider, config);
            document.getElementById('profile-dropdown').classList.add('hidden');
        }

        function deleteProfile(id) {
            if (!confirm('¿Seguro que quieres eliminar este perfil?')) return;
            let profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
            delete profiles[id];
            localStorage.setItem('ai_profiles', JSON.stringify(profiles));
            if (localStorage.getItem('activeProfile') === id) {
                localStorage.removeItem('activeProfile');
            }
            renderProfileDropdown();
        }

        function detectModelType(modelId) {
            const m = modelId.toLowerCase();
            if (/vl|vision|visual|llava|pixtral|intern-vl/.test(m)) return 'vision';
            if (/embed|e5-|nv-embed|retrieval/.test(m)) return 'embedding';
            if (/rerank/.test(m)) return 'reranking';
            if (/asr|tts|whisper|canary|parakeet|fastpitch/.test(m)) return 'audio';
            if (/stable-diffusion|flux|sdxl|imagen|dall/.test(m)) return 'image-gen';
            if (/cosmos|video|wan/.test(m)) return 'video';
            if (/code|starcoder|deepseek-coder|qwen-coder/.test(m)) return 'code';
            if (/thinking|r1|o1|qwq/.test(m)) return 'reasoning';
            if (/guard|shield|llama-guard|nemo-guard/.test(m)) return 'safety';
            return 'chat';
        }

        function updateActiveProfileUI(config) {
            const nameEl = document.getElementById('active-profile-name');
            const model = config.model || 'SONNET-3.5';
            nameEl.textContent = model.split('/').pop().toUpperCase();
        }

        function adaptUI(config) {
            const type = config.modelType || 'chat';

            // Reset UI
            document.getElementById('image-resolution').classList.add('hidden');
            document.getElementById('audio-record-container').classList.add('hidden');
            document.getElementById('chat-input').classList.remove('hidden');
            document.getElementById('attach-btn').classList.add('hidden');
            document.getElementById('toggle-input-mode').classList.add('hidden');

            if (type === 'image-gen') {
                document.getElementById('image-resolution').classList.remove('hidden');
            } else if (type === 'audio') {
                if (!config.useTextInAudioMode) {
                    document.getElementById('audio-record-container').classList.remove('hidden');
                    document.getElementById('chat-input').classList.add('hidden');
                    document.getElementById('toggle-input-mode').classList.remove('hidden');
                } else {
                    document.getElementById('toggle-input-mode').classList.remove('hidden');
                    document.getElementById('toggle-input-mode').innerHTML = '<i class="fas fa-microphone text-xs"></i>';
                }
            } else if (type === 'vision') {
                document.getElementById('attach-btn').classList.remove('hidden');
            }
        }

        function setupProfileSelector() {
            const btn = document.getElementById('active-profile-btn');
            const dropdown = document.getElementById('profile-dropdown');

            btn.onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('hidden');
            };

            document.addEventListener('click', () => {
                dropdown.classList.add('hidden');
            });
        }

        function createNewSession() {
            const id = Date.now().toString();
            const newSession = {
                id,
                title: 'Nueva Conversación',
                messages: [],
                systemPrompt: 'Eres Claude, un asistente experto para el estudio de videojuegos Hypenosys.',
                createdAt: new Date().toISOString()
            };
            sessions.unshift(newSession);
            saveSessions();
            renderSessionList();
            loadSession(id);
        }

        async function loadSession(id) {
            currentSessionId = id;
            const session = sessions.find(s => s.id === id);
            if (!session) return;
            document.getElementById('session-title').textContent = session.title;
            renderMessages();
            document.getElementById('welcome-screen')?.classList.add('hidden');

            // Sync UI with session settings
            isThinkingEnabled = !!session.thinking;
            toggleThinkingBtn.classList.toggle('dracula-cyan', isThinkingEnabled);

            // Enrich System Prompt with God Mode context
            if (window.godModeTools) {
                const activeRepo = localStorage.getItem('hypenosys_active_repo');
                const godContext = await window.godModeTools.getGodModeSystemPrompt(activeRepo);
                if (!session.baseSystemPrompt) session.baseSystemPrompt = session.systemPrompt || 'Eres Claude, un asistente experto para el estudio de videojuegos Hypenosys.';
                session.systemPrompt = session.baseSystemPrompt + '\n' + godContext;
            }

            document.getElementById('system-prompt-input').value = session.systemPrompt || '';
        }

        function saveSessions() {
            try {
                localStorage.setItem('claude_chat_sessions', JSON.stringify(sessions));
            } catch (e) {
                alert('Error: almacenamiento local lleno.');
            }
        }

        function renderSessionList() {
            const list = document.getElementById('session-list');
            list.innerHTML = sessions.map(s => `
                <div onclick="loadSession('${s.id}')" class="p-2 rounded cursor-pointer text-xs transition-all ${currentSessionId === s.id ? 'bg-[#44475a] text-white' : 'text-[#6272a4] hover:bg-[#44475a]/50'} flex justify-between group">
                    <span class="truncate">${s.title}</span>
                    <button onclick="event.stopPropagation(); deleteSession('${s.id}')" class="opacity-0 group-hover:opacity-100 hover:text-[#ff5555] transition-all">
                        <i class="fas fa-trash-alt text-[10px]"></i>
                    </button>
                </div>
            `).join('');
        }

        function deleteSession(id) {
            sessions = sessions.filter(s => s.id !== id);
            if (currentSessionId === id) currentSessionId = null;
            saveSessions();
            renderSessionList();
            if (!currentSessionId && sessions.length > 0) loadSession(sessions[0].id);
            else if (sessions.length === 0) chatMessages.innerHTML = '';
        }

        function appendSystemMessage(msg, type = 'error') {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'flex justify-center mb-4';
            const bgColor = type === 'error' ? 'bg-red-900/20' : 'bg-blue-900/20';
            const borderColor = type === 'error' ? 'border-red-500' : 'border-blue-500';
            const textColor = type === 'error' ? 'text-red-200' : 'text-blue-200';

            msgDiv.innerHTML = `
                <div class="max-w-[90%] p-3 rounded-lg border-l-4 ${bgColor} ${borderColor} ${textColor} text-xs font-mono shadow-lg">
                    <div class="flex items-center gap-2 mb-1 uppercase font-black tracking-tighter opacity-70">
                        <i class="fas ${type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
                        SYSTEM MESSAGE: ${type}
                    </div>
                    <div>${escapeHtml(msg)}</div>
                </div>
            `;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function renderMessages() {
            const session = sessions.find(s => s.id === currentSessionId);
            if (!session) {
                chatMessages.innerHTML = '';
                return;
            }
            chatMessages.innerHTML = session.messages.map(m => {
                let content = m.content;
                let reasoningHtml = '';

                // Handle <think> blocks for Reasoning
                if (content.includes('<think>')) {
                    const parts = content.split(/<\/?think>/);
                    if (parts.length >= 3) {
                        const reasoning = parts[1];
                        content = parts.slice(2).join('');
                        reasoningHtml = `
                            <details class="mb-4 border-l-2 border-orange-400 bg-orange-400/5 rounded-r-lg overflow-hidden">
                                <summary class="p-2 text-[10px] font-bold text-orange-400 cursor-pointer hover:bg-orange-400/10 transition-all uppercase tracking-widest">
                                    <i class="fas fa-brain mr-2"></i> Razonamiento interno
                                </summary>
                                <div class="p-3 text-xs text-orange-200/70 italic bg-black/20">
                                    ${escapeHtml(reasoning)}
                                </div>
                            </details>
                        `;
                    }
                }

                // Handle Safety classification
                let safetyBadge = '';
                if (m.flagged || m.categories) {
                    safetyBadge = `<div class="mb-2 px-2 py-1 rounded bg-red-500/20 border border-red-500/50 text-red-400 text-[9px] font-bold uppercase tracking-widest">⚠️ SAFETY ALERT: FLAG DETECTED</div>`;
                }

                return `
                <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} group mb-4">
                    <div class="max-w-[85%] p-4 ${m.role === 'user' ? 'message-user' : 'message-claude shadow-xl'} relative message-bubble">
                        <div class="text-[10px] font-black tracking-widest uppercase mb-2 ${m.role === 'user' ? 'text-[#8be9fd]' : 'text-[#bd93f9]'} opacity-70">
                            ${m.role === 'user' ? 'NEURAL LINK: USER' : 'NEURAL LINK: CLAUDE'}
                        </div>
                        ${safetyBadge}
                        ${m.thinking ? `<div class="thinking-block">${escapeHtml(m.thinking)}</div>` : ''}
                        ${reasoningHtml}
                        <div class="prose prose-invert text-sm prose-pre:bg-[#1e1f29] prose-pre:border prose-pre:border-[#44475a] selection:bg-[#bd93f9]/30">
                            ${marked.parse(content)}
                        </div>

                        ${m.role !== 'user' ? `
                        <div class="message-actions opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-6 left-0 flex gap-2">
                            <button onclick="copyToClipboard(\`${m.content.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`)" class="text-[9px] font-bold text-[#6272a4] hover:text-[#bd93f9] flex items-center gap-1 bg-[#1e1f29] px-2 py-0.5 rounded border border-[#44475a]">
                                <i class="fas fa-copy"></i> COPIAR
                            </button>
                            <button onclick="sendToJules(\`${m.content.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`)" class="text-[9px] font-bold text-[#6272a4] hover:text-[#50fa7b] flex items-center gap-1 bg-[#1e1f29] px-2 py-0.5 rounded border border-[#44475a]">
                                <i class="fas fa-bolt"></i> ENVIAR A JULES
                            </button>
                        </div>
                        ` : ''}
                    </div>
                </div>
                `;
            }).join('');
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text);
            showToast('Copiado al portapapeles');
        }

        function sendToJules(text) {
            localStorage.setItem('jules_clipboard', text);
            showToast('Contenido enviado a Jules Panel');
            // Opcionalmente abrir el panel si no está abierto
        }

        function handleSlashCommand(command) {
            const parts = command.split(' ');
            const cmd = parts[0].toLowerCase();
            const args = parts.slice(1).join(' ');

            switch(cmd) {
                case '/tarea':
                    appendSystemMessage('Comando detectado: /tarea. El asistente God Mode procesará tu descripción.', 'info');
                    chatInput.value = 'Crea una tarea: ' + args;
                    sendMessage();
                    break;
                case '/move':
                    appendSystemMessage('Comando detectado: /move. Indica ID y estado.', 'info');
                    break;
                case '/jules':
                    window.location.href = '/jules-panel/';
                    break;
                default:
                    appendSystemMessage('Comando desconocido: ' + cmd, 'error');
            }
        }

        async function sendMessage() {
            const content = chatInput.value.trim();
            if ((!content && !attachedImage) || sendBtn.disabled) return;

            // God Mode Command Interception
            if (content.startsWith('/')) {
                handleSlashCommand(content);
                chatInput.value = '';
                return;
            }

            // Auto-create session if none exists
            if (!currentSessionId) {
                createNewSession();
            }

            const config = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
            const provider = config.provider || 'none';

            if (provider === 'none') {
                alert('Por favor, configura un proveedor de IA en API CONFIG.');
                openSettings();
                return;
            }

            const session = sessions.find(s => s.id === currentSessionId);
            session.messages.push({
                role: 'user',
                content: content,
                image: attachedImage || undefined
            });

            // Clear attached image
            if (attachedImage) removeAttachedImage();

            // Set title from first message
            if (session.title === 'Nueva Conversación') {
                session.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
            }

            chatInput.value = '';
            chatInput.style.height = 'auto';
            renderMessages();
            renderSessionList();

            // FEATURE #1: Thinking Animation UI
            thinkingIndicator.classList.remove('hidden');
            thinkingIndicator.innerHTML = '<div class="thinking-dots"><span>.</span><span>.</span><span>.</span></div>';
            sendBtn.disabled = true;
            chatInput.disabled = true;

            try {
                const modelType = config.modelType || 'chat';

                if (modelType === 'image-gen') {
                    await sendMessageImageGen(session, config);
                } else if (modelType === 'audio' && !config.useTextInAudioMode) {
                    // ASR handled by recording, but if they click send...
                    if (content) await sendMessageCustom(session, config);
                } else if (provider === 'ollama') {
                    await sendMessageOllama(session, config);
                } else if (provider === 'anthropic') {
                    await sendMessageAnthropic(session, config);
                } else if (provider === 'custom' || provider === 'openai' || provider === 'openrouter') {
                    await sendMessageCustom(session, config);
                } else {
                    throw new Error(`Proveedor ${provider} no implementado aún en Claude Chat.`);
                }
            } catch (e) {
                console.error('[ClaudeChat] Send error:', e);
                const errorMsg = provider === 'ollama' ? window.ollamaDiscovery.getErrorMessage(e, config.base_url) : e.message;
                appendSystemMessage(errorMsg, 'error');
            } finally {
                thinkingIndicator.classList.add('hidden');
                sendBtn.disabled = false;
                chatInput.disabled = false;
                chatInput.focus();
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }

        async function sendMessageAnthropic(session, config) {
            const apiKey = config.api_key;
            if (!apiKey) throw new Error('Anthropic API Key no configurada.');

            const requestBody = {
                model: config.model || 'claude-3-5-sonnet-20241022',
                max_tokens: 4096,
                messages: session.messages.map(m => ({ role: m.role, content: m.content })),
                system: session.systemPrompt,
                stream: true
            };

            if (isThinkingEnabled) {
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

        async function sendMessageOllama(session, config) {
            let baseUrl = config.base_url || '';
            baseUrl = baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
            const model = config.model || 'llama3';

            if (!baseUrl) {
                throw new Error('Base URL de Ollama no configurada. Por favor, configura el endpoint en API CONFIG.');
            }

            const response = await fetch(`${baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                mode: 'cors',
                credentials: 'omit',
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: session.systemPrompt },
                        ...session.messages.map(m => ({ role: m.role, content: m.content }))
                    ],
                    stream: true
                })
            });

            if (!response.ok) throw new Error(`Ollama Error: ${response.status}`);

            await consumeStream(response, session, 'ollama');
        }

        async function playTTS(text, config) {
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

        async function sendMessageCustom(session, config) {
            const baseUrl = (config.base_url || '').trim().replace(/\/+$/, '');
            const apiKey = config.api_key;
            const model = config.model;

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

            // Special case for Reasoning (add system prompt if it's the first message or use internal one)
            if (modelType === 'code') {
                const sysMsg = { role: "system", content: "You are an expert coding assistant. Always respond with clean, well-commented code." };
                messages.unshift(sysMsg);
            } else if (session.systemPrompt) {
                messages.unshift({ role: 'system', content: session.systemPrompt });
            }

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    max_tokens: 1024,
                    stream: false
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `API Error: ${response.status}`);
            }

            const data = await response.json();
            const aiContent = data.choices[0].message.content;

            session.messages.push({
                role: 'assistant',
                content: aiContent
            });

            // If model type is TTS, play response
            if (modelType === 'audio' && config.ttsEnabled) {
                playTTS(aiContent, config);
            }

            saveSessions();
            renderMessages();
        }

        async function sendMessageImageGen(session, config) {
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

        async function checkConnection(provider, config) {
            const statusBadge = document.getElementById('connection-status');
            const sidebarWarning = document.getElementById('sidebar-ollama-warning');

            try {
                if (provider === 'ollama') {
                    let baseUrl = config.base_url || 'http://localhost:11434';
                    baseUrl = baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
                    const response = await fetch(`${baseUrl}/api/tags`, {
                        mode: 'cors',
                        credentials: 'omit'
                    }).catch(() => null);
                    if (response && response.ok) {
                        statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#50fa7b] bg-[#50fa7b]/5 px-3 py-1 rounded-full border border-[#50fa7b]/20";
                        statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#50fa7b] shadow-[0_0_8px_#50fa7b] animate-pulse"></span> OLLAMA: ONLINE';
                        if (sidebarWarning) sidebarWarning.classList.add('hidden');
                    } else {
                        throw new Error();
                    }
                } else {
                    const key = config.api_key;
                    if (key && key.startsWith('sk-')) {
                        statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#8be9fd] bg-[#8be9fd]/5 px-3 py-1 rounded-full border border-[#8be9fd]/20";
                        statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#8be9fd] shadow-[0_0_8px_#8be9fd] animate-pulse"></span> ANTHROPIC: READY';
                    } else {
                        statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#ff5555] bg-[#ff5555]/5 px-3 py-1 rounded-full border border-[#ff5555]/20";
                        statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#ff5555] shadow-[0_0_8px_#ff5555]"></span> CONFIG REQUIRED';
                    }
                }
            } catch (e) {
                statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#ff5555] bg-[#ff5555]/5 px-3 py-1 rounded-full border border-[#ff5555]/20";
                statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#ff5555] shadow-[0_0_8px_#ff5555]"></span> OFFLINE';
                if (provider === 'ollama' && sidebarWarning) sidebarWarning.classList.remove('hidden');
            }
        }

        let debugEvents = [];
        function logDebug(msg, type = 'info') {
            const log = document.getElementById('debug-log');
            const time = new Date().toLocaleTimeString();
            debugEvents.unshift({ time, msg, type });
            if (debugEvents.length > 50) debugEvents.pop();

            const color = type === 'error' ? 'text-red-400' : (type === 'warn' ? 'text-yellow-400' : 'text-[#50fa7b]');

            const entry = document.createElement('div');
            entry.className = `border-b border-[#44475a]/30 pb-1 mb-1 ${color}`;
            entry.innerHTML = `<span class="opacity-40">[${time}]</span> <span class="font-bold">${type.toUpperCase()}:</span> ${escapeHtml(msg)}`;

            log.prepend(entry);
            if (log.children.length > 50) {
                log.lastElementChild.remove();
            }

            if (type === 'error') {
                document.getElementById('debug-panel').classList.remove('hidden');
            }
        }

        function toggleDebugPanel() {
            const log = document.getElementById('debug-log');
            const chev = document.getElementById('debug-chevron');
            if (log.classList.contains('hidden')) {
                log.classList.remove('hidden');
                chev.classList.replace('fa-chevron-down', 'fa-chevron-up');
            } else {
                log.classList.add('hidden');
                chev.classList.replace('fa-chevron-up', 'fa-chevron-down');
            }
        }

        async function consumeStream(response, session, provider) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiContent = '';
            let thinkingContent = '';
            let buffer = '';

            const msgDiv = document.createElement('div');
            msgDiv.className = 'flex justify-start group mb-4';
            msgDiv.innerHTML = `
                <div class="max-w-[85%] p-4 message-claude shadow-xl relative message-bubble">
                    <div class="text-[10px] font-black tracking-widest uppercase mb-2 text-[#bd93f9] opacity-70">NEURAL LINK: CLAUDE</div>
                    <div id="thinking-block" class="thinking-block hidden"></div>
                    <div class="prose prose-invert text-sm" id="streaming-content"></div>
                </div>
            `;
            chatMessages.appendChild(msgDiv);
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
                                // NDJSON nativo de Ollama: .message.content
                                if (data.message && data.message.content) {
                                    aiContent += data.message.content;
                                } else if (data.response) { // Fallback for /api/generate
                                    aiContent += data.response;
                                }

                                if (data.error) {
                                    logDebug(`Ollama stream error: ${data.error}`, 'error');
                                }
                            }

                            if (aiContent) {
                                streamEl.innerHTML = marked.parse(aiContent);
                            }
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        } catch (e) {
                            logDebug(`JSON parse error: ${e.message} in line: ${trimmedLine}`, 'warn');
                        }
                    }
                }
            } catch (e) {
                logDebug(`Stream read error: ${e.message}`, 'error');
                throw e;
            }

            session.messages.push({
                role: 'assistant',
                content: aiContent,
                thinking: thinkingContent || undefined
            });
            saveSessions();
            renderMessages();
        }

        sendBtn.onclick = sendMessage;
        chatInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
                chatInput.style.height = 'auto';
            }
        };

        // Auto-expand textarea (GOD MODE UX)
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (this.scrollHeight > 200) {
                this.style.overflowY = 'scroll';
                this.style.height = '200px';
            } else {
                this.style.overflowY = 'hidden';
            }
        });

        toggleThinkingBtn.onclick = () => {
            isThinkingEnabled = !isThinkingEnabled;
            toggleThinkingBtn.classList.toggle('dracula-cyan', isThinkingEnabled);
            const session = sessions.find(s => s.id === currentSessionId);
            if (session) {
                session.thinking = isThinkingEnabled;
                saveSessions();
            }
        };

        function openSystemPrompt() {
            document.getElementById('system-prompt-modal').classList.remove('hidden');
        }
        function closeSystemPrompt() {
            document.getElementById('system-prompt-modal').classList.add('hidden');
        }
        function saveSystemPrompt() {
            const val = document.getElementById('system-prompt-input').value;
            const session = sessions.find(s => s.id === currentSessionId);
            if (session) {
                session.systemPrompt = val;
                saveSessions();
            }
            closeSystemPrompt();
        }

        function showToast(msg) {
            console.log(msg);
            const toast = document.createElement('div');
            toast.className = 'fixed bottom-4 right-4 bg-[#44475a] text-white px-4 py-2 rounded-lg text-xs font-bold border border-[#bd93f9]/50 shadow-2xl z-[9999]';
            toast.textContent = msg;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        async function scanOllama() {
            const url = document.getElementById('ollama-url').value;
            const btn = document.querySelector('button[onclick="scanOllama()"]');
            btn.textContent = '...';
            try {
                const res = await fetch(`${url}/api/tags`);
                const data = await res.json();
                const select = document.getElementById('ollama-model-select');
                select.innerHTML = data.models.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
                document.getElementById('ollama-models').classList.remove('hidden');
                showToast('Ollama detectado: ' + data.models.length + ' modelos');
            } catch (e) {
                showToast('No se pudo conectar con Ollama', 'error');
            } finally {
                btn.textContent = 'SCAN';
            }
        }

        async function createStudioTask(title, description, priority = 'Major') {
            // Integration with Hypenosys Dashboard via github-api.js (Global window.githubApi)
            if (!window.githubApi || !window.githubApi.createTask) {
                console.error('github-api.js not loaded');
                return;
            }
            try {
                const task = {
                    title,
                    descripcion: description,
                    prioridad: priority,
                    estado: 'Pending',
                    fecha_creacion: new Date().toISOString(),
                    detectado_por: 'Claude Orchestrator',
                    milestone: 'M1'
                };
                await window.githubApi.createTask(task);
                showToast('Tarea creada en Dashboard: ' + title);
            } catch (e) {
                console.error('Error creating task:', e);
            }
        }

        function openSettings() { window.authManager.showApiConfigModal(); }
        function quickPrompt(text) {
            chatInput.value = text;
            sendMessage();
        }

        // Adaptative UI Handlers
        document.getElementById('attach-btn').onclick = () => document.getElementById('image-input').click();

        document.getElementById('image-input').onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                attachedImage = ev.target.result;
                document.getElementById('preview-img').src = attachedImage;
                document.getElementById('vision-preview').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        };

        function removeAttachedImage() {
            attachedImage = null;
            document.getElementById('vision-preview').classList.add('hidden');
            document.getElementById('image-input').value = '';
        }

        document.getElementById('toggle-input-mode').onclick = () => {
            const config = getActiveConfig();
            config.useTextInAudioMode = !config.useTextInAudioMode;
            localStorage.setItem('hy_ai_config', JSON.stringify(config));

            const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
            const activeId = localStorage.getItem('activeProfile');
            if (activeId && profiles[activeId]) {
                profiles[activeId].useTextInAudioMode = config.useTextInAudioMode;
                localStorage.setItem('ai_profiles', JSON.stringify(profiles));
            }

            adaptUI(config);
        };

        const recordBtn = document.getElementById('record-btn');
        recordBtn.onmousedown = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    await sendAudioTranscription(audioBlob);
                };

                mediaRecorder.start();
                recordBtn.classList.add('pulse', 'bg-red-500/40');
            } catch (e) {
                appendSystemMessage('Error al acceder al micrófono: ' + e.message, 'error');
            }
        };

        recordBtn.onmouseup = () => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                recordBtn.classList.remove('pulse', 'bg-red-500/40');
            }
        };

        async function sendAudioTranscription(blob) {
            const config = getActiveConfig();
            const baseUrl = (config.base_url || '').trim().replace(/\/+$/, '');
            const apiKey = config.api_key;

            const formData = new FormData();
            formData.append('file', blob, 'recording.webm');
            formData.append('model', config.model);

            thinkingIndicator.classList.remove('hidden');

            try {
                const response = await fetch(`${baseUrl}/audio/transcriptions`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                    body: formData
                });

                if (!response.ok) throw new Error('Transcripción fallida');

                const data = await response.json();
                chatInput.value = data.text;
                sendMessage();
            } catch (e) {
                appendSystemMessage('Error de transcripción: ' + e.message, 'error');
            } finally {
                thinkingIndicator.classList.add('hidden');
            }
        }

        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
        });

        // ─── Arranque del Claude Chat ──────────────────────────────────────
        (function arrancarClaude() {
            let arrancado = false;

            async function iniciar(user) {
                if (arrancado && user) return;
                arrancado = true;

                const loading = document.getElementById('claude-auth-loading');
                const gate = document.getElementById('claude-auth-gate');
                const main = document.getElementById('claude-main-interface');

                if (user) {
                    loading.classList.add('hidden');
                    gate.classList.add('hidden');
                    main.classList.remove('hidden');
                    try {
                        await init();
                    } catch (e) {
                        console.error('[Claude] Init failed:', e);
                    }
                } else {
                    loading.classList.add('hidden');
                    gate.classList.remove('hidden');
                    main.classList.add('hidden');
                }
            }

            // Centralized event-driven start
            document.addEventListener('authReady', (e) => iniciar(e.detail?.user || null));

            // Failsafe: hide skeleton if no auth event after 3s
            setTimeout(() => {
                if (!arrancado) {
                    console.warn('[Claude] Auth timeout failsafe triggered');
                    const user = window.githubApi?.user;
                    iniciar(user || null);
                }
            }, 3000);

            // Immediate check if AuthManager already fired or is loaded
            if (window.githubApi?.user !== undefined) {
                iniciar(window.githubApi.user);
            }
        })();
