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

    // Mapping columns from HTML to logical Kanban columns
    const colMap = {
        'pending': 'pending',
        'running': 'running',
        'done':    'done',
        'error':   'error'
    };

    // Detect if dropped on a column header or body and find the column id
    let targetColId = colId;
    if (!colMap[targetColId]) {
        // Fallback for older colIds or internal mapping
        if (colId === 'en_progreso') targetColId = 'running';
        else if (colId === 'listo') targetColId = 'done';
        else if (colId === 'en_cola') targetColId = 'pending';
    }

    // Persist override locally
    const overrides = JSON.parse(localStorage.getItem('jules_kanban_overrides') || '{}');
    overrides[sid] = targetColId;
    localStorage.setItem('jules_kanban_overrides', JSON.stringify(overrides));

    // Update UI
    if (window.refreshKanban) window.refreshKanban();
    if (window.refreshDashboard) {
        // We only want to update counts, but refreshDashboard also re-fetches sessions.
        // For immediate feedback we could just call updateKanbanCounts with cache.
        if (window.julesSessionsCache) {
             window.updateKanbanCounts(window.julesSessionsCache);
        }
    }

    addTel("SYSTEM", "Sesión #" + sid + " movida localmente a " + targetColId, "info");
    showToast("Estado actualizado localmente", "amber");
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
        'pending': [],
        'running': [],
        'done': [],
        'error': []
    };

    // Include archived sessions from local storage
    const archived = JSON.parse(localStorage.getItem('hy_neural_archive') || '{}');
    const localOverrides = JSON.parse(localStorage.getItem('jules_kanban_overrides') || '{}');

    // User filter
    const currentUser = window.githubApi.user;
    const login = currentUser ? currentUser.login.toLowerCase().trim() : null;

    const allSessions = [...sessions];
    Object.keys(archived).forEach(id => {
        if (!sessions.find(s => s.name.endsWith('/' + id))) {
            allSessions.push(archived[id]);
        }
    });

    let hasOwnershipData = false;
    allSessions.forEach(s => {
        const sid = s.name.split('/').pop();

        // Ownership check
        const creator = (s.creator || s.metadata?.creator || s.user || '').toLowerCase().trim();
        if (creator) hasOwnershipData = true;

        if (login && creator && creator !== login) return;

        const isArchived = archived[sid];
        const overrideCol = localOverrides[sid];

        let targetCol = overrideCol || window.normalizeJulesStatus(s.state);
        cols[targetCol].push({ ...s, isArchived, isOverridden: !!overrideCol });
    });

    if (!hasOwnershipData && allSessions.length > 0) {
        console.warn("[JULES-KANBAN] No ownership data found in sessions. Showing all.");
        // Optional: show a small notice in the UI
    }

    Object.keys(cols).forEach(colId => {
        const list = $('kb-' + colId);
        if (!list) return;

        if (cols[colId].length === 0) {
            list.innerHTML = '<div class="kb-empty">Sin tareas</div>';
            return;
        }

        list.innerHTML = cols[colId].map(s => {
            const sid = s.name.split('/').pop();
            const repo = s.sourceContext?.source?.split('/').pop() || '---';
            const isArchived = s.isArchived;
            const canDrag = !isArchived;

            return '<div class="kb-card ' + colId + (isArchived ? ' archived' : '') + '" ' +
                   (canDrag ? 'draggable="true" ondragstart="onDragStart(event, \'' + sid + '\')" ondragend="this.classList.remove(\'dragging\')"' : '') +
                   ' data-sid="' + sid + '" onclick="openDrawer(\'' + s.name + '\')">' +
                   '<div class="kb-card-header">' +
                   '<div class="kb-card-id">#' + sid +
                   (isArchived ? '<span class="archived-badge">Archived</span>' : '') +
                   (s.isOverridden ? '<span class="archived-badge" style="background:var(--amber); color:#000; margin-left:4px">Override</span>' : '') +
                   '</div>' +
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
