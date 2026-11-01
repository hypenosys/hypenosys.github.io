/* Presentation layer for the Neural workspaces. Uses existing session APIs and drafts. */
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
    const cleanId = value => String(value || '').replace(/^sessions\//, '');
    const states = {
        QUEUED: ['En cola', 'queued'], PLANNING: ['Preparando', 'preparing'],
        IN_PROGRESS: ['En ejecución', 'running'], COMPLETED: ['Completada', 'done'],
        FAILED: ['Fallida', 'failed'], PAUSED: ['Pausada', 'waiting'],
        AWAITING_PLAN_APPROVAL: ['Esperando aprobación', 'waiting'],
        AWAITING_USER_FEEDBACK: ['Esperando respuesta', 'waiting']
    };
    const status = state => {
        const [label, style] = states[state] || [state || 'Sin estado', ''];
        return '<span class="neural-status ' + style + '">' + escape(label) + '</span>';
    };
    let filter = 'all';
    let queued = false;
    const previous = new Map();
    function html(id, value) {
        if (previous.get(id) === value) return;
        const node = $(id);
        if (node) { node.innerHTML = value; previous.set(id, value); }
    }
    function text(id, value) { const node = $(id); if (node && node.textContent !== value) node.textContent = value; }
    function date(value) {
        if (!value || !Number.isFinite(new Date(value).getTime())) return '—';
        return new Date(value).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    function getSessions() { return (window.julesSessionsCache || []).filter(s => s && s.name); }
    function render() {
        const root = $('view-chat');
        if (!root) return;
        const mode = window.NeuralWorkspaceState?.activeMode || 'claude';
        const isClaude = mode === 'claude';
        root.dataset.workspaceMode = mode;
        text('neural-workspace-title', isClaude ? 'Claude · Asistente de desarrollo' : 'Jules · Orquestación de tareas');
        text('neural-workspace-description', isClaude
            ? 'Analiza, planifica, escribe y revisa código con el contexto de tu proyecto.'
            : 'Gestiona el trabajo de Claude + Jules y supervisa cada ejecución.');
        $('neural-hero-icon').className = isClaude ? 'far fa-comment-dots' : 'fas fa-robot';

        const sessions = getSessions();
        const conversation = (window.julesPanelSessions || []).find(s => s.id === window.currentJulesPanelSessionId);
        const sid = isClaude ? cleanId(window.resolveLinkedJulesId?.(conversation))
            : cleanId(window.NeuralWorkspaceState?.activeJulesSessionId);
        const session = sessions.find(s => cleanId(s.name) === sid);
        // A global task context may belong to another conversation. Only show it for its session.
        let context = null;
        try { context = JSON.parse(localStorage.getItem('hy_neural_task_context') || 'null'); } catch { /* no context */ }
        const taskMatches = sid && cleanId(context?.jules_session?.session_id) === sid;
        if (!taskMatches) context = null;
        const legacyContext = $('v2-task-context');
        if (legacyContext) legacyContext.hidden = isClaude || !context;
        const repo = session?.sourceContext?.source?.replace(/^sources\/github\//, '') || (sid ? context?.repository : '') || '—';
        const branch = session?.sourceContext?.githubRepoContext?.startingBranch || context?.rama || '—';
        const taskTitle = context?.titulo || context?.title || session?.title || session?.prompt
            || (sid ? conversation?.metadata?.linkedJulesTaskTitle : '') || 'Sin tarea vinculada';
        const details = [
            ['Repositorio', repo], ['Rama', branch], ['Prioridad', context?.prioridad || context?.priority || '—'],
            ['Modo', sid ? (isClaude || window.resolveLinkedClaudeConversationId?.(sid) ? 'Claude + Jules' : 'Jules') : 'Claude'],
            ['Creada', date(session?.createTime)], ['Actualizada', date(session?.updateTime)]
        ];
        html('neural-task-overview', (sid ? '<strong>#' + escape(context?.id || sid) + '</strong> ' + status(session?.state) : '')
            + '<div class="neural-task-title">' + escape(taskTitle) + '</div>'
            + (sid ? '<dl class="neural-task-meta">' + details.map(([label, value]) => '<dt>' + label + '</dt><dd>' + escape(value) + '</dd>').join('') + '</dl>'
                : '<p>Vincula una sesión de Jules para consultar su repositorio, rama y estado.</p>'));
        text('neural-execution-id', sid ? '· #' + sid : '');
        html('neural-execution-state', sid ? status(session?.state) : '');

        const finished = s => ['COMPLETED', 'FAILED'].includes(s.state);
        const visible = sessions.filter(s => filter === 'finished' ? finished(s) : filter === 'active' ? !finished(s) && s.state !== 'QUEUED' : true);
        text('neural-queue-count', '(' + visible.length + ')');
        html('neural-queue-rows', visible.length ? visible.map(s => {
            const id = cleanId(s.name);
            const title = s.title || s.prompt || 'Sin título';
            const repoName = s.sourceContext?.source?.replace(/^sources\/github\//, '') || '—';
            const branchName = s.sourceContext?.githubRepoContext?.startingBranch || '—';
            const linked = !!window.resolveLinkedClaudeConversationId?.(id);
            return '<tr aria-selected="' + (id === sid) + '"><td><button type="button" class="neural-queue-title" data-neural-session="' + escape(id) + '" title="' + escape(title) + '">' + escape(title) + '</button></td>'
                + '<td>#' + escape(id) + '</td><td>' + escape(repoName) + '</td><td>' + escape(branchName) + '</td><td>' + status(s.state) + '</td><td><span class="neural-link-badge claude-jules">' + (linked ? 'Claude + Jules' : 'Jules') + '</span></td></tr>';
        }).join('') : '<tr><td colspan="6" class="neural-queue-empty">' + (sessions.length ? 'No hay sesiones con este filtro.' : 'No hay sesiones de Jules. Crea una tarea para comenzar.') + '</td></tr>');
        text('neural-queue-footer', sid ? 'Sesión seleccionada: #' + sid : 'Selecciona una sesión para ver su ejecución.');
        const counts = [
            ['En cola', sessions.filter(s => s.state === 'QUEUED').length, 'layer-group'],
            ['En ejecución', sessions.filter(s => ['IN_PROGRESS', 'PLANNING'].includes(s.state)).length, 'play'],
            ['Completadas', sessions.filter(s => s.state === 'COMPLETED').length, 'circle-check'],
            ['Fallidas', sessions.filter(s => s.state === 'FAILED').length, 'circle-xmark']
        ];
        html('neural-operational-summary', counts.map(([label, count, icon]) => '<div class="neural-summary-item"><i class="fas fa-' + icon + '" aria-hidden="true"></i><div><strong>' + count + '</strong>' + label + '</div></div>').join(''));
        const recent = [...sessions].sort((a, b) => (Date.parse(b.updateTime || b.createTime) || 0) - (Date.parse(a.updateTime || a.createTime) || 0)).slice(0, 4);
        html('neural-recent-activity', recent.length ? recent.map(s => '<div class="neural-recent-item"><span title="' + escape(s.title || s.prompt) + '">' + escape(s.title || s.prompt || cleanId(s.name)) + '</span><time>' + escape(date(s.updateTime || s.createTime)) + '</time></div>').join('') : 'Sin actividad reciente.');
        const bridge = window.JulesClaudeBridge?.getState?.();
        text('neural-auto-state', bridge?.enabled ? 'Activo · ' + bridge.rounds + '/3' : 'Desactivado');
        $('neural-auto-state').classList.toggle('running', !!bridge?.enabled);
        const config = window.getActiveConfig?.();
        text('neural-composer-model', isClaude ? config?.model || config?.name || 'Configurar modelo' : 'Jules');
        $('neural-docs-toggle').setAttribute('aria-pressed', String(!!window.isDocsEnabled));
    }
    function scheduleRender() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; render(); });
    }
    function init() {
        const root = $('view-chat');
        if (!root) return;
        root.addEventListener('click', async event => {
            const target = event.target.closest('button');
            if (!target) return;
            if (target.dataset.neuralPrompt !== undefined) {
                const input = $('v2-chat-input');
                // Quick actions prepare a draft; sending always uses the existing submit action.
                window.setJulesComposerDraft('claude', input.value ? input.value + '\n\n' + target.dataset.neuralPrompt : target.dataset.neuralPrompt);
                input.focus();
            }
            if (target.dataset.neuralFilter) {
                filter = target.dataset.neuralFilter;
                root.querySelectorAll('[data-neural-filter]').forEach(btn => btn.setAttribute('aria-pressed', String(btn === target)));
                render();
            }
            if (target.dataset.neuralSession) { window.selectLinkedJulesSession(target.dataset.neuralSession); render(); }
            if (target.id === 'neural-composer-link') {
                if (window.NeuralWorkspaceState?.activeMode === 'jules') window.openClaudeSessionSelector();
                else window.openJulesTaskSelector();
            }
            if (target.id === 'neural-insert-code') {
                const input = $('v2-chat-input');
                const start = input.selectionStart;
                input.setRangeText('\n```\n\n```\n', start, input.selectionEnd, 'end');
                input.focus(); input.setSelectionRange(start + 5, start + 5);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (target.id === 'neural-docs-toggle') { window.toggleDocsContext?.(); render(); }
            if (target.id === 'neural-model-config') window.openApiModal();
            if (target.id === 'neural-refresh-sessions') {
                target.disabled = true;
                try { await window.refreshDashboard(); render(); }
                catch (error) { window.showToast?.('No se pudieron actualizar las sesiones: ' + error.message, 'red'); }
                finally { target.disabled = false; }
            }
        });
        // Existing renderers own these nodes. Observe them without rebuilding the chat or polling again.
        const observer = new MutationObserver(scheduleRender);
        for (const id of ['claude-linking-bar', 'jules-linking-bar', 'sb-neural-history-list', 'jules-claude-bridge-status', 'active-profile-name']) {
            const node = $(id);
            if (node) observer.observe(node, { childList: true, subtree: true, characterData: true });
        }
        window.addEventListener('julesActivitiesUpdated', scheduleRender);
        window.addEventListener('storage', scheduleRender);
        render();
    }
    window.NeuralPanelUI = { render: scheduleRender };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
