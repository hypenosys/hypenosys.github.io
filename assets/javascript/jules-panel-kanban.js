/* ════════════════════════════════════════
   JULES PANEL KANBAN UI
   ════════════════════════════════════════ */

window.openNewTaskModal = function(initialStatus = 'pending') {
    const modal = $('new-task-modal');
    const descIn = $('nt-desc');
    if (!modal || !descIn) return;

    descIn.value = '';
    // Reset status buttons
    document.querySelectorAll('#nt-status-btns .fpill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.st === initialStatus);
    });
    window._initialTaskStatus = initialStatus;

    modal.classList.add('open');
    descIn.focus();
}

window.closeNewTaskModal = function() {
    const modal = $('new-task-modal');
    if (modal) modal.classList.remove('open');
}

window.selectTaskStatus = function(btn) {
    document.querySelectorAll('#nt-status-btns .fpill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window._initialTaskStatus = btn.dataset.st;
}

window.confirmNewTask = async function() {
    const desc = $('nt-desc').value.trim();
    if (!desc) { $('nt-desc').focus(); return; }

    const status = window._initialTaskStatus || 'pending';
    const repo = window.JulesPanelState.activeRepo || 'hypenosys/docs';
    const branch = window.JulesPanelState.activeBranch || 'main';

    const btn = document.querySelector('#new-task-modal .btn-primary');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const newTask = {
            title: desc.substring(0, 50) + (desc.length > 50 ? '...' : ''),
            descripcion: desc,
            estado: status === 'pending' ? 'Pending' : (status === 'running' ? 'Working' : (status === 'done' ? 'OK' : 'Critical')),
            prioridad: 'Major',
            repo: repo.replace('sources/github/', ''),
            rama: branch,
            fecha_creacion: new Date().toISOString()
        };

        await window.githubApi.createTask(newTask);
        showToast("Tarea creada con éxito", "green");
        closeNewTaskModal();
        await refreshDashboard();
    } catch (e) {
        showToast("Error al crear tarea: " + e.message, "red");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.onDragStart = (e, sessionId) => {
    e.dataTransfer.setData('text/plain', sessionId);
    const card = e.target.closest('.kb-card');
    if (card) card.classList.add('dragging');
};

window.onDragOver = (e, colId) => {
    e.preventDefault();
    const col = $(`col-${colId}`);
    if (col) col.classList.add('drag-over');
};

window.onDragLeave = (colId) => {
    const col = $(`col-${colId}`);
    if (col) col.classList.remove('drag-over');
};

window.onDrop = async (e, targetColId) => {
    e.preventDefault();
    const col = $(`col-${targetColId}`);
    if (col) col.classList.remove('drag-over');

    const sid = e.dataTransfer.getData('text/plain');
    if (!sid) return;

    // Internal archiving only to COMPLETED or BLOQUEADO
    if (targetColId === 'done' || targetColId === 'error') {
        const sessions = window.julesSessionsCache || [];
        const session = sessions.find(s => s.name.split('/').pop() === sid);
        if (!session) return;

        // Helper to get real col from session state
        let realCol = "pending";
        if (["WORKING", "IN_PROGRESS", "PLANNING", "AWAITING_PLAN_APPROVAL", "AWAITING_USER_FEEDBACK"].includes(session.state)) {
            realCol = "running";
        } else if (session.state === "COMPLETED") {
            realCol = "done";
        } else if (["FAILED", "CANCELLED", "ERROR"].includes(session.state)) {
            realCol = "error";
        }

        const title = session.title || session.prompt || '';
        const taskIdMatch = title.match(/#(\d+)/);
        const taskId = taskIdMatch ? taskIdMatch[1] : null;
        const archiveId = taskId || sid;

        const archiveData = {
            target: targetColId,
            realCol: realCol,
            isTask: !!taskId,
            updatedAt: new Date().toISOString()
        };

        // Optimistic update
        window.JulesPanelState.globalArchive[archiveId] = archiveData;
        showToast("Sincronizando archivo global...", "amber");
        loadJulesKanban(sessions);

        try {
            window.JulesPanelState.isSyncingArchive = true;
            await window.githubApi.updateJulesGlobalArchive(archiveId, archiveData);
            showToast("Cambio persistido globalmente", "green");
        } catch (err) {
            console.error("Global archive update failed", err);
            showToast("Error al persistir globalmente", "red");
        } finally {
            window.JulesPanelState.isSyncingArchive = false;
        }
    }
};

window.restoreArchivedCard = async (archiveId) => {
    if (!window.JulesPanelState.globalArchive[archiveId]) return;

    // Optimistic
    delete window.JulesPanelState.globalArchive[archiveId];
    showToast("Restaurando tarea...", "amber");
    loadJulesKanban(window.julesSessionsCache);

    try {
        window.JulesPanelState.isSyncingArchive = true;
        await window.githubApi.updateJulesGlobalArchive(archiveId, null);
        showToast("Tarea restaurada globalmente", "green");
    } catch (err) {
        console.error("Restore failed", err);
        showToast("Error al restaurar globalmente", "red");
    } finally {
        window.JulesPanelState.isSyncingArchive = false;
    }
};

window.relaunchJules = (sessionJson) => {
    try {
        const s = JSON.parse(decodeURIComponent(sessionJson));
        const prompt = s.prompt || s.title || '';
        const repo = s.sourceContext?.source;
        const branch = s.sourceContext?.githubRepoContext?.startingBranch;

        if ($('session-prompt')) $('session-prompt').value = prompt;

        if (repo) {
            const source = (window.julesSourcesCache || []).find(src => src.name === repo);
            if (source) {
                switchRepo(repo, source);
            } else {
                window.JulesPanelState.activeRepo = repo;
                localStorage.setItem('hypenosys_active_repo', repo);
            }
        }

        if (branch) {
            const setBranch = () => {
                const sel = $('branch-sel');
                if (sel && sel.options.length > 0 && sel.options[0].value !== "") {
                    sel.value = branch;
                    window.JulesPanelState.activeBranch = branch;
                    const sessCtx = $('sess-ctx');
                    if(sessCtx) {
                        const repoLabel = $('repo-label').textContent;
                        sessCtx.textContent = `${repoLabel}: ${branch}`;
                    }
                } else {
                    setTimeout(setBranch, 100);
                }
            };
            setBranch();
        }

        switchView('neural');
        showToast("Contexto re-cargado para nueva sesión", "green");
    } catch (e) {
        console.error("Relaunch failed", e);
        showToast("Error al relanzar sesión", "red");
    }
};

window.loadJulesKanban = async function(sessions = null) {
    try {
        if (!sessions) {
            const data = await window.julesApi.getSessions(20);
            sessions = data.sessions || [];
        }

        const colItems = {
            'pending': [],
            'running': [],
            'done': [],
            'error': []
        };

        sessions.forEach(s => {
            let targetCol = "pending";
            if (["WORKING", "IN_PROGRESS", "PLANNING", "AWAITING_PLAN_APPROVAL", "AWAITING_USER_FEEDBACK"].includes(s.state)) {
                targetCol = "running";
            } else if (s.state === "COMPLETED") {
                targetCol = "done";
            } else if (["FAILED", "CANCELLED", "ERROR"].includes(s.state)) {
                targetCol = "error";
            }
            colItems[targetCol].push(s);
        });

        const archive = window.JulesPanelState.globalArchive || {};
        if (typeof archive !== 'object') {
            console.warn("Invalid global archive format, resetting to empty");
            window.JulesPanelState.globalArchive = {};
        }

        let archiveChanged = false;

        // 1. Terminal State Cleanup: If real state is already terminal, clear archive entry
        ['done', 'error'].forEach(colId => {
            colItems[colId].forEach(s => {
                const sid = s.name.split('/').pop();
                const taskIdMatch = (s.title || s.prompt || '').match(/#(\d+)/);
                const taskId = taskIdMatch ? taskIdMatch[1] : null;
                const archiveId = taskId || sid;
                if (archive[archiveId]) {
                    delete archive[archiveId];
                    archiveChanged = true;
                }
            });
        });

        // 2. Internal Archiving & State Change Detection
        ['pending', 'running'].forEach(colId => {
            colItems[colId] = colItems[colId].filter(s => {
                const sid = s.name.split('/').pop();
                const taskIdMatch = (s.title || s.prompt || '').match(/#(\d+)/);
                const taskId = taskIdMatch ? taskIdMatch[1] : null;
                const archiveId = taskId || sid;

                const entry = archive[archiveId];
                if (entry) {
                    let currentRealCol = "pending";
                    if (["WORKING", "IN_PROGRESS", "PLANNING", "AWAITING_PLAN_APPROVAL", "AWAITING_USER_FEEDBACK"].includes(s.state)) {
                        currentRealCol = "running";
                    } else if (s.state === "COMPLETED") {
                        currentRealCol = "done";
                    } else if (["FAILED", "CANCELLED", "ERROR"].includes(s.state)) {
                        currentRealCol = "error";
                    }

                    if (currentRealCol !== (entry.realCol || entry.realState)) {
                        delete archive[archiveId];
                        archiveChanged = true;
                        return true;
                    }
                    // Move to internal target
                    if (colItems[entry.target]) {
                        colItems[entry.target].push(s);
                        return false;
                    }
                }
                return true;
            });
        });

        if (archiveChanged) {
            window.githubApi.atomicWrite('_data/jules_panel_state.json', (db) => {
                db.archive = window.JulesPanelState.globalArchive;
                db.last_updated = new Date().toISOString();
                return db;
            }, "chore: limpieza automática de archivo global (estados terminales o cambiados)");
        }

        const localArchive = JSON.parse(localStorage.getItem('jules_internal_archive') || '{}');

        // 1. Terminal State Cleanup
        ['done', 'error'].forEach(colId => {
            colItems[colId].forEach(s => {
                const sid = s.name.split('/').pop();
                const taskIdMatch = (s.title || s.prompt || '').match(/#(\d+)/);
                const taskId = taskIdMatch ? taskIdMatch[1] : null;
                const archiveId = taskId || sid;
                if (localArchive[archiveId]) delete localArchive[archiveId];
            });
        });

        // 2. Internal Archiving
        ['pending', 'running'].forEach(colId => {
            colItems[colId] = colItems[colId].filter(s => {
                const sid = s.name.split('/').pop();
                const taskIdMatch = (s.title || s.prompt || '').match(/#(\d+)/);
                const taskId = taskIdMatch ? taskIdMatch[1] : null;
                const archiveId = taskId || sid;

                const entry = localArchive[archiveId];
                if (entry) {
                    if (s.state !== entry.realState) {
                        delete localArchive[archiveId];
                        return true;
                    }
                    colItems[entry.target].push(s);
                    return false;
                }
                return true;
            });
        });
        localStorage.setItem('jules_internal_archive', JSON.stringify(localArchive));

        Object.keys(colItems).forEach(colId => {
            const colEl = $(`kb-${colId}`), countEl = $(`kb-count-${colId}`), mCountEl = $(`m-count-${colId}`);
            if (!colEl) return;

            const items = colItems[colId];
            if (countEl) countEl.textContent = items.length;
            if (mCountEl) mCountEl.textContent = items.length;

            colEl.ondragover  = (e) => window.onDragOver(e, colId);
            colEl.ondragleave = () => window.onDragLeave(colId);
            colEl.ondrop      = (e) => window.onDrop(e, colId);

            colEl.innerHTML = items.map(s => {
                const sid = s.name.split('/').pop();
                const taskIdMatch = (s.title || s.prompt || '').match(/#(\d+)/);
                const taskId = taskIdMatch ? taskIdMatch[1] : null;
                const archiveId = taskId || sid;

                const isArchived = localArchive[archiveId] !== undefined;
                const repo = s.sourceContext?.source?.split('/').pop() || '---';
                const canDrag = (colId === 'pending' || colId === 'running') && !isArchived;

                return `
                    <div class="kb-card ${colId} ${isArchived ? 'archived' : ''}"
                         ${canDrag ? `draggable="true" ondragstart="onDragStart(event, '${sid}')" ondragend="this.classList.remove('dragging')"` : ''}
                         onclick="openDrawer('${s.name}')">
                        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:5px">
                            <div class="kb-card-id">#${sid}${isArchived ? '<span class="archived-badge">Archived</span>' : ''}</div>
                            <span class="sbadge ${s.state.toLowerCase().replace(/_/g, '-')}">${s.state}</span>
                        </div>
                        <div class="kb-card-task">${escapeHtml(s.title || s.prompt)}</div>
                        <div class="kb-card-meta">
                            <span class="kb-card-repo">${repo}</span>
                            <span class="kb-card-time">${getTimeAgo(s.createTime)}</span>
                        </div>
                        <div class="kb-card-actions">
                            ${isArchived ? `<button class="kb-action-btn" style="color:var(--amber)" onclick="event.stopPropagation(); restoreArchivedCard('${archiveId}')">Restaurar</button>` : ''}
                            <button class="kb-action-btn btn-relaunch" onclick="event.stopPropagation(); relaunchJules('${encodeURIComponent(JSON.stringify(s))}')">Relanzar Jules</button>
                            <button class="kb-action-btn" onclick="event.stopPropagation(); const cid = localStorage.getItem('hy_active_claude_session_id'); if (cid) localStorage.setItem('hy_neural_session_id_' + cid, '${sid}'); localStorage.setItem('hy_neural_session_id', '${sid}'); localStorage.setItem('hy_neural_active', 'true'); switchView('chat');">Ver Neural</button>
                        </div>
                    </div>
                `;
            }).join('') || '<div style="padding:20px; text-align:center; color:var(--text3); font-size:11px;">Vacio</div>';
        });
    } catch (e) {
        console.warn('[Jules] loadJulesKanban error:', e);
    }
}

window.scrollToKanbanCol = function(colId, btn) {
    const col = $(`col-${colId}`);
    if (col) {
        col.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        document.querySelectorAll('#view-kanban .fpill').forEach(p => p.classList.remove('active'));
        if (btn) btn.classList.add('active');
    }
}
