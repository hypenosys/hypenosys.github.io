/**
 * NEURAL SESSION MANAGER
 * Orchestrates collaboration between Claude and Jules
 */

const NeuralSession = {
    activeTask: null,
    history: [],
    activityInterval: null,

    init() {
        console.log('[NEURAL] Initializing Neural Session Manager...');
        this.setupListeners();
        this.restoreSession();
    },

    setupListeners() {
        const closeBtn = document.getElementById('close-neural-drawer');
        if (closeBtn) closeBtn.onclick = () => this.toggleDrawer(false);

        const sendJules = document.getElementById('btn-send-jules');
        if (sendJules) sendJules.onclick = () => this.sendToJules();

        const refineClaude = document.getElementById('btn-refine-claude');
        if (refineClaude) refineClaude.onclick = () => this.refineWithClaude();
    },

    toggleDrawer(show, task = null) {
        const drawer = document.getElementById('neural-session-drawer');
        if (!drawer) return;

        if (show) {
            drawer.classList.add('open');
            if (task) this.loadTask(task);
        } else {
            drawer.classList.remove('open');
        }
    },

    loadTask(task) {
        this.activeTask = task;
        document.getElementById('neural-task-id').textContent = `TASK-${task.id}`;
        document.getElementById('neural-task-repo').textContent = task.repository || 'Sin repo';
        document.getElementById('neural-task-title').textContent = task.title;
        document.getElementById('neural-task-branch').textContent = `rama: ${task.branch || 'master'}`;

        this.addMessage('system', `Analizando contexto para "${task.title}"...`);
        this.startActivityPolling();
    },

    addMessage(role, text) {
        const container = document.getElementById('neural-messages');
        const msgDiv = document.createElement('div');
        msgDiv.className = `neural-message ${role}`;
        msgDiv.innerHTML = `<p>${this.escapeHtml(text)}</p>`;
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;

        this.history.push({ role, text });
        this.saveSession();
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    async refineWithClaude() {
        const prompt = document.getElementById('neural-prompt-input').value;
        if (!prompt) return;

        this.addMessage('user', prompt);
        document.getElementById('neural-prompt-input').value = '';

        // UI Feedback
        const btn = document.getElementById('btn-refine-claude');
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            // Simulate AI delay for now as real bridge depends on global Claude config
            this.addMessage('claude', "Analizando tu requerimiento en base al código actual... ¿Te gustaría que Jules aplique estos cambios directamente o quieres revisar el plan?");
        } finally {
            btn.innerHTML = original;
            btn.disabled = false;
        }
    },

    async sendToJules() {
        const prompt = document.getElementById('neural-prompt-input').value;
        if (!prompt && this.history.length === 0) return;

        const finalPrompt = prompt || this.history[this.history.length-1].text;
        this.addMessage('system', 'Iniciando ejecución de Jules...');

        // Integration with existing Jules Panel mechanism
        const payload = {
            task: this.activeTask,
            prompt: finalPrompt,
            timestamp: new Date().toISOString()
        };

        localStorage.setItem('jules_task_payload', JSON.stringify(payload));

        if (window.hypeToast) window.hypeToast('Sesión enviada a Jules', 'success');

        // Notify badge
        if (window.updateNeuralSessionBadge) window.updateNeuralSessionBadge(true);
    },

    startActivityPolling() {
        if (this.activityInterval) clearInterval(this.activityInterval);

        this.activityInterval = setInterval(async () => {
            if (!this.activeTask) return;
            try {
                // Use activities API from github-api-ops
                if (window.githubApi && window.githubApi.getActivities) {
                    const logs = await window.githubApi.getActivities();
                    this.updateActivityLog(logs);
                }
            } catch (e) {
                console.warn('[NEURAL] Polling error:', e);
            }
        }, 5000);
    },

    updateActivityLog(logs) {
        const container = document.getElementById('neural-activity-log');
        if (!container || !logs || logs.length === 0) return;

        container.innerHTML = logs.slice(0, 5).map(log => `
            <div class="mb-1">
                <span class="text-white-50">[${new Date(log.timestamp).toLocaleTimeString()}]</span>
                ${log.message}
            </div>
        `).join('');

        const lastLog = logs[0];
        const statusBadge = document.getElementById('jules-status-badge');
        if (statusBadge && lastLog.status) {
            statusBadge.textContent = lastLog.status.toUpperCase();
            statusBadge.className = `badge badge-${lastLog.status === 'completed' ? 'success' : 'info'}`;
        }
    },

    saveSession() {
        if (!this.activeTask) return;
        const state = {
            taskId: this.activeTask.id,
            history: this.history
        };
        localStorage.setItem('neural_session_active', JSON.stringify(state));
    },

    restoreSession() {
        const saved = localStorage.getItem('neural_session_active');
        if (!saved) return;

        try {
            const state = JSON.parse(saved);
            // Re-render history if needed when drawer opens
        } catch (e) {}
    }
};

// Auto-init
document.addEventListener('DOMContentLoaded', () => NeuralSession.init());
window.NeuralSession = NeuralSession;
