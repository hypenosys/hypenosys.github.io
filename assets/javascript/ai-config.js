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
            'nvidia_nim': 'nvidia/nemotron-3-super-120b-a12b',
            'ollama': 'llama3',
            'none': '',
            'custom': ''
        };

        if (suggestions[provider] !== undefined) {
            modelInput.placeholder = suggestions[provider] || (provider === 'custom' ? '' : 'Selecciona un proveedor');
        }

        if (provider === 'ollama' || provider === 'custom' || provider === 'nvidia_nim') {
            baseUrlGroup.style.display = 'block';
            if (!baseUrlInput.value) {
                if (provider === 'ollama') baseUrlInput.value = 'http://localhost:11434/v1';
                if (provider === 'nvidia_nim') baseUrlInput.value = 'https://integrate.api.nvidia.com/v1';
            }
        } else {
            baseUrlGroup.style.display = 'none';
        }

        const ollamaHelpBlock = document.getElementById('ollama-help-block');
        const nimHelpBlock = document.getElementById('nim-help-block');
        const discoverGroup = document.getElementById('group-discover-models');

        if (provider === 'ollama') {
            ollamaScanBtnGroup.style.display = 'block';
            ollamaDiscoveryGroup.style.display = 'block';
            ollamaModelsGroup.style.display = 'block';
            if (ollamaHelpBlock) ollamaHelpBlock.classList.remove('d-none');
            if (nimHelpBlock) nimHelpBlock.classList.add('d-none');
            if (discoverGroup) discoverGroup.style.display = 'block';
        } else if (provider === 'nvidia_nim') {
            ollamaScanBtnGroup.style.display = 'none';
            ollamaDiscoveryGroup.style.display = 'none';
            ollamaModelsGroup.style.display = 'none';
            if (ollamaHelpBlock) ollamaHelpBlock.classList.add('d-none');
            if (nimHelpBlock) nimHelpBlock.classList.remove('d-none');
            if (discoverGroup) discoverGroup.style.display = 'block';
        } else if (provider === 'custom' || provider === 'openrouter' || provider === 'openai') {
            ollamaScanBtnGroup.style.display = 'none';
            ollamaDiscoveryGroup.style.display = 'none';
            ollamaModelsGroup.style.display = 'none';
            if (ollamaHelpBlock) ollamaHelpBlock.classList.add('d-none');
            if (nimHelpBlock) nimHelpBlock.classList.add('d-none');
            if (discoverGroup) discoverGroup.style.display = 'block';
        } else {
            ollamaScanBtnGroup.style.display = 'none';
            ollamaDiscoveryGroup.style.display = 'none';
            ollamaModelsGroup.style.display = 'none';
            if (ollamaHelpBlock) ollamaHelpBlock.classList.add('d-none');
            if (nimHelpBlock) nimHelpBlock.classList.add('d-none');
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
            } else if (provider === 'nvidia_nim') {
                // Try live discovery for NIM
                try {
                    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
                        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
                    });
                    if (res.ok) {
                        const data = await res.json();
                        models = data.data || [];
                    } else {
                        const errText = await res.text().catch(() => "Unknown error");
                        throw new Error(`NIM API error ${res.status}: ${errText}`);
                    }
                } catch (nimErr) {
                    console.warn('[NIM] Live discovery failed, using static catalog:', nimErr.message);

                    // Show a toast if possible to inform the user why fallback occurred
                    if (window.authManager && window.authManager.showToast) {
                        window.authManager.showToast('NIM Discovery', 'Usando catálogo estático (Fallo en endpoint/CORS)', 'info');
                    }

                    // Use static catalog from neural-chat-catalogs.js
                    if (window.NVIDIA_NIM_CATALOG) {
                        const catalog = window.NVIDIA_NIM_CATALOG;
                        models = [
                            ...catalog.chat,
                            ...catalog.vision,
                            ...catalog.speech,
                            ...catalog.embeddings
                        ];
                    }
                }
            } else {
                // Standard OpenAI /models
                const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
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

        // Find if a profile with the same name already exists
        const existingProfileId = Object.keys(profiles).find(id =>
            profiles[id].name && profiles[id].name.trim().toLowerCase() === normalizedName
        );

        if (existingProfileId) {
            const confirmOverwrite = confirm(`Ya existe un perfil con el nombre "${profiles[existingProfileId].name}". ¿Quieres sobrescribirlo?`);
            if (!confirmOverwrite) return;
        }

        const configId = existingProfileId || 'profile-' + Date.now();
        const config = {
            id: configId,
            name: name,
            provider: document.getElementById('ai_provider').value,
            model: document.getElementById('ai_model').value,
            api_key: document.getElementById('ai_api_key').value,
            base_url: document.getElementById('ai_base_url').value,
            modelType: this.currentModelType || 'chat',
            local_network: document.getElementById('ai_local_network').checked
        };

        profiles[config.id] = config;
        localStorage.setItem('ai_profiles', JSON.stringify(profiles));

        // Set as active profile immediately
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

        // Refresh dropdowns and lists everywhere
        if (typeof window.renderProfileManagerList === 'function') window.renderProfileManagerList();
        if (typeof window.renderProfileDropdown === 'function') window.renderProfileDropdown();
        if (typeof window.loadProfiles === 'function') window.loadProfiles();
    }

    async testNIMDirect() {
        const baseUrl = document.getElementById('ai_base_url').value.trim();
        const apiKey = document.getElementById('ai_api_key').value.trim();
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
            if (baseUrl.includes('integrate.api.nvidia.com')) detectedMode = "Direct NVIDIA Cloud";
            else if (baseUrl.includes('hypenosys-gatekeeper-v2.axlffcc.workers.dev')) detectedMode = "Hypenosys Gatekeeper Relay";

            let resultHtml = `<div class="text-info mb-1 font-weight-bold">[NVIDIA NIM DIAGNOSTIC REPORT]</div>`;
            resultHtml += `<div>• Provider: nvidia_nim</div>`;
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
                resultHtml += `<div class="text-danger font-weight-bold">FAILURE: Request reached NVIDIA but returned an error.</div>`;

                let classification = "";
                switch(response.status) {
                    case 401: classification = "API key missing or invalid."; break;
                    case 403: classification = "Forbidden or entitlement issue for this NVIDIA account/model."; break;
                    case 404: classification = "Model not found. Check the model ID."; break;
                    case 410: classification = "This NVIDIA NIM model is no longer available or has reached end-of-life (EOL)."; break;
                    case 429: classification = "Rate limit or quota exceeded."; break;
                    case 500:
                    case 502:
                    case 503: classification = "NVIDIA upstream server error."; break;
                    default: classification = `Unhandled error (${response.status}).`;
                }
                resultHtml += `<div class="text-warning mt-1 font-weight-bold">${classification}</div>`;
                resultHtml += `<div class="text-gray-500 mt-1" style="font-size: 9px; overflow-wrap: break-word; background: #111; padding: 4px; border-radius: 2px;">Raw error: ${errorText.substring(0, 300)}</div>`;
            }

            resultsDiv.innerHTML = resultHtml;

        } catch (e) {
            let detectedMode = "Custom compatible endpoint";
            if (baseUrl.includes('integrate.api.nvidia.com')) detectedMode = "Direct NVIDIA Cloud";
            else if (baseUrl.includes('hypenosys-gatekeeper-v2.axlffcc.workers.dev')) detectedMode = "Hypenosys Gatekeeper Relay";

            let resultHtml = `<div class="text-info mb-1 font-weight-bold">[NVIDIA NIM DIAGNOSTIC REPORT]</div>`;
            resultHtml += `<div>• Provider: nvidia_nim</div>`;
            resultHtml += `<div>• Detected Mode: <span class="text-accent2">${detectedMode}</span></div>`;
            resultHtml += `<div>• Endpoint: <span class="text-gray-400">${endpoint}</span></div>`;
            resultHtml += `<div>• HTTP Status Received: <span class="text-danger">NO</span></div>`;
            resultHtml += `<div class="text-danger font-weight-bold mt-2">FAILURE: Browser fetch failed before reaching the server.</div>`;

            let classification = "";
            if (detectedMode === "Direct NVIDIA Cloud") {
                classification = "This is likely a CORS/preflight block from GitHub Pages. NVIDIA direct API often blocks browser requests. Use the Hypenosys Gatekeeper Relay for stable usage.";
            } else if (detectedMode === "Hypenosys Gatekeeper Relay") {
                classification = "Relay endpoint could not be reached. Check the relay Base URL, CORS configuration, or Worker availability.";
            } else {
                classification = "Possible causes: CORS/preflight block, mixed content (HTTP on HTTPS), or the endpoint is offline.";
            }

            // Provider-aware checks for common failures
            if (baseUrl.startsWith('http://') && window.location.protocol === 'https:') {
                classification += "<br><span class='text-danger'>• Mixed Content detected: requesting HTTP from an HTTPS page. Use HTTPS for the endpoint.</span>";
            }
            if (/(^127\.)|(^192\.168\.)|(^10\.)|(^172\.(1[6-9]|2[0-9]|3[0-1])\.)|(^localhost)/.test(baseUrl.replace(/^https?:\/\//, ''))) {
                classification += "<br>• Endpoint appears to be a local or private IP. Check VPN/Network connectivity.";
            }

            resultHtml += `<div class="text-warning mt-1" style="font-size: 10px;">${classification}</div>`;

            // Sanitize error message to prevent API key leakage
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

window.ollamaUI = new OllamaUI();

// Event listeners for model type selector
document.addEventListener('click', (e) => {
    if (e.target.closest('#model-type-selector button')) {
        const btn = e.target.closest('#model-type-selector button');
        window.ollamaUI.setActiveTypeUI(btn.dataset.type);
        window.ollamaUI.renderFilteredModels(btn.dataset.type);
    }
});
