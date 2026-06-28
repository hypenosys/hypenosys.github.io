/**
 * Ollama UI Management Module
 */

class OllamaUI {
    constructor() {
        this.discovery = window.ollamaDiscovery;
    }

    handleProviderChange() {
        const provider = document.getElementById('ai_provider').value;
        const modelInput = document.getElementById('ai_model');
        const baseUrlGroup = document.getElementById('group-base-url');
        const baseUrlInput = document.getElementById('ai_base_url');

        // Ollama UI groups
        const ollamaScanBtnGroup = document.getElementById('ollama-scan-btn-group');
        const ollamaDiscoveryGroup = document.getElementById('group-ollama-discovery');
        const ollamaModelsGroup = document.getElementById('group-ollama-models');

        const suggestions = {
            'anthropic': 'claude-sonnet-4-6-20260217',
            'openai': 'gpt-5',
            'gemini': 'gemini-2.5-flash',
            'mistral': 'mistral-large-latest',
            'openrouter': 'openrouter/auto',
            'ollama': 'llama3',
            'none': '',
            'custom': ''
        };

        if (suggestions[provider] !== undefined) {
            modelInput.placeholder = suggestions[provider] || (provider === 'custom' ? '' : 'Selecciona un proveedor');
        }

        if (provider === 'ollama' || provider === 'custom') {
            baseUrlGroup.style.display = 'block';
            if (!baseUrlInput.value && provider === 'ollama') {
                baseUrlInput.value = 'http://localhost:11434/v1';
            }
        } else {
            baseUrlGroup.style.display = 'none';
        }

        const ollamaHelpBlock = document.getElementById('ollama-help-block');
        const discoverGroup = document.getElementById('group-discover-models');

        if (provider === 'ollama') {
            ollamaScanBtnGroup.style.display = 'block';
            ollamaDiscoveryGroup.style.display = 'block';
            ollamaModelsGroup.style.display = 'block';
            if (ollamaHelpBlock) ollamaHelpBlock.classList.remove('d-none');
            if (discoverGroup) discoverGroup.style.display = 'block';
        } else if (provider === 'custom' || provider === 'openrouter' || provider === 'openai') {
            ollamaScanBtnGroup.style.display = 'none';
            ollamaDiscoveryGroup.style.display = 'none';
            ollamaModelsGroup.style.display = 'none';
            if (ollamaHelpBlock) ollamaHelpBlock.classList.add('d-none');
            if (discoverGroup) discoverGroup.style.display = 'block';
        } else {
            ollamaScanBtnGroup.style.display = 'none';
            ollamaDiscoveryGroup.style.display = 'none';
            ollamaModelsGroup.style.display = 'none';
            if (ollamaHelpBlock) ollamaHelpBlock.classList.add('d-none');
            if (discoverGroup) discoverGroup.style.display = 'none';
        }
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

            // Focus the manual model input
            modelInput.focus();

            // If it was a mixed content error, show the detailed alert
            if (errorMsg.includes('Mixed Content')) {
                // Check if we should use hypeToast or standard alert
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

            // If model input is empty, pick the first one
            if (!modelInput.value) {
                modelInput.value = models[0].name;
                select.value = models[0].name;
            } else if (models.some(m => m.name === modelInput.value)) {
                select.value = modelInput.value;
            } else {
                // Current model not in list, add it as an option but keep it selected
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
        const baseUrl = document.getElementById('ai_base_url').value;
        const apiKey = document.getElementById('ai_api_key').value;
        const select = document.getElementById('custom-models-select');
        const group = document.getElementById('group-custom-models');
        const provider = document.getElementById('ai_provider').value;

        if (!baseUrl) {
            alert('Por favor, indica la Base URL.');
            return;
        }

        group.style.display = 'block';
        select.innerHTML = '<option>Descubriendo modelos...</option>';

        try {
            let models = [];
            if (provider === 'ollama') {
                // Ollama native
                const res = await fetch(`${baseUrl.replace(/\/v1$/, '')}/api/tags`);
                const data = await res.json();
                models = data.models.map(m => ({ id: m.name }));
            } else {
                // Standard OpenAI /models
                const res = await fetch(`${baseUrl}/models`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                const data = await res.json();
                models = data.data || [];
            }

            this.allDiscoveredModels = models;
            this.renderFilteredModels('chat');
            document.getElementById('group-model-type').style.display = 'block';

        } catch (e) {
            console.error('Model discovery failed:', e);
            select.innerHTML = '<option>Error al cargar modelos</option>';
        }
    }

    renderFilteredModels(type) {
        const select = document.getElementById('custom-models-select');
        const models = this.allDiscoveredModels || [];

        const filtered = models.filter(m => {
            if (type === 'all') return true;
            return this.detectModelType(m.id) === type;
        }).sort((a, b) => a.id.localeCompare(b.id));

        select.innerHTML = filtered.map(m => `<option value="${m.id}">${m.id}</option>`).join('');
        if (filtered.length === 0) {
            select.innerHTML = '<option value="">No hay modelos de este tipo</option>';
        } else {
            this.selectCustomModel(filtered[0].id);
        }
    }

    detectModelType(modelId) {
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
        const name = document.getElementById('ai_profile_name').value.trim();
        if (!name) {
            alert('Indica un nombre para el perfil.');
            return;
        }

        const config = {
            id: 'profile-' + Date.now(),
            name: name,
            provider: document.getElementById('ai_provider').value,
            model: document.getElementById('ai_model').value,
            api_key: document.getElementById('ai_api_key').value,
            base_url: document.getElementById('ai_base_url').value,
            modelType: this.currentModelType || 'chat'
        };

        let profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
        profiles[config.id] = config;
        localStorage.setItem('ai_profiles', JSON.stringify(profiles));

        if (window.authManager && window.authManager.showToast) {
            window.authManager.showToast('Éxito', `Perfil "${name}" guardado.`, 'success');
        } else {
            alert(`Perfil "${name}" guardado.`);
        }

        // Refresh dropdown in chat if exists
        if (typeof window.loadProfiles === 'function') window.loadProfiles();
    }
}

window.ollamaUI = new OllamaUI();

// Event listeners for model type selector
document.addEventListener('click', (e) => {
    if (e.target.closest('#model-type-selector button')) {
        const btn = e.target.closest('#model-type-selector button');
        window.ollamaUI.setActiveTypeUI(btn.dataset.type);
        window.ollamaUI.renderFilteredModels(btn.dataset.type);
    }
});
