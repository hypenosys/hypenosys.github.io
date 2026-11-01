/**
 * Ollama UI Management Module & AI Provider Configuration Helpers
 */

const GATEKEEPER_BASE_URL = 'https://hypenosys-gatekeeper-v2.axlffcc.workers.dev/v1';

const PROVIDER_DEFAULTS = {
    nvidia_nim: {
        baseUrl: GATEKEEPER_BASE_URL,
        embeddingsBaseUrl: GATEKEEPER_BASE_URL,
        supportsEmbeddings: true,
        upstreamUrl: 'https://integrate.api.nvidia.com/v1',
        browserDirect: false,
        viaRelay: true
    },
    ollama:     { baseUrl: 'http://localhost:11434/v1', embeddingsBaseUrl: 'http://localhost:11434/v1', supportsEmbeddings: true },
    openai:     { baseUrl: 'https://api.openai.com/v1', embeddingsBaseUrl: 'https://api.openai.com/v1', supportsEmbeddings: true },
    openrouter: { baseUrl: 'https://openrouter.ai/api/v1', embeddingsBaseUrl: 'https://openrouter.ai/api/v1', supportsEmbeddings: true },
    anthropic:  { baseUrl: 'https://api.anthropic.com/v1', embeddingsBaseUrl: 'https://api.anthropic.com/v1', supportsEmbeddings: false },
    gemini:     { baseUrl: 'https://generativelanguage.googleapis.com', embeddingsBaseUrl: 'https://generativelanguage.googleapis.com', supportsEmbeddings: true },
    mistral:    { baseUrl: 'https://api.mistral.ai/v1', embeddingsBaseUrl: 'https://api.mistral.ai/v1', supportsEmbeddings: true },
    custom:     { baseUrl: '', embeddingsBaseUrl: '', supportsEmbeddings: true },
    none:       { baseUrl: '', embeddingsBaseUrl: '', supportsEmbeddings: false }
};

if (typeof window !== 'undefined') {
    window.GATEKEEPER_BASE_URL = GATEKEEPER_BASE_URL;
    window.PROVIDER_DEFAULTS = PROVIDER_DEFAULTS;
}

function isLocalUrl(url) {
    if (!url) return false;
    try {
        const cleanUrl = url.trim();
        const hostname = new URL(cleanUrl.includes('://') ? cleanUrl : `http://${cleanUrl}`).hostname;
        return hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            /^10\./.test(hostname) ||
            /^192\.168\./.test(hostname) ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
    } catch (e) {
        return false;
    }
}

function classifyModel(id, meta = null) {
    if (!id) return 'unknown';
    const m = id.toLowerCase();

    if (meta && meta.capabilities && Array.isArray(meta.capabilities) && meta.capabilities.includes('embedding')) {
        return 'embedding';
    }

    if (m.includes('rerank')) {
        return 'rerank';
    }

    if (/embed|embedding|bge|e5|gte|minilm|mxbai|nomic|arctic-embed|retriever/.test(m)) {
        return 'embedding';
    }

    return 'chat';
}

function getEmbeddingsConfig() {
    let aiConfig = {};
    try {
        aiConfig = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
    } catch (e) {
        console.warn('[AIConfig] Error reading hy_ai_config:', e);
    }

    const embedProvider = aiConfig.embed_provider || aiConfig.ai_embed_provider || 'same_as_main';

    if (embedProvider === 'same_as_main' || !embedProvider) {
        const mainProvider = aiConfig.provider || 'none';
        const defaultBase = PROVIDER_DEFAULTS[mainProvider]?.embeddingsBaseUrl || PROVIDER_DEFAULTS[mainProvider]?.baseUrl || '';
        return {
            provider: mainProvider,
            baseUrl: aiConfig.base_url || defaultBase,
            apiKey: aiConfig.api_key || '',
            model: aiConfig.embedding_model || aiConfig.embed_model || ''
        };
    }

    const defaultEmbedBase = PROVIDER_DEFAULTS[embedProvider]?.embeddingsBaseUrl || PROVIDER_DEFAULTS[embedProvider]?.baseUrl || '';
    return {
        provider: embedProvider,
        baseUrl: aiConfig.embed_base_url || defaultEmbedBase,
        apiKey: aiConfig.embed_api_key || '',
        model: aiConfig.embed_model || aiConfig.embedding_model || ''
    };
}

async function discoverModels({ provider, baseUrl, apiKey }) {
    if (!baseUrl && provider !== 'none') {
        throw new Error('Base URL no provista.');
    }

    let rawModels = [];
    const cleanBaseUrl = (baseUrl || '').replace(/\/+$/, '');

    try {
        if (provider === 'ollama') {
            const host = cleanBaseUrl.replace(/\/v1$/, '');
            const res = await fetch(`${host}/api/tags`);
            if (!res.ok) {
                throw new Error(`Ollama API error ${res.status}: ${res.statusText}`);
            }
            const data = await res.json();
            const modelsList = data.models || [];

            for (const m of modelsList) {
                let meta = null;
                try {
                    const showRes = await fetch(`${host}/api/show`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: m.name })
                    });
                    if (showRes.ok) {
                        meta = await showRes.json();
                    }
                } catch (showErr) {
                    // Fallback to heuristic
                }
                rawModels.push({
                    id: m.name,
                    kind: classifyModel(m.name, meta)
                });
            }
        } else if (provider === 'nvidia_nim') {
            try {
                const res = await fetch(`${cleanBaseUrl}/models`, {
                    headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
                });
                if (res.ok) {
                    const data = await res.json();
                    const list = data.data || [];
                    rawModels = list.map(m => ({
                        id: m.id,
                        kind: classifyModel(m.id)
                    }));
                } else {
                    if (res.status === 404 && cleanBaseUrl.includes('workers.dev')) {
                        throw new Error(`Error 404: Ruta /models no soportada por el Gatekeeper.`);
                    }
                    throw new Error(`NIM API ${res.status}`);
                }
            } catch (nimErr) {
                if (window.NVIDIA_NIM_CATALOG) {
                    const catalog = window.NVIDIA_NIM_CATALOG;
                    const staticList = [
                        ...catalog.chat,
                        ...catalog.vision,
                        ...catalog.speech,
                        ...catalog.embeddings
                    ];
                    rawModels = staticList.map(m => ({
                        id: m.id,
                        kind: classifyModel(m.id)
                    }));
                } else {
                    throw nimErr;
                }
            }
        } else if (provider === 'anthropic') {
            if (!apiKey || !apiKey.trim()) {
                throw new Error('Introduce una API Key de Anthropic para descubrir modelos.');
            }

            // Current Claude API: Bearer authentication. Browser CORS is not supported
            // for ZDR organizations, which must use an authenticated backend proxy.
            const headers = {
                'Authorization': `Bearer ${apiKey.trim()}`,
                'anthropic-version': '2026-10-21'
            };
            const cursors = new Set();
            let afterId = '';

            for (let page = 0; page < 50; page++) {
                const url = new URL(`${cleanBaseUrl}/models`);
                url.searchParams.set('limit', '100');
                if (afterId) url.searchParams.set('after_id', afterId);

                const res = await fetch(url.toString(), {
                    headers,
                    mode: 'cors',
                    credentials: 'omit'
                });
                if (!res.ok) {
                    const reason = res.status === 401 ? 'API key no válida.'
                        : res.status === 403 ? 'La API key no tiene permisos.'
                        : res.status === 429 ? 'Límite de peticiones alcanzado.'
                        : 'No se pudo recuperar el catálogo.';
                    throw new Error(`Anthropic API error ${res.status}: ${reason}`);
                }

                const data = await res.json();
                if (!Array.isArray(data.data)) {
                    throw new Error('Respuesta inválida de la API de modelos Anthropic.');
                }
                rawModels.push(...data.data
                    .filter(m => typeof m.id === 'string' && m.id && m.lifecycle !== 'retired')
                    .map(m => ({
                        id: m.id,
                        label: m.display_name || m.id,
                        kind: 'chat',
                        lifecycle: m.lifecycle || 'active',
                        capabilities: m.capabilities || null
                    })));

                if (!data.has_more) break;
                const nextCursor = data.last_id || data.data[data.data.length - 1]?.id;
                if (!nextCursor || cursors.has(nextCursor)) {
                    throw new Error('Paginación inválida al descubrir modelos de Anthropic.');
                }
                if (page === 49) {
                    throw new Error('Demasiadas páginas de modelos Anthropic.');
                }
                cursors.add(nextCursor);
                afterId = nextCursor;
            }
        } else {
            const res = await fetch(`${cleanBaseUrl}/models`, {
                headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
            });
            if (!res.ok) {
                throw new Error(`API error ${res.status}: ${res.statusText}`);
            }
            const data = await res.json();
            const list = data.data || [];
            rawModels = list.map(m => ({
                id: m.id,
                kind: classifyModel(m.id)
            }));
        }
    } catch (err) {
        if (err.name === 'TypeError' || err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            let msg = provider === 'anthropic'
                ? 'Sin respuesta HTTP de Anthropic: posible bloqueo CORS, problema de red o política del navegador. Si tu organización usa ZDR, necesitas un proxy backend.'
                : 'Error de conexión o red (Posible CORS o Mixed Content).';
            if (cleanBaseUrl.startsWith('http://') && typeof window !== 'undefined' && window.location?.protocol === 'https:') {
                msg += ' Estás accediendo vía HTTPS e intentando llamar a un endpoint HTTP.';
            }
            if (provider === 'ollama') {
                msg += ' Asegúrate de que Ollama está ejecutándose con OLLAMA_ORIGINS=*';
            }
            throw new Error(msg);
        }
        throw err;
    }

    if (provider === 'anthropic') {
        // Keep the latest entry for an ID; do not show models retired from inference.
        return [...new Map(rawModels.map(m => [m.id, m])).values()];
    }
    return rawModels;
}

async function testEmbeddingEndpoint({ provider, baseUrl, apiKey, model }) {
    if (!baseUrl) throw new Error('Base URL requerida.');
    if (!model) throw new Error('Modelo de embedding requerido.');

    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    let endpoint = `${cleanBaseUrl}/embeddings`;

    let payload = {
        model: model,
        input: "Test embedding generation"
    };

    if (provider === 'nvidia_nim') {
        payload.input_type = "query";
    }

    if (provider === 'ollama' && !cleanBaseUrl.endsWith('/v1')) {
        endpoint = `${cleanBaseUrl}/api/embeddings`;
        payload = {
            model: model,
            prompt: "Test embedding generation"
        };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 404 && cleanBaseUrl.includes('workers.dev')) {
            throw new Error('Error 404: Ruta de embeddings no soportada por el Gatekeeper.');
        }
        if (res.status === 401 || res.status === 403) {
            throw new Error(`Error ${res.status}: API key missing or invalid.`);
        }
        throw new Error(`Error ${res.status}: ${text.substring(0, 150)}`);
    }

    const data = await res.json();
    let embeddingVector = null;

    if (data.data && Array.isArray(data.data) && data.data[0]?.embedding) {
        embeddingVector = data.data[0].embedding;
    } else if (data.embedding && Array.isArray(data.embedding)) {
        embeddingVector = data.embedding;
    }

    if (!embeddingVector || !Array.isArray(embeddingVector)) {
        throw new Error('La respuesta no contiene un vector de embedding válido.');
    }

    return {
        dimension: embeddingVector.length,
        success: true
    };
}

if (typeof window !== 'undefined') {
    window.isLocalUrl = isLocalUrl;
    window.classifyModel = classifyModel;
    window.getEmbeddingsConfig = getEmbeddingsConfig;
    window.discoverModels = discoverModels;
    window.testEmbeddingEndpoint = testEmbeddingEndpoint;
}

class OllamaUI {
    constructor() {
        this.discovery = window.ollamaDiscovery;
        this.previousProvider = 'none';
        this.previousEmbeddingsProvider = 'same_as_main';
    }

    handleProviderChange() {
        const providerEl = document.getElementById('ai_provider');
        if (!providerEl) return;
        const provider = providerEl.value;
        const modelInput = document.getElementById('ai_model');
        const baseUrlGroup = document.getElementById('group-base-url');
        const baseUrlInput = document.getElementById('ai_base_url');
        const localNetworkChk = document.getElementById('ai_local_network');

        // Clear discovered models dropdown when switching providers
        const customModelsSelect = document.getElementById('custom-models-select');
        const customModelsGroup = document.getElementById('group-custom-models');
        if (customModelsSelect) customModelsSelect.innerHTML = '<option value="">Carga modelos primero...</option>';
        if (customModelsGroup) customModelsGroup.style.display = 'none';

        // Clear model input if switching provider and model doesn't belong to new provider
        if (modelInput && this.previousProvider !== provider && this.previousProvider !== 'none') {
            const currentModel = modelInput.value.trim();
            if (provider === 'nvidia_nim' && !currentModel.startsWith('nvidia/')) {
                modelInput.value = '';
            } else if (provider === 'ollama' && currentModel.startsWith('nvidia/')) {
                modelInput.value = '';
            }
        }

        // Autocomplete Base URL if empty or matching previous default
        const prevDefault = PROVIDER_DEFAULTS[this.previousProvider]?.baseUrl || '';
        const currentVal = baseUrlInput.value.trim();

        if (provider === 'anthropic' || !currentVal || currentVal === prevDefault || (this.previousProvider === 'nvidia_nim' && currentVal === 'https://integrate.api.nvidia.com/v1')) {
            const newDefault = PROVIDER_DEFAULTS[provider]?.baseUrl || '';
            baseUrlInput.value = newDefault;
        }

        // Check if direct NVIDIA URL warning is needed
        this.checkNIMDirectWarning();

        // Uncheck local network checkbox if new URL is non-local HTTPS
        const newUrl = baseUrlInput.value.trim();
        if (newUrl.startsWith('https://') && !isLocalUrl(newUrl) && localNetworkChk) {
            localNetworkChk.checked = false;
        }

        // Clear and hide NIM diagnostic output
        const resultsDiv = document.getElementById('nim-diagnostic-results');
        if (resultsDiv) {
            resultsDiv.classList.add('d-none');
            resultsDiv.innerHTML = '';
        }

        // Suggestions
        const suggestions = {
            'anthropic': 'claude-sonnet-4-6',
            'openai': 'gpt-5',
            'gemini': 'gemini-2.5-flash',
            'mistral': 'mistral-large-latest',
            'openrouter': 'openrouter/auto',
            'nvidia_nim': 'nvidia/nemotron-3-super-120b-a12b',
            'ollama': 'llama3',
            'none': '',
            'custom': ''
        };

        if (suggestions[provider] !== undefined && modelInput) {
            modelInput.placeholder = suggestions[provider] || (provider === 'custom' ? '' : 'Selecciona un proveedor');
        }

        if (provider === 'ollama' || provider === 'custom' || provider === 'nvidia_nim') {
            if (baseUrlGroup) baseUrlGroup.style.display = 'block';
        } else {
            if (baseUrlGroup) baseUrlGroup.style.display = 'none';
        }

        const ollamaScanBtnGroup = document.getElementById('ollama-scan-btn-group');
        const ollamaDiscoveryGroup = document.getElementById('group-ollama-discovery');
        const ollamaModelsGroup = document.getElementById('group-ollama-models');
        const ollamaHelpBlock = document.getElementById('ollama-help-block');
        const nimHelpBlock = document.getElementById('nim-help-block');
        const discoverGroup = document.getElementById('group-discover-models');

        if (provider === 'ollama') {
            if (ollamaScanBtnGroup) ollamaScanBtnGroup.style.display = 'block';
            if (ollamaDiscoveryGroup) ollamaDiscoveryGroup.style.display = 'block';
            if (ollamaModelsGroup) ollamaModelsGroup.style.display = 'block';
            if (ollamaHelpBlock) ollamaHelpBlock.classList.remove('d-none');
            if (nimHelpBlock) nimHelpBlock.classList.add('d-none');
            if (discoverGroup) discoverGroup.style.display = 'block';
        } else if (provider === 'nvidia_nim') {
            if (ollamaScanBtnGroup) ollamaScanBtnGroup.style.display = 'none';
            if (ollamaDiscoveryGroup) ollamaDiscoveryGroup.style.display = 'none';
            if (ollamaModelsGroup) ollamaModelsGroup.style.display = 'none';
            if (ollamaHelpBlock) ollamaHelpBlock.classList.add('d-none');
            if (nimHelpBlock) nimHelpBlock.classList.remove('d-none');
            if (discoverGroup) discoverGroup.style.display = 'block';
        } else if (provider === 'custom' || provider === 'openrouter' || provider === 'openai' || provider === 'anthropic') {
            if (ollamaScanBtnGroup) ollamaScanBtnGroup.style.display = 'none';
            if (ollamaDiscoveryGroup) ollamaDiscoveryGroup.style.display = 'none';
            if (ollamaModelsGroup) ollamaModelsGroup.style.display = 'none';
            if (ollamaHelpBlock) ollamaHelpBlock.classList.add('d-none');
            if (nimHelpBlock) nimHelpBlock.classList.add('d-none');
            if (discoverGroup) discoverGroup.style.display = 'block';
        } else {
            if (ollamaScanBtnGroup) ollamaScanBtnGroup.style.display = 'none';
            if (ollamaDiscoveryGroup) ollamaDiscoveryGroup.style.display = 'none';
            if (ollamaModelsGroup) ollamaModelsGroup.style.display = 'none';
            if (ollamaHelpBlock) ollamaHelpBlock.classList.add('d-none');
            if (nimHelpBlock) nimHelpBlock.classList.add('d-none');
            if (discoverGroup) discoverGroup.style.display = 'none';
        }

        const anthropicTestGroup = document.getElementById('group-anthropic-test');
        if (anthropicTestGroup) anthropicTestGroup.style.display = provider === 'anthropic' ? 'block' : 'none';

        // If embeddings provider is "same_as_main", sync UI if needed
        this.handleEmbedProviderChange();

        this.previousProvider = provider;

        if (typeof window.updateThinkingToggleUI === 'function') {
            window.updateThinkingToggleUI();
        }
    }

    checkNIMDirectWarning() {
        const provider = document.getElementById('ai_provider')?.value;
        const baseUrl = document.getElementById('ai_base_url')?.value || '';
        const warningDiv = document.getElementById('nim-direct-warning');

        if (!warningDiv) return;

        if (provider === 'nvidia_nim' && baseUrl.includes('integrate.api.nvidia.com')) {
            warningDiv.classList.remove('d-none');
        } else {
            warningDiv.classList.add('d-none');
        }
    }

    handleEmbedProviderChange() {
        const embedProviderEl = document.getElementById('ai_embed_provider');
        if (!embedProviderEl) return;
        const embedProvider = embedProviderEl.value;
        const embedBaseUrlGroup = document.getElementById('group-embed-base-url');
        const embedApiKeyGroup = document.getElementById('group-embed-api-key');
        const embedBaseUrlInput = document.getElementById('ai_embed_base_url');

        if (embedProvider === 'same_as_main') {
            if (embedBaseUrlGroup) embedBaseUrlGroup.style.display = 'none';
            if (embedApiKeyGroup) embedApiKeyGroup.style.display = 'none';
        } else {
            if (embedBaseUrlGroup) embedBaseUrlGroup.style.display = 'block';
            if (embedApiKeyGroup) embedApiKeyGroup.style.display = 'block';

            // Autocomplete embedding Base URL if empty or matching previous default
            const prevDefault = PROVIDER_DEFAULTS[this.previousEmbeddingsProvider]?.embeddingsBaseUrl || '';
            const currentVal = embedBaseUrlInput ? embedBaseUrlInput.value.trim() : '';

            if (embedBaseUrlInput && (!currentVal || currentVal === prevDefault || (this.previousEmbeddingsProvider === 'nvidia_nim' && currentVal === 'https://integrate.api.nvidia.com/v1'))) {
                embedBaseUrlInput.value = PROVIDER_DEFAULTS[embedProvider]?.embeddingsBaseUrl || '';
            }
        }

        this.previousEmbeddingsProvider = embedProvider;
    }

    async startScan() {
        const input = document.getElementById('ollama-scan-range').value;
        const btn = document.getElementById('btn-scan-ollama');
        const status = document.getElementById('ollama-scan-status');
        const selectGroup = document.getElementById('group-ollama-endpoints');
        const select = document.getElementById('ollama-endpoints-select');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        status.style.display = 'block';
        status.textContent = 'Iniciando escaneo...';

        selectGroup.style.display = 'none';
        select.innerHTML = '';

        try {
            const discovered = await this.discovery.scan(input, (completed, total, current, found) => {
                status.textContent = `Escaneando: ${completed}/${total} (${current})${found ? ' - ¡ENCONTRADO!' : ''}`;
            });

            if (discovered.length > 0) {
                status.textContent = `Escaneo completado. Se encontraron ${discovered.length} instancias.`;
                selectGroup.style.display = 'block';

                discovered.forEach(endpoint => {
                    const opt = document.createElement('option');
                    opt.value = endpoint;
                    opt.textContent = endpoint;
                    select.appendChild(opt);
                });

                // Select first one by default if base_url is empty
                const baseUrlInput = document.getElementById('ai_base_url');
                if (!baseUrlInput.value) {
                    this.selectEndpoint(discovered[0]);
                }
            } else {
                status.textContent = 'No se encontró ninguna instancia de Ollama. Revisa tu red y configuración de OLLAMA_ORIGINS.';
            }
        } catch (e) {
            status.textContent = `Error: ${e.message}`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-search"></i> BUSCAR';
        }
    }

    selectEndpoint(endpoint) {
        document.getElementById('ai_base_url').value = endpoint;
        this.refreshModels();
    }

    async refreshModels() {
        const endpoint = document.getElementById('ai_base_url').value;
        const select = document.getElementById('ollama-models-select');
        const modelInput = document.getElementById('ai_model');

        if (!endpoint) {
            alert('Por favor, indica primero la Base URL de Ollama.');
            return;
        }

        select.innerHTML = '';
        const loadingOpt = document.createElement('option');
        loadingOpt.textContent = 'Cargando modelos...';
        select.appendChild(loadingOpt);

        try {
            const models = await this.discovery.fetchModels(endpoint);
            this.populateModelSelect(models);
            select.disabled = false;
        } catch (e) {
            const errorMsg = this.discovery.getErrorMessage(e, endpoint);
            console.warn('[Ollama] Failed to fetch models. Disabling dropdown and focusing manual input.', e);

            select.innerHTML = '';
            const noneOpt = document.createElement('option');
            noneOpt.textContent = 'No disponible (usa campo superior)';
            select.appendChild(noneOpt);
            select.disabled = true;

            modelInput.focus();

            if (errorMsg.includes('Mixed Content')) {
                if (window.authManager && window.authManager.showToast) {
                    window.authManager.showToast('Error de Conexión', errorMsg, 'error');
                } else {
                    alert(errorMsg);
                }
            }
        }
    }

    populateModelSelect(models, isFallback = false) {
        const select = document.getElementById('ollama-models-select');
        const modelInput = document.getElementById('ai_model');

        select.innerHTML = '';

        if (isFallback) {
            const header = document.createElement('option');
            header.disabled = true;
            header.textContent = '-- Lista Estática (Fallback) --';
            select.appendChild(header);
        }

        if (models.length > 0) {
            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.name;
                opt.textContent = m.name;
                select.appendChild(opt);
            });

            if (!modelInput.value) {
                modelInput.value = models[0].name;
                select.value = models[0].name;
            } else if (models.some(m => m.name === modelInput.value)) {
                select.value = modelInput.value;
            } else {
                const opt = document.createElement('option');
                opt.value = modelInput.value;
                opt.textContent = `${modelInput.value} (Actual)`;
                select.prepend(opt);
                select.value = modelInput.value;
            }
        } else {
            const noneOpt = document.createElement('option');
            noneOpt.textContent = 'No se encontraron modelos';
            select.appendChild(noneOpt);
        }
    }

    async discoverCustomModels() {
        const provider = document.getElementById('ai_provider').value;
        // Anthropic's URL is hidden in the modal: always use the native API endpoint.
        const baseUrl = provider === 'anthropic' ? PROVIDER_DEFAULTS.anthropic.baseUrl : document.getElementById('ai_base_url').value;
        const apiKey = document.getElementById('ai_api_key').value;
        const select = document.getElementById('custom-models-select');
        const group = document.getElementById('group-custom-models');

        if (!baseUrl) {
            alert('Por favor, indica la Base URL.');
            return;
        }

        group.style.display = 'block';
        select.innerHTML = '<option>Descubriendo modelos...</option>';

        try {
            const models = await discoverModels({ provider, baseUrl, apiKey });
            this.allDiscoveredModels = models;
            this.renderFilteredModels('chat');
            document.getElementById('group-model-type').style.display = 'block';

        } catch (e) {
            console.error('Model discovery failed:', e);
            select.innerHTML = `<option>Error: ${e.message || 'Fallo al cargar modelos'}</option>`;
        }
    }

    // Live smoke test: the exact key entered in API Config must discover models
    // AND generate a real non-streaming response before we show success.
    async verifyAnthropicConnection() {
        const provider = document.getElementById('ai_provider')?.value;
        if (provider !== 'anthropic') return;
        const key = document.getElementById('ai_api_key')?.value.trim() || '';
        const modelEl = document.getElementById('ai_model');
        const status = document.getElementById('anthropic-test-status');
        const button = document.getElementById('btn-test-anthropic');
        if (!status || !button) return;

        button.disabled = true;
        status.textContent = '1/2 · Validando API key y descubriendo modelos...';
        try {
            const models = await discoverModels({
                provider: 'anthropic',
                baseUrl: PROVIDER_DEFAULTS.anthropic.baseUrl,
                apiKey: key
            });
            if (!models.length) throw new Error('La clave ha respondido, pero no hay modelos disponibles.');
            const selected = models.find(m => m.id === modelEl.value.trim())
                || models.find(m => m.lifecycle === 'active')
                || models[0];
            modelEl.value = selected.id;
            status.textContent = `1/2 · ${models.length} modelos. 2/2 · Probando respuesta de ${selected.id}...`;

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`,
                    'anthropic-version': '2026-10-21'
                },
                body: JSON.stringify({
                    model: selected.id,
                    max_tokens: 32,
                    stream: false,
                    messages: [{ role: 'user', content: 'Responde exactamente OK.' }]
                })
            });
            if (!response.ok) {
                const reason = response.status === 401 ? 'API key inválida'
                    : response.status === 403 ? 'Sin permisos de acceso'
                    : response.status === 404 ? 'Modelo no disponible'
                    : response.status === 429 ? 'Límite de peticiones o cuota'
                    : 'Petición rechazada';
                throw new Error(`HTTP ${response.status}: ${reason}.`);
            }
            const result = await response.json();
            if (!Array.isArray(result.content) || !result.content.some(b => b.type === 'text' && b.text?.trim())) {
                throw new Error('Anthropic no devolvió texto en la prueba.');
            }
            status.textContent = `✓ API key operativa. ${models.length} modelos detectados y respuesta recibida de ${selected.id}. Guarda la configuración para usar Neural Chat.`;
        } catch (e) {
            const network = e instanceof TypeError || /Failed to fetch|NetworkError/i.test(e.message || '');
            status.textContent = network
                ? '✗ Sin respuesta HTTP (red/CORS). Las organizaciones con ZDR necesitan un proxy backend.'
                : `✗ ${String(e.message || 'Error de conexión').replaceAll(key || '\0', '[REDACTED]')}`;
        } finally {
            button.disabled = false;
        }
    }

    async discoverEmbeddingModels() {
        const embedProvider = document.getElementById('ai_embed_provider').value;
        let provider = embedProvider;
        let baseUrl = document.getElementById('ai_embed_base_url').value;
        let apiKey = document.getElementById('ai_embed_api_key').value;

        if (embedProvider === 'same_as_main') {
            provider = document.getElementById('ai_provider').value;
            baseUrl = document.getElementById('ai_base_url').value;
            apiKey = document.getElementById('ai_api_key').value;
        }

        const select = document.getElementById('embed-models-select');
        const group = document.getElementById('group-embed-discovered-models');

        if (!baseUrl && provider !== 'none') {
            alert('Por favor, indica la Base URL para el proveedor de embeddings.');
            return;
        }

        if (group) group.style.display = 'block';
        if (select) select.innerHTML = '<option>Descubriendo modelos de embedding...</option>';

        try {
            const models = await discoverModels({ provider, baseUrl, apiKey });
            // Filter to kind === 'embedding' or 'unknown'
            const filtered = models.filter(m => m.kind === 'embedding' || m.kind === 'unknown');

            if (select) {
                if (filtered.length > 0) {
                    select.innerHTML = filtered.map(m => `<option value="${m.id}">${m.id}</option>`).join('');
                    const embedInput = document.getElementById('ai_embedding_model');
                    if (embedInput && !embedInput.value) {
                        embedInput.value = filtered[0].id;
                    }
                } else {
                    select.innerHTML = '<option value="">No se encontraron modelos de embedding</option>';
                }
            }
        } catch (e) {
            console.error('Embedding discovery failed:', e);
            if (select) select.innerHTML = `<option>Error: ${e.message || 'Fallo al cargar modelos'}</option>`;
        }
    }

    async verifySelectedEmbedding() {
        const embedProvider = document.getElementById('ai_embed_provider').value;
        let provider = embedProvider;
        let baseUrl = document.getElementById('ai_embed_base_url').value;
        let apiKey = document.getElementById('ai_embed_api_key').value;
        const model = document.getElementById('ai_embedding_model').value.trim();

        if (embedProvider === 'same_as_main') {
            provider = document.getElementById('ai_provider').value;
            baseUrl = document.getElementById('ai_base_url').value;
            apiKey = document.getElementById('ai_api_key').value;
        }

        const btn = document.getElementById('btn-verify-embedding');
        const statusDiv = document.getElementById('embed-verification-status');

        if (!model) {
            alert('Por favor, introduce o selecciona un modelo de embedding.');
            return;
        }

        if (btn) btn.disabled = true;
        if (statusDiv) {
            statusDiv.classList.remove('d-none');
            statusDiv.innerHTML = '<span class="text-warning"><i class="fas fa-spinner fa-spin mr-1"></i> Verificando embedding...</span>';
        }

        try {
            const res = await testEmbeddingEndpoint({ provider, baseUrl, apiKey, model });
            if (statusDiv) {
                statusDiv.innerHTML = `<span class="text-success font-weight-bold"><i class="fas fa-check-circle mr-1"></i> Embedding OK - Dimensión: ${res.dimension}d</span>`;
            }
        } catch (e) {
            if (statusDiv) {
                statusDiv.innerHTML = `<span class="text-danger font-weight-bold"><i class="fas fa-times-circle mr-1"></i> Error: ${e.message}</span>`;
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    renderFilteredModels(type) {
        const select = document.getElementById('custom-models-select');
        const models = this.allDiscoveredModels || [];

        const filtered = models.filter(m => {
            if (type === 'all') return true;
            return (m.kind || this.detectModelType(m.id)) === type;
        }).sort((a, b) => a.id.localeCompare(b.id));

        select.replaceChildren();
        if (filtered.length === 0) {
            select.add(new Option('No hay modelos de este tipo', ''));
        } else {
            filtered.forEach(m => select.add(new Option(
                (m.label || m.id) + (m.lifecycle === 'deprecated' ? ' (deprecated)' : ''), m.id
            )));
            const current = document.getElementById('ai_model')?.value;
            const selected = filtered.find(m => m.id === current) || filtered.find(m => m.lifecycle !== 'deprecated') || filtered[0];
            select.value = selected.id;
            this.selectCustomModel(selected.id);
        }
    }

    detectModelType(modelId) {
        return classifyModel(modelId);
    }

    selectCustomModel(id) {
        if (!id) return;
        document.getElementById('ai_model').value = id;
        const type = this.detectModelType(id);
        this.setActiveTypeUI(type);
    }

    setActiveTypeUI(type) {
        const buttons = document.querySelectorAll('#model-type-selector button');
        buttons.forEach(btn => {
            if (btn.dataset.type === type) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        this.currentModelType = type;
    }

    saveAsProfile() {
        const nameInput = document.getElementById('ai_profile_name');
        const name = nameInput.value.trim();

        if (!name) {
            if (window.authManager && window.authManager.showToast) {
                window.authManager.showToast('Error', 'El nombre del perfil es obligatorio.', 'error');
            } else {
                alert('El nombre del perfil es obligatorio.');
            }
            nameInput.focus();
            return;
        }

        let profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
        const normalizedName = name.toLowerCase();

        const existingProfileId = Object.keys(profiles).find(id =>
            profiles[id].name && profiles[id].name.trim().toLowerCase() === normalizedName
        );

        if (existingProfileId) {
            const confirmOverwrite = confirm(`Ya existe un perfil con el nombre "${profiles[existingProfileId].name}". ¿Quieres sobrescribirlo?`);
            if (!confirmOverwrite) return;
        }

        const configId = existingProfileId || 'profile-' + Date.now();
        const userThinkingOverride = document.getElementById('ai_user_thinking_override')?.checked;

        const config = {
            id: configId,
            name: name,
            provider: document.getElementById('ai_provider').value,
            model: document.getElementById('ai_model').value,
            embedding_model: document.getElementById('ai_embedding_model').value,
            api_key: document.getElementById('ai_api_key').value,
            base_url: document.getElementById('ai_base_url').value,
            embed_provider: document.getElementById('ai_embed_provider')?.value || 'same_as_main',
            embed_base_url: document.getElementById('ai_embed_base_url')?.value || '',
            embed_api_key: document.getElementById('ai_embed_api_key')?.value || '',
            embed_model: document.getElementById('ai_embedding_model')?.value || '',
            modelType: this.currentModelType || 'chat',
            local_network: document.getElementById('ai_local_network').checked,
            user_thinking_override: userThinkingOverride
        };

        profiles[config.id] = config;
        localStorage.setItem('ai_profiles', JSON.stringify(profiles));

        localStorage.setItem('activeProfile', config.id);
        localStorage.setItem('hy_ai_config', JSON.stringify(config));

        if (typeof window.updateActiveProfileUI === 'function') {
            window.updateActiveProfileUI(config);
        }

        if (window.authManager && window.authManager.showToast) {
            window.authManager.showToast('Éxito', `Perfil "${name}" guardado.`, 'success');
        } else {
            alert(`Perfil "${name}" guardado.`);
        }

        if (typeof window.renderProfileManagerList === 'function') window.renderProfileManagerList();
        if (typeof window.renderProfileDropdown === 'function') window.renderProfileDropdown();
        if (typeof window.loadProfiles === 'function') window.loadProfiles();
    }

    async testNIMDirect() {
        const baseUrl = document.getElementById('ai_base_url').value.trim();
        const apiKey = document.getElementById('ai_api_key').value.trim();
        const selectedProvider = document.getElementById('ai_provider')?.value || 'nvidia_nim';
        const resultsDiv = document.getElementById('nim-diagnostic-results');
        const btn = document.getElementById('btn-test-nim');

        if (!baseUrl) {
            alert('Por favor, indica la Base URL de NVIDIA NIM.');
            return;
        }
        if (!apiKey) {
            alert('Por favor, indica tu NVIDIA API Key.');
            return;
        }

        resultsDiv.classList.remove('d-none');
        resultsDiv.innerHTML = '<div class="text-warning"><i class="fas fa-circle-notch fa-spin mr-1"></i> Ejecutando diagnóstico aislado...</div>';
        btn.disabled = true;

        const diagnosticModel = "nvidia/nemotron-3-super-120b-a12b";
        const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

        const payload = {
            model: diagnosticModel,
            messages: [
                { role: "user", content: "Responde solo: NIM OK" }
            ],
            temperature: 0.2,
            top_p: 0.95,
            max_tokens: 128,
            stream: false
        };

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };

        try {
            const startTime = Date.now();
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload),
                mode: 'cors',
                credentials: 'omit'
            });
            const duration = Date.now() - startTime;

            let detectedMode = "Custom compatible endpoint";
            if (selectedProvider === 'nvidia_nim' || baseUrl.includes('hypenosys-gatekeeper-v2.axlffcc.workers.dev')) {
                detectedMode = "NVIDIA NIM (vía Gatekeeper)";
            } else if (baseUrl.includes('integrate.api.nvidia.com')) {
                detectedMode = "Direct NVIDIA Cloud";
            }

            let resultHtml = `<div class="text-info mb-1 font-weight-bold">[NVIDIA NIM DIAGNOSTIC REPORT]</div>`;
            resultHtml += `<div>• Provider: ${selectedProvider}</div>`;
            resultHtml += `<div>• Detected Mode: <span class="text-accent2">${detectedMode}</span></div>`;
            resultHtml += `<div>• Endpoint: <span class="text-gray-400">${endpoint}</span></div>`;
            resultHtml += `<div>• Model: <span class="text-gray-400">${diagnosticModel}</span></div>`;
            resultHtml += `<div>• Stream: false</div>`;
            resultHtml += `<div>• HTTP Status Received: <span class="text-success">YES</span></div>`;
            resultHtml += `<div>• Status Code: <span class="text-warning">${response.status} ${response.statusText}</span></div>`;
            resultHtml += `<div>• Duration: ${duration}ms</div><br>`;

            if (response.ok) {
                const data = await response.json();
                const content = data.choices?.[0]?.message?.content || JSON.stringify(data);
                resultHtml += `<div class="text-success font-weight-bold">SUCCESS: NVIDIA NIM direct test succeeded.</div>`;
                resultHtml += `<div class="mt-1 text-gray-400" style="border-left: 2px solid #28a745; padding-left: 5px;">Response: "${content}"</div>`;
            } else {
                const errorText = await response.text().catch(() => "No error body");
                resultHtml += `<div class="text-danger font-weight-bold">FAILURE: Request reached server but returned an error.</div>`;

                let classification = "";
                switch(response.status) {
                    case 401: classification = "API key missing or invalid."; break;
                    case 403: classification = "Forbidden or entitlement issue for this NVIDIA account/model."; break;
                    case 404:
                        classification = baseUrl.includes('workers.dev') ?
                            "Ruta no soportada por el Gatekeeper." :
                            "Model or endpoint not found. Check the model ID.";
                        break;
                    case 410: classification = "This NVIDIA NIM model is no longer available or has reached end-of-life (EOL)."; break;
                    case 429: classification = "Rate limit or quota exceeded."; break;
                    case 500:
                    case 502:
                    case 503: classification = "Relay or upstream server error."; break;
                    default: classification = `Unhandled error (${response.status}).`;
                }
                resultHtml += `<div class="text-warning mt-1 font-weight-bold">${classification}</div>`;
                resultHtml += `<div class="text-gray-500 mt-1" style="font-size: 9px; overflow-wrap: break-word; background: #111; padding: 4px; border-radius: 2px;">Raw error: ${errorText.substring(0, 300)}</div>`;
            }

            resultsDiv.innerHTML = resultHtml;

        } catch (e) {
            let detectedMode = "Custom compatible endpoint";
            if (selectedProvider === 'nvidia_nim' || baseUrl.includes('hypenosys-gatekeeper-v2.axlffcc.workers.dev')) {
                detectedMode = "NVIDIA NIM (vía Gatekeeper)";
            } else if (baseUrl.includes('integrate.api.nvidia.com')) {
                detectedMode = "Direct NVIDIA Cloud";
            }

            let resultHtml = `<div class="text-info mb-1 font-weight-bold">[NVIDIA NIM DIAGNOSTIC REPORT]</div>`;
            resultHtml += `<div>• Provider: ${selectedProvider}</div>`;
            resultHtml += `<div>• Detected Mode: <span class="text-accent2">${detectedMode}</span></div>`;
            resultHtml += `<div>• Endpoint: <span class="text-gray-400">${endpoint}</span></div>`;
            resultHtml += `<div>• HTTP Status Received: <span class="text-danger">NO</span></div>`;
            resultHtml += `<div class="text-danger font-weight-bold mt-2">FAILURE: Browser fetch failed before reaching the server.</div>`;

            let classification = "";
            if (detectedMode === "Direct NVIDIA Cloud") {
                classification = "This is likely a CORS/preflight block from GitHub Pages. NVIDIA direct API does not allow browser requests. Use the Gatekeeper Relay for stable usage.";
            } else if (detectedMode === "NVIDIA NIM (vía Gatekeeper)") {
                classification = "Relay endpoint could not be reached. Check network connection or Worker status.";
            } else {
                classification = "Possible causes: CORS/preflight block, mixed content (HTTP on HTTPS), or endpoint offline.";
            }

            if (baseUrl.startsWith('http://') && window.location.protocol === 'https:') {
                classification += "<br><span class='text-danger'>• Mixed Content detected: requesting HTTP from an HTTPS page. Use HTTPS for the endpoint.</span>";
            }
            if (isLocalUrl(baseUrl)) {
                classification += "<br>• Endpoint appears to be a local or private IP. Check VPN/Network connectivity.";
            }

            resultHtml += `<div class="text-warning mt-1" style="font-size: 10px;">${classification}</div>`;

            let safeErrorMessage = e.message || "Unknown error";
            if (apiKey) {
                const escapedKey = apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                safeErrorMessage = safeErrorMessage.replace(new RegExp(escapedKey, 'g'), 'nvapi-***REDACTED***');
            }
            resultHtml += `<div class="text-gray-500 mt-2" style="font-size: 9px;">Error details: ${safeErrorMessage}</div>`;

            resultsDiv.innerHTML = resultHtml;
        } finally {
            btn.disabled = false;
        }
    }
}

if (typeof window !== 'undefined') {
    window.ollamaUI = new OllamaUI();
}

if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        if (e.target.closest('#model-type-selector button')) {
            const btn = e.target.closest('#model-type-selector button');
            if (window.ollamaUI) {
                window.ollamaUI.setActiveTypeUI(btn.dataset.type);
                window.ollamaUI.renderFilteredModels(btn.dataset.type);
            }
        }
    });

    document.addEventListener('input', (e) => {
        if (e.target && e.target.id === 'ai_base_url') {
            if (window.ollamaUI) {
                window.ollamaUI.checkNIMDirectWarning();
            }
        }
    });
}
