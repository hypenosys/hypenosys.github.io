/**
 * Ollama UI Management Module
 */

class OllamaUI {
    constructor() {
        // We'll check for window.ollamaDiscovery at runtime
    }

    get discovery() {
        if (!window.ollamaDiscovery) {
            console.error('[OllamaUI] window.ollamaDiscovery is undefined');
            return null;
        }
        return window.ollamaDiscovery;
    }

    /**
     * "BUSCAR EN RANGO" logic: uses ollama-scan-range
     */
    async startScan() {
        if (!this.discovery) {
            this.showError('Módulo Ollama no cargado. Recarga la página o revisa la carga de scripts.');
            return;
        }

        const input = document.getElementById('ollama-scan-range').value;
        const btn = document.getElementById('btn-scan-ollama-range');
        const status = document.getElementById('ollama-scan-status');
        const selectGroup = document.getElementById('group-ollama-endpoints');
        const select = document.getElementById('ollama-endpoints-select');

        if (!btn) return;

        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

        if (status) {
            status.style.display = 'block';
            status.textContent = 'Iniciando escaneo de red...';
        }

        if (selectGroup) selectGroup.style.display = 'none';
        if (select) select.innerHTML = '';

        try {
            const discovered = await this.discovery.scan(input, (completed, total, current, found) => {
                if (status) {
                    status.textContent = `Escaneando: ${completed}/${total} (${current})${found ? ' - ¡ENCONTRADO!' : ''}`;
                }
            });

            if (discovered.length > 0) {
                if (status) status.textContent = `Escaneo completado. Se encontraron ${discovered.length} instancias.`;
                if (selectGroup) selectGroup.style.display = 'block';

                if (select) {
                    discovered.forEach(endpoint => {
                        const opt = document.createElement('option');
                        opt.value = endpoint;
                        opt.textContent = endpoint;
                        select.appendChild(opt);
                    });
                }

                // If only one is found, or base_url is empty, select it automatically
                const baseUrlInput = document.getElementById('ai_base_url');
                if (baseUrlInput && (discovered.length === 1 || !baseUrlInput.value)) {
                    this.selectEndpoint(discovered[0]);
                }

                this.showSuccess(`Se encontraron ${discovered.length} instancias de Ollama.`);
            } else {
                if (status) status.textContent = 'No se encontró ninguna instancia de Ollama. Revisa tu red y configuración de OLLAMA_ORIGINS.';
                this.showError('No se encontró ninguna instancia de Ollama.');
            }
        } catch (e) {
            const msg = `Error en escaneo: ${e.message}`;
            if (status) status.textContent = msg;
            this.showError(msg);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-search"></i> BUSCAR EN RANGO';
        }
    }

    selectEndpoint(endpoint) {
        const baseUrlInput = document.getElementById('ai_base_url');
        if (baseUrlInput) {
            baseUrlInput.value = endpoint;
            // When selecting an endpoint from discovery, automatically load its models
            this.refreshModels();
        }
    }

    /**
     * "CARGAR MODELOS" logic: uses ai_base_url directly
     */
    async refreshModels() {
        if (!this.discovery) {
            this.showError('Módulo Ollama no cargado. Recarga la página o revisa la carga de scripts.');
            return;
        }

        let endpoint = document.getElementById('ai_base_url').value.trim();
        const select = document.getElementById('ollama-models-select');
        const modelInput = document.getElementById('ai_model');
        const btn = document.getElementById('btn-load-ollama-models');
        const status = document.getElementById('ollama-scan-status');

        if (!endpoint) {
            this.showError('Por favor, indica primero la Base URL de Ollama.');
            return;
        }

        // Normalize endpoint
        if (!endpoint.startsWith('http')) {
            endpoint = `http://${endpoint}`;
        }
        if (!endpoint.includes(':', 6)) {
            endpoint = `${endpoint}:11434`;
        }

        const originalBtnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        }

        if (select) {
            select.innerHTML = '';
            const loadingOpt = document.createElement('option');
            loadingOpt.textContent = 'Cargando modelos...';
            select.appendChild(loadingOpt);
        }

        if (status) {
            status.style.display = 'block';
            status.textContent = `Probando conexión con ${endpoint}/api/tags ...`;
        }

        try {
            const models = await this.discovery.fetchModels(endpoint);
            if (select) select.innerHTML = '';

            if (models.length > 0) {
                if (select) {
                    models.forEach(m => {
                        const opt = document.createElement('option');
                        opt.value = m.name;
                        opt.textContent = m.name;
                        select.appendChild(opt);
                    });

                    // If model input is empty, pick the first one
                    if (modelInput && !modelInput.value) {
                        modelInput.value = models[0].name;
                        select.value = models[0].name;
                    } else if (modelInput && models.some(m => m.name === modelInput.value)) {
                        select.value = modelInput.value;
                    } else if (modelInput) {
                        const opt = document.createElement('option');
                        opt.value = modelInput.value;
                        opt.textContent = `${modelInput.value} (Actual)`;
                        select.prepend(opt);
                        select.value = modelInput.value;
                    }
                }

                if (status) status.textContent = `Modelos cargados exitosamente desde ${endpoint}`;
                this.showSuccess(`Modelos cargados correctamente desde ${endpoint}`);
            } else {
                if (select) {
                    const noneOpt = document.createElement('option');
                    noneOpt.textContent = 'No se encontraron modelos';
                    select.appendChild(noneOpt);
                }
                if (status) status.textContent = `No se detectaron modelos en ${endpoint}`;
                this.showError(`No se encontraron modelos en ${endpoint}/api/tags`);
            }
        } catch (e) {
            const fullEndpoint = `${endpoint}/api/tags`;
            const errorMsg = this.discovery.getErrorMessage(e, endpoint);

            if (select) {
                select.innerHTML = '';
                const errorOpt = document.createElement('option');
                errorOpt.textContent = 'Error de conexión';
                select.appendChild(errorOpt);
            }

            const detailedError = `No se pudo conectar con ${fullEndpoint}. ${errorMsg}`;
            if (status) status.textContent = detailedError;
            this.showError(detailedError);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt"></i> CARGAR MODELOS';
            }
        }
    }

    showError(msg) {
        if (window.hypeToast) {
            window.hypeToast(msg, 'error');
        } else if (window.authManager && typeof window.authManager.showToast === 'function') {
            window.authManager.showToast('Error Ollama', msg, 'error');
        } else {
            console.error('[OllamaUI] ' + msg);
        }
    }

    showSuccess(msg) {
        if (window.hypeToast) {
            window.hypeToast(msg, 'success');
        } else if (window.authManager && typeof window.authManager.showToast === 'function') {
            window.authManager.showToast('Éxito Ollama', msg, 'success');
        }
    }
}

// Instantiate globally
window.ollamaUI = new OllamaUI();
