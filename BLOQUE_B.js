async function refreshSessions() {
    try {
        const data = await window.julesApi.getSessions(window.JulesPanelState.metricsWindow || 30);
        const sessions = data.sessions || [];
        window.julesSessionsCache = sessions;

        renderHistoryTable(sessions);
        renderKanban(sessions);
        updateStats();

    } catch (e) {
        console.error('[Jules] Error refreshing sessions:', e);
    }
}

function renderHistoryTable(sessions) {
    const body = $('tbl-body');
    if (!body) return;

    if (sessions.length === 0) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text3);">Sin sesiones</td></tr>';
        return;
    }

    body.innerHTML = sessions.map(s => {
        const statusLabel = {
            'IN_PROGRESS': 'activo',
            'COMPLETED': 'listo',
            'FAILED': 'error',
            'QUEUED': 'cola',
            'PLANNING': 'planificando',
            'AWAITING_PLAN_APPROVAL': 'esperando'
        }[s.state] || 'listo';

        const statusClass = s.state.toLowerCase().replace(/_/g, '-');

        return `<tr onclick="openDrawer('${s.name}')">
            <td><span class="sid">${s.name.split('/').pop()}</span></td>
            <td class="tdesc">${escapeHtml(s.title || s.prompt)}</td>
            <td class="tmono">${s.sourceContext?.source?.split('/').pop() || '---'}</td>
            <td class="tmono">${s.sourceContext?.githubRepoContext?.startingBranch || '---'}</td>
            <td><span class="sbadge ${statusClass}"><span class="pulse-dot"></span>${statusLabel}</span></td>
            <td class="tmono">${getTimeAgo(s.createTime)}</td>
            <td class="tmono">${new Date(s.createTime).toLocaleDateString()}</td>
        </tr>`;
    }).join('');
}

function renderKanban(sessions) {
    const columns = {
        'pending': ['QUEUED', 'PLANNING'],
        'running': ['IN_PROGRESS', 'AWAITING_PLAN_APPROVAL', 'AWAITING_USER_FEEDBACK'],
        'done':    ['COMPLETED'],
        'error':   ['FAILED']
    };

    Object.keys(columns).forEach(colId => {
        const colEl = $(`kb-${colId}`);
        const countEl = $(`kb-count-${colId}`);
        if (!colEl) return;

        const items = sessions.filter(s => columns[colId].includes(s.state));
        if (countEl) countEl.textContent = items.length;

        colEl.innerHTML = items.map(s => `
            <div class="kb-card ${colId}" onclick="openDrawer('${s.name}')">
                <div class="kb-card-id">${s.name.split('/').pop()}</div>
                <div class="kb-card-task">${escapeHtml(s.title || s.prompt)}</div>
                <div class="kb-card-meta">
                    <span class="kb-card-repo">${s.sourceContext?.source?.split('/').pop() || '---'}</span>
                    <span class="kb-card-time">${getTimeAgo(s.createTime)}</span>
                </div>
            </div>
        `).join('');
    });
}

function updateStats() {
    const sessions = window.julesSessionsCache || [];
    const running = sessions.filter(s => ['IN_PROGRESS', 'PLANNING', 'AWAITING_PLAN_APPROVAL'].includes(s.state)).length;

    if($('s-active')) $('s-active').textContent = running;
    if($('s-repos'))  $('s-repos').textContent  = (window.julesSourcesCache || []).length;
    if($('s-total'))  $('s-total').textContent  = sessions.length;
    if($('kanban-badge')) $('kanban-badge').textContent = running;
}

async function launchSession() {
    const prompt = $('session-prompt').value.trim();
    if (!prompt) {
        $('session-prompt').focus();
        showToast("Escribe una tarea para Jules", "red");
        return;
    }

    const source = window.JulesPanelState.activeRepo;
    const branch = window.JulesPanelState.activeBranch || 'master';

    if (!source) {
        showToast("Selecciona un repositorio", "red");
        return;
    }

    const btn = $('launch-btn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Iniciando...';

    try {
        const body = {
            prompt,
            sourceContext: {
                source,
                githubRepoContext: { startingBranch: branch }
            }
        };

        // Add options based on pills (simplification for Bloque B)
        if ($('opt-review').classList.contains('active')) body.requirePlanApproval = true;

        const res = await window.julesApi.createSession(body);
        showToast("Sesión iniciada correctamente", "green");
        addTel("JULES", `Sesión iniciada: ${res.name.split('/').pop()}`, "success");

        $('session-prompt').value = '';
        await refreshSessions();

    } catch (e) {
        showToast(e.message || "Error al lanzar sesión", "red");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
