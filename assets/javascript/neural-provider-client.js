/**
 * Neural Provider Client
 * DOM-independent client for AI provider interactions.
 * Reuses existing API Config from localStorage: hy_ai_config.
 */

window.NeuralProviderClient = (function() {

    function getConfig() {
        try {
            const config = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
            if (config.provider && config.provider !== 'none') {
                console.log("[Neural Chat Core] Provider config loaded:", config.provider);
            }
            return config;
        } catch (e) {
            console.error('[NeuralProviderClient] Error parsing hy_ai_config:', e);
            return {};
        }
    }

    function normalizeBaseUrl(url, provider) {
        if (!url) return '';
        let normalized = url.trim().replace(/\/+$/, '');

        if (provider === 'ollama') {
            if (!normalized.startsWith('http')) {
                normalized = 'http://' + normalized;
            }
            if (!normalized.endsWith('/v1')) {
                normalized += '/v1';
            }
        } else if (provider === 'nvidia_nim') {
            // Preserve NIM URLs exactly as provided (with trim/trailing slash removed)
            // If user provided https://integrate.api.nvidia.com/v1, we keep it as is.
        }
        return normalized;
    }

    async function sendMessage({ messages, systemPrompt, onToken, onDone, onError }) {
        const config = getConfig();
        const provider = config.provider || 'none';

        if (provider === 'none') {
            const err = 'No hay proveedor de IA configurado. Por favor, usa el botón "API Config" para configurar Ollama o un endpoint compatible.';
            if (onError) onError(new Error(err));
            return;
        }

        const baseUrl = normalizeBaseUrl(config.base_url, provider);
        const model = config.model || (provider === 'ollama' ? 'llama3' : 'gpt-3.5-turbo');
        const apiKey = config.api_key || '';

        if (window.HYPENOSYS_NEURAL_DEBUG) {
            console.log("[Claude Neural] selected provider:", provider);
            console.log("[Claude Neural] selected model:", model);
            console.log("[Claude Neural] provider config found:", !!baseUrl);
        }

        console.log(`[NeuralProviderClient] Request started. Provider: ${provider}, Model: ${model}, BaseURL: ${baseUrl}`);

        try {
            const fullMessages = [];
            if (systemPrompt) {
                fullMessages.push({ role: 'system', content: systemPrompt });
            }
            fullMessages.push(...messages);

            const endpoint = `${baseUrl}/chat/completions`;

            const headers = {
                'Content-Type': 'application/json'
            };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            // Remove x-requested-with as it can trigger CORS preflight issues
            // and was confirmed unnecessary in functional Termux tests.

            const payload = {
                model: model,
                messages: fullMessages,
                stream: true
            };

            if (window.HYPENOSYS_NEURAL_DEBUG) {
                console.log("[Claude Neural] sending to provider");
                console.log("[Claude Neural] provider request payload:", payload);
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload),
                mode: 'cors',
                credentials: 'omit'
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => 'Unknown error');
                throw new Error(`AI request failed for provider ${provider} at ${baseUrl}. Status: ${response.status}. ${errText}`);
            }

            console.log('[NeuralProviderClient] Stream started');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiContent = '';
            let buffer = '';

            if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] provider response received");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                    const dataStr = trimmedLine.substring(6);
                    if (dataStr === '[DONE]') break;

                    try {
                        const data = JSON.parse(dataStr);
                        const delta = data.choices?.[0]?.delta?.content || '';
                        if (delta) {
                            aiContent += delta;
                            if (onToken) onToken(delta, aiContent);
                        }
                    } catch (e) {
                        console.warn('[NeuralProviderClient] JSON parse error in stream:', e);
                    }
                }
            }

            console.log('[NeuralProviderClient] Done');
            if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] provider response text:", aiContent);
            if (onDone) onDone(aiContent);

        } catch (e) {
            console.error('[NeuralProviderClient] Error:', e);

            // Sanitize error message to prevent API key leakage if it was somehow included
            let safeMessage = e.message || "Unknown error";
            if (apiKey) {
                const escapedKey = apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                safeMessage = safeMessage.replace(new RegExp(escapedKey, 'g'), '[REDACTED]');
            }

            if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] provider call failed:", safeMessage);
            if (onError) {
                // Provider-aware error messages
                let troubleshooting = "Check VPN reachability";

                if (provider === 'ollama') {
                    troubleshooting += ", CORS/OLLAMA_ORIGINS and local network connectivity.";
                } else if (provider === 'nvidia_nim') {
                    troubleshooting += ", browser CORS policy and API key validity.";
                }

                if (baseUrl.startsWith('http://') && window.location.protocol === 'https:') {
                    troubleshooting += " (Possible Mixed Content block)";
                }

                const detailedError = new Error(`AI request failed for provider ${provider} at ${baseUrl}. ${safeMessage}. ${troubleshooting}`);
                onError(detailedError);
            }
        }
    }

    return {
        sendMessage,
        normalizeBaseUrl
    };

})();
