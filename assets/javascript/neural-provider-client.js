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

            const useStream = provider !== 'nvidia_nim';

            const payload = {
                model: model,
                messages: fullMessages,
                stream: useStream
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

            let aiContent = '';

            if (useStream) {
                console.log('[NeuralProviderClient] Stream started');
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
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
            } else {
                console.log('[NeuralProviderClient] Non-streaming response received');
                const data = await response.json();
                aiContent = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || JSON.stringify(data);
                if (onToken) onToken(aiContent, aiContent);
            }

            console.log('[NeuralProviderClient] Done');
            if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] provider response text:", aiContent);
            if (onDone) onDone(aiContent);

        } catch (e) {
            // Sanitize error message to prevent API key leakage
            let safeMessage = e.message || "Unknown error";
            if (apiKey) {
                const escapedKey = apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const replacement = apiKey.startsWith('nvapi-') ? 'nvapi-***REDACTED***' : '[REDACTED]';
                safeMessage = safeMessage.replace(new RegExp(escapedKey, 'g'), replacement);
            }

            console.error('[NeuralProviderClient] Error:', safeMessage);
            if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Neural] provider call failed:", safeMessage);

            if (onError) {
                const isNetworkFailure = safeMessage.includes('Failed to fetch') ||
                                       safeMessage.includes('NetworkError') ||
                                       !safeMessage.includes('Status:');

                const isNvidiaCloud = provider === 'nvidia_nim' && baseUrl.includes('integrate.api.nvidia.com');
                const isNvidiaRelay = provider === 'nvidia_nim' && baseUrl.includes('hypenosys-gatekeeper-v2.axlffcc.workers.dev');
                const isOllama = provider === 'ollama';

                // Specific case: NVIDIA Cloud direct browser failure (CORS/Preflight)
                if (isNvidiaCloud && isNetworkFailure) {
                    const nimError = new Error(`NVIDIA NIM direct browser request failed before receiving an HTTP response. The same endpoint/model/API key works outside the browser, so this points to browser/origin blocking such as CORS or preflight from GitHub Pages. Use TEST NIM DIRECT for details.`);
                    onError(nimError);
                    return;
                }

                // Specific case: NVIDIA Relay failure
                if (isNvidiaRelay && isNetworkFailure) {
                    const relayError = new Error(`Relay endpoint could not be reached. Check the relay Base URL, CORS configuration, or Worker availability. No HTTP status was received.`);
                    onError(relayError);
                    return;
                }

                // General provider-aware troubleshooting
                let troubleshooting = [];

                // 1. Mixed Content
                if (baseUrl.startsWith('http://') && window.location.protocol === 'https:') {
                    troubleshooting.push("Possible Mixed Content block (HTTP requested from HTTPS)");
                }

                // 2. Private/Local Network (only if endpoint is private)
                const host = baseUrl.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
                const isPrivate = /(^127\.)|(^192\.168\.)|(^10\.)|(^172\.(1[6-9]|2[0-9]|3[0-1])\.)|(^100\.)|(^localhost)|(\.local$)/.test(host);

                if (isPrivate) {
                    troubleshooting.push("Check VPN reachability and local network connectivity");
                }

                // 3. Provider Specifics
                if (isOllama) {
                    troubleshooting.push("Check OLLAMA_ORIGINS and if Ollama is running");
                } else if (provider === 'nvidia_nim') {
                    if (!isNetworkFailure) {
                        // We have an HTTP status if it's not a network failure
                        if (safeMessage.includes('Status: 400')) {
                            troubleshooting.push("Invalid payload or unsupported parameters");
                        } else if (safeMessage.includes('Status: 401')) {
                            troubleshooting.push("Check API key validity (Authentication failed)");
                        } else if (safeMessage.includes('Status: 403')) {
                            troubleshooting.push("Forbidden: Check entitlements or permissions for this model");
                        } else if (safeMessage.includes('Status: 404')) {
                            troubleshooting.push("Model not found. Verify the model ID");
                        } else if (safeMessage.includes('Status: 410')) {
                            troubleshooting.push("This NVIDIA NIM model is no longer available or has reached end-of-life (EOL). Please choose another model or refresh the catalog.");
                        } else if (safeMessage.includes('Status: 429')) {
                            troubleshooting.push("Rate limit or quota exceeded");
                        } else if (safeMessage.includes('Status: 500') || safeMessage.includes('Status: 502') || safeMessage.includes('Status: 503')) {
                            troubleshooting.push("NVIDIA upstream server error");
                        }
                    }
                }

                // Default if no specific troubleshooting found and it's a generic network error
                if (troubleshooting.length === 0 && isNetworkFailure && !isNvidiaCloud) {
                    troubleshooting.push("Check your internet connection or browser blocking policies");
                }

                const troubleshootingText = troubleshooting.length > 0 ? `. ${troubleshooting.join('. ')}.` : '';
                const detailedError = new Error(`AI request failed for provider ${provider} at ${baseUrl}. ${safeMessage}${troubleshootingText}`);
                onError(detailedError);
            }
        }
    }

    return {
        sendMessage,
        normalizeBaseUrl
    };

})();
