/* ════════════════════════════════════════
   JULES PANEL KANBAN UI
   ════════════════════════════════════════ */

window.refreshKanban = async function() {
    try {
        const sessions = window.julesSessionsCache || [];
        renderKanban(sessions);
    } catch (e) {
        console.error("Kanban refresh failed:", e);
    }
}

window.onDragStart = function(ev, sid) {
    ev.dataTransfer.setData("text/plain", sid);
    ev.target.classList.add('dragging');
}

window.onDragOver = function(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
}

window.onDrop = async function(ev, colId) {
    ev.preventDefault();
    const sid = ev.dataTransfer.getData("text/plain");
    const card = document.querySelector('.kb-card[data-sid="' + sid + '"]');
    if (!card) return;

    // Determine logical state from column
    let newState = 'QUEUED';
    if (colId === 'en_progreso') newState = 'EXECUTING';
    else if (colId === 'listo') newState = 'COMPLETED';

    // Optimistic UI
    const targetCol = $('col-' + colId);
    if(targetCol) targetCol.appendChild(card);
    card.classList.remove('dragging');

    try {
        // Note: Jules API doesn't support direct state transition via move,
        // this is mostly for UI/Archive organization in our dashboard.
        addTel("SYSTEM", "Sesión #" + sid + " movida a " + colId, "info");
    } catch(e) {
        console.error("Drop failed:", e);
    }
}

window.relaunchJules = function(sessionDataJson) {
    const s = JSON.parse(decodeURIComponent(sessionDataJson));
    const prompt = s.prompt;
    const repo = s.sourceContext?.source;
    const branch = s.sourceContext?.githubRepoContext?.startingBranch;

    if (repo) {
        const source = (window.julesSourcesCache || []).find(src => src.name === repo);
        if (source) {
            // switchRepo is not defined, we use selectRepo from repo.js
            if(window.selectRepo) window.selectRepo(repo.replace('sources/github/', ''));
        }
    }

    if (branch) {
        const branchSelect = $('branch-selector');
        if (branchSelect) {
            const waitForOptions = setInterval(() => {
                const opt = Array.from(branchSelect.options).find(o => o.value === branch);
                if (opt) {
                    branchSelect.value = branch;
                    const sessCtx = $('sess-ctx');
                    if(sessCtx) {
                        const repoLabel = $('repo-label').textContent;
                        sessCtx.textContent = repoLabel + ': ' + branch;
                    }
                    clearInterval(waitForOptions);
                }
            }, 100);
            setTimeout(() => clearInterval(waitForOptions), 5000);
        }
    }

    const textarea = $('session-prompt');
    if (textarea) {
        textarea.value = prompt;
        switchView('neural');
        textarea.focus();
        showToast("Prompt cargado para relanzar", "info");
    }
}

function renderKanban(sessions) {
    const cols = {
        'en_cola': [],
        'en_progreso': [],
        'listo': [],
        'error': []
    };

    // Include archived sessions from local storage
    const archived = JSON.parse(localStorage.getItem('hy_neural_archive') || '{}');
    const allSessions = [...sessions];
    Object.keys(archived).forEach(id => {
        if (!sessions.find(s => s.name.endsWith('/' + id))) {
            allSessions.push(archived[id]);
        }
    });

    allSessions.forEach(s => {
        const sid = s.name.split('/').pop();
        const isArchived = archived[sid];

        let targetCol = 'en_cola';
        if (['COMPLETED'].includes(s.state)) targetCol = 'listo';
        else if (['FAILED', 'ERROR', 'CANCELLED'].includes(s.state)) targetCol = 'error';
        else if (['PLANNING', 'EXECUTING'].includes(s.state)) targetCol = 'en_progreso';

        cols[targetCol].push({ ...s, isArchived });
    });

    Object.keys(cols).forEach(colId => {
        const list = $('col-' + colId);
        if (!list) return;

        list.innerHTML = cols[colId].map(s => {
            const sid = s.name.split('/').pop();
            const repo = s.sourceContext?.source?.split('/').pop() || '---';
            const isArchived = s.isArchived;
            const canDrag = !isArchived;

            return '<div class="kb-card ' + colId + (isArchived ? ' archived' : '') + '" ' +
                   (canDrag ? 'draggable="true" ondragstart="onDragStart(event, \'' + sid + '\')" ondragend="this.classList.remove(\'dragging\')"' : '') +
                   ' data-sid="' + sid + '" onclick="openDrawer(\'' + s.name + '\')">' +
                   '<div class="kb-card-header">' +
                   '<div class="kb-card-id">#' + sid + (isArchived ? '<span class="archived-badge">Archived</span>' : '') + '</div>' +
                   '<span class="sbadge ' + s.state.toLowerCase().replace(/_/g, '-') + '">' + s.state + '</span>' +
                   '</div>' +
                   '<div class="kb-card-task">' + escapeHtml(s.title || s.prompt) + '</div>' +
                   '<div class="kb-card-footer">' +
                   '<span class="kb-card-repo">' + repo + '</span>' +
                   '<span class="kb-card-time">' + getTimeAgo(s.createTime) + '</span>' +
                   '</div>' +
                   '<div class="kb-card-actions">' +
                   (isArchived ? '<button class="kb-action-btn" style="color:var(--amber)" onclick="event.stopPropagation(); restoreArchivedCard(\'' + sid + '\')">Restaurar</button>' : '') +
                   '<button class="kb-action-btn btn-relaunch" onclick="event.stopPropagation(); relaunchJules(\'' + encodeURIComponent(JSON.stringify(s)) + '\')">Relanzar</button>' +
                   '<button class="kb-action-btn" onclick="event.stopPropagation(); switchView(\'chat\'); localStorage.setItem(\'hy_neural_session_id\', \'' + sid + '\'); startNeuralPolling(\'' + sid + '\');">Ver Neural</button>' +
                   '</div>' +
                   '</div>';
        }).join('');
    });
}
