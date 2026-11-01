/**
 * Neural Thinking Provider Adapters Module (Block 1)
 * Provider-specific request building and stream response parsing wrappers.
 * Keeps the rest of the application isolated from provider JSON schema variations.
 */

window.NeuralThinkingAdapters = (function() {

    const Capabilities = window.NeuralThinkingCapabilities;

    // Helper: Normalize Base URL
    function cleanUrl(url) {
        return (url || '').trim().replace(/\/+$/, '');
    }

    // ─── ADAPTADOR ANTHROPIC ───
    const AnthropicAdapter = {
        buildRequest({ model, messages, systemPrompt, isThinkingEnabled, budgetTokens, effort, apiKey, options = {} }) {
            const cap = Capabilities ? Capabilities.resolveCapability('anthropic', model, options) : {};
            const family = cap.family || 'adaptive';

            const headers = {
                'Content-Type': 'application/json',
                'anthropic-version': '2026-10-21'
            };
            if (apiKey && apiKey.trim()) {
                headers['Authorization'] = `Bearer ${apiKey.trim()}`;
            }

            const body = {
                model: model,
                messages: messages,
                stream: true,
                max_tokens: 4096
            };

            if (systemPrompt) {
                body.system = systemPrompt;
            }

            if (isThinkingEnabled && cap.supportsThinking) {
                if (family === 'manual') {
                    const budget = Math.max(1024, budgetTokens || 2048);
                    body.thinking = {
                        type: 'enabled',
                        budget_tokens: budget
                    };
                    const configuredMax = options.max_tokens || options.maxTokens || 4096;
                    body.max_tokens = Math.max(configuredMax, budget + 1024); // Preservar si es mayor y garantizar max_tokens > budget_tokens
                } else { // adaptive
                    body.thinking = {
                        type: 'adaptive',
                        display: 'summarized'
                    };
                    body.output_config = {
                        effort: effort || 'medium'
                    };
                }
                // Validacion Anthropic: No temperature con thinking activo
                delete body.temperature;
            } else if (cap.canDisable) {
                if (cap.offPayloadMode === 'disabled') {
                    body.thinking = { type: 'disabled' };
                }
                // Si offPayloadMode es 'omit', no incluimos la clave thinking
            }

            return {
                url: 'https://api.anthropic.com/v1/messages',
                headers: headers,
                body: body,
                mode: 'native_anthropic'
            };
        },

        parseStream(chunk, parseState) {
            let thinkingDelta = '';
            let contentDelta = '';

            if (chunk && chunk.type === 'content_block_delta') {
                const delta = chunk.delta;
                if (delta) {
                    if (delta.type === 'thinking_delta') {
                        thinkingDelta = delta.thinking || '';
                    } else if (delta.type === 'text_delta') {
                        contentDelta = delta.text || '';
                    }
                }
            }

            return { thinkingDelta, contentDelta };
        }
    };

    // ─── ADAPTADOR GEMINI ───
    const GeminiAdapter = {
        buildRequest({ model, messages, systemPrompt, isThinkingEnabled, effort, apiKey, baseUrl, options = {} }) {
            const cap = Capabilities ? Capabilities.resolveCapability('gemini', model, options) : {};
            const endpoint = `${cleanUrl(baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai')}/chat/completions`;

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const fullMessages = [];
            if (systemPrompt) fullMessages.push({ role: 'system', content: systemPrompt });
            fullMessages.push(...messages);

            const body = {
                model: model,
                messages: fullMessages,
                stream: false
            };

            if (isThinkingEnabled && cap.supportsThinking) {
                // ASSERTION EXCLUSIVIDAD: O bien reasoning_effort O bien thinking_config/thinking_budget/thinking_level, NUNCA ambos.
                if ((effort || options.reasoningEffort) && (options.useThinkingConfig || options.thinkingConfig || options.thinkingBudget || options.thinkingLevel)) {
                    throw new Error("Gemini API Exception: reasoning_effort and thinking_config/thinking_budget/thinking_level are mutually exclusive and cannot be sent simultaneously.");
                }

                const useThinkingConfig = options.useThinkingConfig || false;

                if (useThinkingConfig) {
                    body.extra_body = {
                        google: {
                            thinking_config: {
                                include_thoughts: true,
                                thinking_budget: options.thinkingBudget || 2048
                            }
                        }
                    };
                } else {
                    body.reasoning_effort = effort || 'medium';
                }
            } else if (cap.canDisable && cap.offPayload) {
                Object.assign(body, cap.offPayload);
            }

            return { url: endpoint, headers, body, mode: 'openai_compat' };
        },

        parseStream(data, parseState) {
            let thinkingDelta = '';
            let contentDelta = '';

            if (data && data.choices && data.choices[0]) {
                const delta = data.choices[0].delta || {};
                if (delta.reasoning_content) {
                    thinkingDelta = delta.reasoning_content;
                } else if (delta.thoughts) {
                    thinkingDelta = delta.thoughts;
                }
                if (delta.content) {
                    contentDelta = delta.content;
                }
            }

            return { thinkingDelta, contentDelta };
        }
    };

    // ─── ADAPTADOR OLLAMA (API NATIVA /api/chat) ───
    const OllamaAdapter = {
        buildRequest({ model, messages, systemPrompt, isThinkingEnabled, baseUrl, options = {} }) {
            const cap = Capabilities ? Capabilities.resolveCapability('ollama', model, options) : {};
            const host = cleanUrl(baseUrl || 'http://localhost:11434').replace(/\/v1$/, '');
            const endpoint = `${host}/api/chat`;

            const fullMessages = [];
            if (systemPrompt) fullMessages.push({ role: 'system', content: systemPrompt });
            fullMessages.push(...messages);

            const body = {
                model: model,
                messages: fullMessages,
                stream: true
            };

            // Ollama: think es propiedad top-level
            if (isThinkingEnabled && cap.supportsThinking) {
                body.think = true;
            } else if (cap.canDisable) {
                body.think = false;
            }

            return { url: endpoint, headers: { 'Content-Type': 'application/json' }, body, mode: 'ollama_native' };
        },

        parseStream(data, parseState) {
            let thinkingDelta = '';
            let contentDelta = '';

            if (data && data.message) {
                if (data.message.thinking) {
                    thinkingDelta = data.message.thinking;
                }
                if (data.message.content) {
                    contentDelta = data.message.content;
                }
            }

            return { thinkingDelta, contentDelta };
        }
    };

    // ─── ADAPTADOR MISTRAL ───
    const MistralAdapter = {
        buildRequest({ model, messages, systemPrompt, isThinkingEnabled, apiKey, baseUrl, options = {} }) {
            const cap = Capabilities ? Capabilities.resolveCapability('mistral', model, options) : {};
            const endpoint = `${cleanUrl(baseUrl || 'https://api.mistral.ai/v1')}/chat/completions`;

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const fullMessages = [];
            if (systemPrompt) fullMessages.push({ role: 'system', content: systemPrompt });
            fullMessages.push(...messages);

            const body = {
                model: model,
                messages: fullMessages,
                stream: true
            };

            if (isThinkingEnabled && cap.supportsThinking) {
                body.reasoning_effort = 'high';
            } else if (cap.canDisable && cap.offPayload) {
                Object.assign(body, cap.offPayload);
            }

            return { url: endpoint, headers, body, mode: 'openai_compat' };
        },

        parseStream(data, parseState) {
            let thinkingDelta = '';
            let contentDelta = '';

            if (data && data.choices && data.choices[0]) {
                const delta = data.choices[0].delta || {};

                // Mistral delta.content puede ser un string plano O un array de chunks
                if (Array.isArray(delta.content)) {
                    delta.content.forEach(chunk => {
                        if (chunk.type === 'thinking' || chunk.type === 'think') {
                            if (Array.isArray(chunk.thinking)) {
                                thinkingDelta += chunk.thinking.map(t => typeof t === 'string' ? t : (t.text || '')).join('');
                            } else if (typeof chunk.thinking === 'string') {
                                thinkingDelta += chunk.thinking;
                            }
                        } else if (chunk.type === 'text') {
                            contentDelta += typeof chunk.text === 'string' ? chunk.text : '';
                        }
                    });
                } else if (typeof delta.content === 'string') {
                    contentDelta = delta.content;
                }

                if (delta.reasoning_content) {
                    thinkingDelta += delta.reasoning_content;
                }
            }

            return { thinkingDelta, contentDelta };
        }
    };

    // ─── ADAPTADOR NVIDIA NIM ───
    const NimAdapter = {
        buildRequest({ model, messages, systemPrompt, isThinkingEnabled, apiKey, baseUrl, options = {} }) {
            const cap = Capabilities ? Capabilities.resolveCapability('nvidia_nim', model, options) : {};
            const endpoint = `${cleanUrl(baseUrl || 'https://hypenosys-gatekeeper-v2.axlffcc.workers.dev/v1')}/chat/completions`;

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const fullMessages = [];
            if (systemPrompt) fullMessages.push({ role: 'system', content: systemPrompt });
            fullMessages.push(...messages);

            const body = {
                model: model,
                messages: fullMessages,
                stream: true
            };

            if (isThinkingEnabled && cap.supportsThinking) {
                body.chat_template_kwargs = { enable_thinking: true };
                if (options.reasoningBudget) {
                    body.reasoning_budget = options.reasoningBudget;
                }
            } else if (cap.canDisable && cap.offPayload) {
                Object.assign(body, cap.offPayload);
            }

            return { url: endpoint, headers, body, mode: 'openai_compat' };
        },

        parseStream(data, parseState) {
            let thinkingDelta = '';
            let contentDelta = '';

            if (data && data.choices && data.choices[0]) {
                const delta = data.choices[0].delta || {};
                if (delta.reasoning_content) {
                    thinkingDelta = delta.reasoning_content;
                } else if (delta.reasoning) {
                    thinkingDelta = delta.reasoning;
                }
                if (delta.content) {
                    contentDelta = delta.content;
                }
            }

            return { thinkingDelta, contentDelta };
        }
    };

    // ─── ADAPTADOR OPENROUTER ───
    const OpenRouterAdapter = {
        buildRequest({ model, messages, systemPrompt, isThinkingEnabled, effort, apiKey, baseUrl, options = {} }) {
            const cap = Capabilities ? Capabilities.resolveCapability('openrouter', model, options) : {};
            const endpoint = `${cleanUrl(baseUrl || 'https://openrouter.ai/api/v1')}/chat/completions`;

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const fullMessages = [];
            if (systemPrompt) fullMessages.push({ role: 'system', content: systemPrompt });
            fullMessages.push(...messages);

            const body = {
                model: model,
                messages: fullMessages,
                stream: true
            };

            if (isThinkingEnabled && cap.supportsThinking) {
                body.reasoning = { effort: effort || 'medium' };
            } else if (cap.canDisable && cap.offPayload) {
                Object.assign(body, cap.offPayload);
            }

            return { url: endpoint, headers, body, mode: 'openai_compat' };
        },

        parseStream(data, parseState) {
            let thinkingDelta = '';
            let contentDelta = '';

            if (data && data.choices && data.choices[0]) {
                const delta = data.choices[0].delta || {};
                if (delta.reasoning) {
                    thinkingDelta = delta.reasoning;
                } else if (delta.reasoning_content) {
                    thinkingDelta = delta.reasoning_content;
                }
                if (delta.content) {
                    contentDelta = delta.content;
                }
            }

            return { thinkingDelta, contentDelta };
        }
    };

    // ─── ADAPTADOR OPENAI ───
    const OpenAiAdapter = {
        buildRequest({ model, messages, systemPrompt, isThinkingEnabled, effort, apiKey, baseUrl, options = {} }) {
            const cap = Capabilities ? Capabilities.resolveCapability('openai', model, options) : {};
            const endpoint = `${cleanUrl(baseUrl || 'https://api.openai.com/v1')}/chat/completions`;

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const fullMessages = [];
            if (systemPrompt) fullMessages.push({ role: 'system', content: systemPrompt });
            fullMessages.push(...messages);

            const body = {
                model: model,
                messages: fullMessages,
                stream: true
            };

            if (isThinkingEnabled && cap.supportsThinking) {
                body.reasoning_effort = effort || 'medium';
            }
            // Para OpenAI, si canDisable es false, no enviamos nada en offPayload

            return { url: endpoint, headers, body, mode: 'openai_compat' };
        },

        parseStream(data, parseState) {
            let contentDelta = '';
            if (data && data.choices && data.choices[0]) {
                const delta = data.choices[0].delta || {};
                if (delta.content) {
                    contentDelta = delta.content;
                }
            }
            return { thinkingDelta: '', contentDelta };
        }
    };

    // Mapa de adaptadores registrados por proveedor
    const ADAPTERS = {
        anthropic: AnthropicAdapter,
        gemini: GeminiAdapter,
        ollama: OllamaAdapter,
        mistral: MistralAdapter,
        nvidia_nim: NimAdapter,
        openrouter: OpenRouterAdapter,
        openai: OpenAiAdapter,
        custom: OpenAiAdapter
    };

    function getAdapter(provider) {
        return ADAPTERS[provider] || OpenAiAdapter;
    }

    return {
        getAdapter,
        ADAPTERS
    };

})();
