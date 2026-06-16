/**
 * NeuralSessionPanel - Manages the interaction between Kanban tasks, Claude, and Jules.
 * Handles the sidebar drawer for refined prompt engineering and session monitoring.
 */
class NeuralSessionPanel {
    constructor() {
        this.activeTask = null;
        this.activeSessionId = null;
        this.pollInterval = null;
        this.mode = 'claude'; // 'claude' or 'jules'

        // Cache DOM elements
        this.elements = {
            drawer: document.getElementById('neural-drawer'),
            overlay: document.getElementById('neural-drawer-overlay'),
            title: document.getElementById('nd-task-title'),
            repo: document.getElementById('nd-task-repo'),
            branch: document.getElementById('nd-task-branch'),
            hours: document.getElementById('nd-task-hours'),
            promptArea: document.getElementById('nd-prompt-area'),
            logArea: document.getElementById('nd-log-area'),
            chatInput: document.getElementById('nd-chat-input'),
            modeIndicator: document.getElementById('nd-mode-indicator'),
            btnRefine: document.getElementById('nd-refine-btn'),
            btnSendJules: document.getElementById('nd-send-jules-btn'),
            pollingStatus: document.getElementById('nd-polling-status')
        };
    }

    init() {
        this._setupAutoResize();
        this._setupKeyboardShortcuts();
    }

    /**
     * Opens the drawer with the provided task context
     */
    open(task) {
        if (!window.githubApi?.getAuthToken()) {
            console.warn('[NEURAL] Auth not ready, cannot open session');
            this._showToast('Autenticación requerida para iniciar sesión neural', 'error');
            return;
        }

        if (!task) {
            console.error('[NEURAL] No task provided to open');
            return;
        }

        this.activeTask = task;

        // Update UI
        if (this.elements.title) this.elements.title.textContent = task.titulo || task.title || `#${task.id}`;
        if (this.elements.repo) this.elements.repo.textContent = (task.repositorio || task.repo || 'hypenosys/web').split('/').pop();
        if (this.elements.branch) this.elements.branch.textContent = task.rama || task.branch || 'master';
        if (this.elements.hours) this.elements.hours.textContent = task.estimated_hours ? `${task.estimated_hours}h` : '---';

        // Pre-populate suggested prompt
        this._generateSuggestedPrompt(task);

        // Open Drawer
        this.elements.drawer?.classList.add('open');
        this.elements.overlay?.classList.add('open');

        // Check for existing Jules session and start polling if it exists
        const sessionId = task.jules_session?.session_id || (task.jules_loop_estado ? task.id : null);
        if (sessionId) {
            this.activeSessionId = sessionId;
            this.startPolling();
        } else {
            this.stopPolling();
            if (this.elements.logArea) this.elements.logArea.innerHTML = '<div class="opacity-30 italic">Sin actividad detectada</div>';
        }
    }

    close() {
        this.elements.drawer?.classList.remove('open');
        this.elements.overlay?.classList.remove('open');
        this.stopPolling();
    }

    setMode(mode) {
        this.mode = mode;
        const btnClaude = document.getElementById('mode-claude');
        const btnJules = document.getElementById('mode-jules');

        if (mode === 'claude') {
            btnClaude?.classList.add('bg-[#bd93f9]', 'text-[#282a36]');
            btnClaude?.classList.remove('text-slate-500');
            btnJules?.classList.remove('bg-[#bd93f9]', 'text-[#282a36]');
            btnJules?.classList.add('text-slate-500');
            if (this.elements.modeIndicator) this.elements.modeIndicator.textContent = 'Claude Response Mode';
            if (this.elements.chatInput) this.elements.chatInput.placeholder = 'Pregunta a Claude sobre esta tarea...';
        } else {
            btnJules?.classList.add('bg-[#bd93f9]', 'text-[#282a36]');
            btnJules?.classList.remove('text-slate-500');
            btnClaude?.classList.remove('bg-[#bd93f9]', 'text-[#282a36]');
            btnClaude?.classList.add('text-slate-500');
            if (this.elements.modeIndicator) this.elements.modeIndicator.textContent = 'Jules Direct Execution Mode';
            if (this.elements.chatInput) this.elements.chatInput.placeholder = 'Orden directa para Jules (ej: Corrige el estilo...)';
        }
    }

    async refineWithClaude() {
        const config = this._getAIConfig();
        if (!config || !config.api_key) {
            this._showToast('Configura la API de Anthropic en API Config para refinar.', 'warn');
            return;
        }

        const prompt = this.elements.promptArea?.value.trim();
        if (!prompt) return;

        this._setLoading(this.elements.btnRefine, true);

        try {
            const systemPrompt = "Eres un experto ingeniero de prompts para Jules, un agente autónomo de codificación. Tu objetivo es mejorar y detallar el prompt del usuario para que Jules sea más efectivo.";
            const userMsg = `Mejora este prompt para Jules, asegurándote de que sea técnico y preciso:\n\n${prompt}`;

            const response = await this._callAIProvider(config, [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMsg }
            ]);

            if (this.elements.promptArea) {
                this.elements.promptArea.value = response;
            }
            this._showToast('Prompt refinado con Claude', 'success');
        } catch (e) {
            console.error('[NEURAL] Refine failed:', e);
            this._showToast('Error al refinar prompt', 'error');
        } finally {
            this._setLoading(this.elements.btnRefine, false);
        }
    }

    async sendToJules() {
        const prompt = this.elements.promptArea?.value.trim();
        if (!prompt) {
            this._showToast('El prompt no puede estar vacío', 'error');
            return;
        }

        const repo = this.activeTask.repositorio || this.activeTask.repo || this.activeTask.repository || 'hypenosys/web';
        const branch = this.activeTask.rama || this.activeTask.branch || '';

        // FIX 2 — Validación de branch antes de enviar a Jules
        if (!branch || branch === 'N/A' || branch === '---') {
            this._showToast('Selecciona una rama válida antes de enviar a Jules', 'warn');
            // Intentar abrir el modal de edición de la tarea para corregir
            if (window.openEditTaskModal) window.openEditTaskModal(this.activeTask.id);
            return;
        }

        this._setLoading(this.elements.btnSendJules, true);

        try {
            const body = {
                prompt: prompt,
                sourceContext: {
                    source: repo.startsWith('sources/github/') ? repo : `sources/github/${repo}`,
                    githubRepoContext: { startingBranch: branch }
                }
            };

            const res = await window.julesApi.createSession(body);
            const sessionId = res.name.split('/').pop();
            this.activeSessionId = sessionId;

            this._showToast(`Sesión Jules #${sessionId} iniciada`, 'success');

            // Update Task with session ID
            if (window.taskOps?.updateTask) {
                await window.taskOps.updateTask(this.activeTask.id, {
                    jules_session: {
                        session_id: sessionId,
                        initiated_by: 'NeuralSession',
                        status: 'IN_PROGRESS',
                        updated_at: new Date().toISOString()
                    }
                });
            }

            this.startPolling();
        } catch (e) {
            console.error('[NEURAL] Failed to send to Jules:', e);
            this._showToast('Error al iniciar sesión Jules', 'error');
        } finally {
            this._setLoading(this.elements.btnSendJules, false);
        }
    }

    async handleChatSend() {
        const text = this.elements.chatInput?.value.trim();
        if (!text) return;

        if (this.mode === 'claude') {
            await this._chatWithClaude(text);
        } else {
            if (!this.activeSessionId) {
                this._showToast('Inicia una sesión Jules primero para enviar órdenes directas', 'warn');
                return;
            }
            // Add as comment or direct order (assuming hypothetical update functionality)
            this._showToast('Enviando instrucción directa a Jules...', 'info');
            this.elements.chatInput.value = '';
            // Implementation depends on Jules API stream capabilities for existing sessions
        }
    }

    async _chatWithClaude(text) {
        const config = this._getAIConfig();
        if (!config?.api_key) {
            this._showToast('Configuración AI requerida', 'error');
            return;
        }

        this._setLoading(document.getElementById('nd-chat-send'), true);
        this.elements.chatInput.disabled = true;

        try {
            const response = await this._callAIProvider(config, [
                { role: 'user', content: text }
            ]);

            // For now, we append Claude's response to the prompt area as a suggestion
            if (this.elements.promptArea) {
                this.elements.promptArea.value += `\n\n[Claude Suggestion]:\n${response}`;
            }
            this.elements.chatInput.value = '';
            this._showToast('Respuesta de Claude recibida', 'success');
        } catch (e) {
            this._showToast('Error en chat con Claude', 'error');
        } finally {
            this._setLoading(document.getElementById('nd-chat-send'), false);
            this.elements.chatInput.disabled = false;
        }
    }

    startPolling() {
        this.stopPolling();
        if (!this.activeSessionId) return;

        if (this.elements.pollingStatus) this.elements.pollingStatus.classList.remove('hidden');

        const poll = async () => {
            try {
                const data = await window.julesApi.getActivities(this.activeSessionId, 20);
                this._renderLogs(data.activities || []);
            } catch (e) {
                console.error('[NEURAL] Polling error:', e);
            }
        };

        poll();
        this.pollInterval = setInterval(poll, 10000);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.elements.pollingStatus) this.elements.pollingStatus.classList.add('hidden');
    }

    _renderLogs(activities) {
        if (!this.elements.logArea) return;

        if (activities.length === 0) {
            this.elements.logArea.innerHTML = '<div class="opacity-30 italic">Sin actividad detectada</div>';
            return;
        }

        this.elements.logArea.innerHTML = activities.map(a => {
            let cls = 'nd-log-line ', txt = a.description || '';
            if (a.progressUpdated) { cls += 'info'; txt = a.progressUpdated.title; }
            else if (a.planGenerated) { cls += 'warn'; txt = '📋 Plan generado'; }
            else if (a.planApproved) { cls += 'success'; txt = '✅ Plan aprobado'; }
            else if (a.sessionCompleted) { cls += 'success'; txt = '🏁 Sesión completada'; }
            else if (a.sessionFailed) { cls += 'error'; txt = `❌ ERROR: ${a.sessionFailed.reason}`; }

            return `<div class="${cls}"><span class="opacity-40 text-[9px] mr-2">${new Date(a.createTime).toLocaleTimeString()}</span>${txt}</div>`;
        }).join('');

        this.elements.logArea.scrollTop = this.elements.logArea.scrollHeight;
    }

    _generateSuggestedPrompt(task) {
        if (!this.elements.promptArea) return;

        // FIX 3 — Enriquecer primer mensaje a Jules
        let prompt = `Implementa la tarea: ${task.titulo || task.title}\n\n`;

        if (task.descripcion || task.description) {
            prompt += `DESCRIPCIÓN:\n${task.descripcion || task.description}\n\n`;
        }

        if (task.task_type) {
            prompt += `TIPO DE TAREA: ${task.task_type.toUpperCase()}\n`;
        }

        if (task.prioridad || task.priority) {
            prompt += `PRIORIDAD: ${task.prioridad || task.priority}\n`;
        }

        if (task.milestone) {
            prompt += `MILESTONE: ${task.milestone}\n`;
        }

        if (task.acceptance_criteria) {
            prompt += `\nCRITERIOS DE ACEPTACIÓN:\n${task.acceptance_criteria}\n\n`;
        }

        if (task.rama || task.branch) {
            prompt += `RAMA OBJETIVO: ${task.rama || task.branch}\n`;
        }

        // Sugerencia de archivos clave si existen en el contexto
        if (task.tags && task.tags.length > 0) {
            prompt += `TAGS RELACIONADOS: ${task.tags.join(', ')}\n`;
        }

        this.elements.promptArea.value = prompt.trim();
    }

    _getAIConfig() {
        return window.aiConfig?.getActiveConfig() || JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
    }

    async _callAIProvider(config, messages) {
        const baseUrl = (config.base_url || 'https://api.anthropic.com/v1').replace(/\/$/, '');
        const isAnthropic = baseUrl.includes('anthropic.com');
        const endpoint = isAnthropic ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`;

        const headers = { 'Content-Type': 'application/json' };
        let body = {};

        if (isAnthropic) {
            headers['x-api-key'] = config.api_key;
            headers['anthropic-version'] = '2023-06-01';
            headers['anthropic-dangerous-direct-browser-access'] = 'true';
            body = {
                model: config.model || 'claude-3-5-sonnet-20241022',
                max_tokens: 1024,
                system: messages.find(m => m.role === 'system')?.content,
                messages: messages.filter(m => m.role !== 'system')
            };
        } else {
            headers['Authorization'] = `Bearer ${config.api_key}`;
            body = { model: config.model, messages: messages, temperature: 0.7 };
        }

        const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const data = await res.json();
        return isAnthropic ? data.content[0].text : data.choices[0].message.content;
    }

    _showToast(msg, type = 'success') {
        if (window.showToast) {
            window.showToast(msg, type);
        } else {
            alert(msg);
        }
    }

    _setLoading(btn, isLoading) {
        if (!btn) return;
        if (isLoading) {
            btn.dataset.original = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
            btn.disabled = true;
        } else {
            btn.innerHTML = btn.dataset.original || btn.innerHTML;
            btn.disabled = false;
        }
    }

    _setupAutoResize() {
        const chatInput = this.elements.chatInput;
        if (!chatInput) return;
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
        });
    }

    _setupKeyboardShortcuts() {
        this.elements.chatInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleChatSend();
            }
        });
    }
}

// Global initialization
document.addEventListener('authReady', () => {
    if (!window.neuralSession) {
        window.neuralSession = new NeuralSessionPanel();
        window.neuralSession.init();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // fallback: if auth already resolved before this script loaded
    if (window.githubApi?.getAuthToken && window.githubApi.getAuthToken() && !window.neuralSession) {
        window.neuralSession = new NeuralSessionPanel();
        window.neuralSession.init();
    }
});
