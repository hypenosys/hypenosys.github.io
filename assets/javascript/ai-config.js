/**
 * Ollama UI Management Module
 */

class OllamaUI {
    constructor() {
        this.discovery = window.ollamaDiscovery;
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
        } catch (e) {
            const errorMsg = this.discovery.getErrorMessage(e, endpoint);
            console.warn('[Ollama] Failed to fetch models, using static fallback.', e);

            // Fallback static list
            const fallbackModels = [
                { name: 'cogito:8b' },
                { name: 'qwen2.5:14b' },
                { name: 'phi4:latest' },
                { name: 'gemma4:e4b' },
                { name: 'qwen3:14b' },
                { name: 'llava:13b' },
                { name: 'nomic-embed-text:latest' },
                { name: 'qwen3:8b' }
            ];

            this.populateModelSelect(fallbackModels, true);

            // If it was a mixed content error, show the detailed alert
            if (errorMsg.includes('Mixed Content')) {
                alert(errorMsg);
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
}

window.ollamaUI = new OllamaUI();
