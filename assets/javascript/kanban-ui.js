/**
 * Kanban UI Component - Renders and manages the board
 */

(function() {
    const STATUS_FLOW = ['BACKLOG', 'TODO', 'WORKING', 'REVIEW', 'DONE', 'BLOCKED'];

    const kanbanUI = {
        expandedCards: new Set(),

        init: async () => {
            kanbanUI.bindEvents();
            await kanbanUI.refresh();
        },

        attachEvents: (container) => {
            if (!container) return;
            // Include the container itself if it has a data-action
            const elements = Array.from(container.querySelectorAll('[data-action]'));
            if (container.dataset && container.dataset.action) {
                elements.push(container);
            }

            elements.forEach(el => {
                const action = el.dataset.action;
                const id = el.dataset.id;

                const handler = (e) => {
                    // Prevent default and stop propagation to avoid multiple triggers
                    // and to prevent the card toggle if we clicked a button inside it
                    e.preventDefault();
                    e.stopPropagation();

                    if (action === 'toggle') {
                        window.kanbanUI.toggleCard(id);
                    } else if (action === 'edit') {
                        if (typeof window.openEditTaskModal === 'function') {
                            window.openEditTaskModal(id);
                        } else if (typeof openEditTaskModal === 'function') {
                            openEditTaskModal(id);
                        }
                    } else if (action === 'claude') {
                        let taskData = { id };

                        // Primary: try window.currentTasks
                        if (Array.isArray(window.currentTasks)) {
                            const found = window.currentTasks.find(t => String(t.id) === String(id));
                            if (found) taskData = found;
                        }

                        // Secondary: try window.kanbanData or window.allTasks as alternative global names
                        if (taskData.id && !taskData.title) {
                            const alt = (window.kanbanData || window.allTasks || []);
                            const found = Array.isArray(alt) ? alt.find(t => String(t.id) === String(id)) : null;
                            if (found) taskData = found;
                        }

                        // Tertiary: try the global currentTasks if available (common in dashboard-config.js)
                        if (taskData.id && !taskData.title && typeof currentTasks !== 'undefined' && Array.isArray(currentTasks)) {
                            const found = currentTasks.find(t => String(t.id) === String(id));
                            if (found) taskData = found;
                        }

                        if (typeof window._openTaskInClaude === 'function') {
                            window._openTaskInClaude(taskData);
                        }
                    } else if (action === 'move') {
                        const nextStatus = el.dataset.nextStatus;
                        window.kanbanUI.moveTask(id, nextStatus, el);
                    }
                };

                if (el.dataset.eventsAttached) return;
                el.dataset.eventsAttached = 'true';

                ['click', 'touchend'].forEach(eventType => {
                    el.addEventListener(eventType, handler, { passive: false });
                });
            });
        },

        toggleCard: (taskId) => {
            const idStr = String(taskId);
            if (kanbanUI.expandedCards.has(idStr)) {
                kanbanUI.expandedCards.delete(idStr);
            } else {
                kanbanUI.expandedCards.add(idStr);
            }

            // Universal refresh trigger
            if (typeof renderKanbanBoard === 'function') {
                renderKanbanBoard();
            } else if (typeof refreshDashboard === 'function') {
                refreshDashboard();
            } else {
                kanbanUI.refresh();
            }
        },

        bindEvents: () => {
            const btnKanban = document.getElementById('view-mode-kanban');
            const btnSessions = document.getElementById('view-mode-sessions');
            const containerKanban = document.getElementById('kanban-container');
            const containerSessions = document.getElementById('sessions-container');
            const uiKanban = document.getElementById('kanban-header-ui');
            const uiSessions = document.getElementById('sessions-header-ui');

            btnKanban.onclick = () => {
                btnKanban.classList.add('active');
                btnSessions.classList.remove('active');
                containerKanban.classList.remove('hidden');
                containerSessions.classList.add('hidden');
                uiKanban.classList.remove('hidden');
                uiSessions.classList.add('hidden');
                kanbanUI.refresh();
            };

            btnSessions.onclick = () => {
                btnSessions.classList.add('active');
                btnKanban.classList.remove('active');
                containerSessions.classList.remove('hidden');
                containerKanban.classList.add('hidden');
                uiSessions.classList.remove('hidden');
                uiKanban.classList.add('hidden');
            };

            // Filters
            document.getElementById('filter-asignado').onchange = () => kanbanUI.refresh();
            document.getElementById('filter-repo').onchange = () => kanbanUI.refresh();
        },

        refresh: async () => {
            try {
                const tasks = await window.taskOps.getAllTasks();
                const repos = await window.githubContext.getRepos();

                kanbanUI.populateFilterSelectors(tasks, repos);

                const filtered = kanbanUI.applyFilters(tasks);
                kanbanUI.renderBoard(filtered);
                kanbanUI.updateAlerts(tasks);
            } catch (e) {
                console.error('[Kanban] Error refreshing board:', e);
            }
        },

        populateFilterSelectors: (tasks, repos) => {
            const selAsignado = document.getElementById('filter-asignado');
            const selRepo = document.getElementById('filter-repo');

            if (selAsignado.options.length <= 1) {
                const members = [...new Set(tasks.flatMap(t => t.asignado_a || []))].sort();
                members.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    selAsignado.appendChild(opt);
                });
            }

            if (selRepo.options.length <= 1) {
                repos.sort((a,b) => a.name.localeCompare(b.name)).forEach(r => {
                    const opt = document.createElement('option');
                    opt.value = r.name;
                    opt.textContent = r.name;
                    selRepo.appendChild(opt);
                });
            }
        },

        applyFilters: (tasks) => {
            const asignado = document.getElementById('filter-asignado').value;
            const repo = document.getElementById('filter-repo').value;

            return tasks.filter(t => {
                const matchesAsignado = !asignado || (t.asignado_a || []).includes(asignado);
                const matchesRepo = !repo || t.repo === repo;
                return matchesAsignado && matchesRepo;
            });
        },

        renderBoard: (tasks) => {
            const columns = document.querySelectorAll('.kanban-column');
            columns.forEach(col => {
                const status = col.dataset.status;
                const list = col.querySelector('.kanban-cards-list');
                if (!list) return;

                const filtered = tasks.filter(t => t.estado === status);

                list.innerHTML = filtered.map(t => {
                    const isExpanded = kanbanUI.expandedCards.has(String(t.id));
                    return kanbanUI.renderCard(t, isExpanded);
                }).join('');

                // Attach events to newly created elements
                kanbanUI.attachEvents(list);
            });
        },

        renderCard: (task, isExpanded = false) => {
            const priorityColors = {
                'CRITICAL': 'badge-critical',
                'HIGH': 'bg-orange-500',
                'MEDIUM': 'bg-yellow-500',
                'LOW': 'bg-slate-500'
            };

            const statusBadgeColors = {
                'Pending': 'badge-pending',
                'BACKLOG': 'badge-pending',
                'TODO': 'badge-todo',
                'ToDo': 'badge-todo',
                'Working': 'badge-working',
                'WORKING': 'badge-working',
                'KO': 'badge-critical',
                'In Review': 'badge-review',
                'REVIEW': 'badge-review',
                'Fixed': 'badge-review',
                'OK': 'badge-ok',
                'DONE': 'badge-ok',
                'Closed': 'badge-ok',
                'Critical': 'badge-critical',
                'BLOCKED': 'badge-critical'
            };

            const priorityColor = priorityColors[task.prioridad] || 'bg-slate-500';
            const statusColor = statusBadgeColors[task.estado] || statusBadgeColors[task.status] || 'badge-todo';

            const statusBorderClasses = {
                'Pending': 'border-status-pending',
                'BACKLOG': 'border-status-pending',
                'Working': 'border-status-working',
                'WORKING': 'border-status-working',
                'KO': 'border-status-working',
                'In Review': 'border-status-review',
                'REVIEW': 'border-status-review',
                'Fixed': 'border-status-review',
                'OK': 'border-status-ok',
                'DONE': 'border-status-ok',
                'Closed': 'border-status-ok',
                'Critical': 'border-status-blocked',
                'BLOCKED': 'border-status-blocked',
                'ToDo': 'border-status-pending',
                'TODO': 'border-status-pending'
            };
            const borderClass = statusBorderClasses[task.estado] || statusBorderClasses[task.status] || 'border-slate-800';

            const alerts = window.taskEngine.computeAlerts(task);
            const alertHtml = alerts.map(a => `
                <div class="text-[9px] font-bold text-red-400 mt-1 uppercase">⚠️ ${a.message}</div>
            `).join('');

            const currentIdx = STATUS_FLOW.indexOf(task.estado);
            const nextStatus = STATUS_FLOW[(currentIdx + 1) % STATUS_FLOW.length];

            const parsedTitle = typeof marked !== 'undefined' ? marked.parseInline(task.titulo || task.title || '') : (task.titulo || task.title || '');
            const description = task.descripcion || task.description || '';
            const parsedDesc = typeof marked !== 'undefined' ? marked.parse(description) : description;

            // Branch Link Logic
            const repoFullName = task.repo || task.repository || '';
            const branchName = task.rama || task.branch || '';
            const branchUrl = (repoFullName && branchName) ? `https://github.com/${repoFullName}/tree/${branchName}` : '#';
            const displayRepo = (window.getRepoAlias ? window.getRepoAlias(repoFullName) : null) || repoFullName.split('/').pop() || '---';

            // Robot button action
            if (!window._openTaskInClaude) {
                window._openTaskInClaude = function(taskId) {
                    // Try different ways to find the task data
                    const task = (window.taskOps?.getTaskSync ? window.taskOps.getTaskSync(taskId) : null)
                                 || window._kanbanTasks?.find(t => String(t.id) === String(taskId))
                                 || (window.JulesPanelState?.tasks?.find(t => String(t.id) === String(taskId)));

                    if (!task) {
                        console.warn('[KANBAN] Task not found:', taskId);
                        return;
                    }

                    if (window.neuralSession?.open) {
                        window.neuralSession.open(task);
                    } else {
                        // Retry once after 800ms — covers late authReady initialization
                        setTimeout(() => {
                            if (window.neuralSession?.open) {
                                window.neuralSession.open(task);
                            } else {
                                console.error('[KANBAN] NeuralSessionPanel not available');
                                // Fallback to old behavior if everything fails
                                const url = `/chat/neural/?task_id=${taskId}&from=jules-panel`;
                                window.location.href = url;
                            }
                        }, 800);
                    }
                };
            }

            const displayStatus = {
                'BACKLOG': 'PENDING',
                'Pending': 'PENDING',
                'Working': 'WORKING',
                'WORKING': 'WORKING',
                'REVIEW': 'IN REVIEW',
                'In Review': 'IN REVIEW',
                'Fixed': 'IN REVIEW',
                'DONE': 'OK',
                'OK': 'OK',
                'Closed': 'OK',
                'ToDo': 'TODO',
                'TODO': 'TODO',
                'Critical': 'CRITICAL',
                'BLOCKED': 'CRITICAL'
            }[task.estado || task.status] || (task.estado || task.status || 'TODO').toUpperCase();

            if (!isExpanded) {
                // COLLAPSED CARD
                return `
                    <div class="session-card kanban-card mb-3 flex flex-col justify-between cursor-pointer border ${borderClass}"
                         data-id="${task.id}" data-action="toggle" role="button" tabindex="0">

                        <!-- Line 1: ID + Acciones + Status + Expand -->
                        <div class="flex justify-between items-center text-[10px] mb-2">
                            <div class="flex items-center gap-2">
                                <span class="font-mono text-slate-500 font-bold">#${task.id}</span>
                                <div class="flex gap-1.5">
                                    <button data-action="edit" data-id="${task.id}" class="text-slate-500 hover:text-white transition-colors" title="Editar">
                                        <i class="fas fa-pencil-alt"></i>
                                    </button>
                                    <button data-action="claude" data-id="${task.id}" class="text-slate-500 hover:text-[#bd93f9] transition-colors" title="Robot">
                                        <i class="fas fa-robot"></i>
                                    </button>
                                </div>
                                <span class="badge ${statusColor}">${displayStatus}</span>
                            </div>
                            <i class="fas fa-chevron-down text-slate-600 text-[10px]"></i>
                        </div>

                        <!-- Line 2: Título -->
                        <h4 class="py-1">
                            ${parsedTitle}
                        </h4>

                        <!-- Description (Always visible as requested) -->
                        ${description ? `<div class="task-description">${parsedDesc}</div>` : ''}

                        <!-- Sección -->
                        ${task.seccion ? `<div class="text-[9px] text-indigo-400/80 font-bold uppercase truncate mt-2">${task.seccion}</div>` : ''}

                        <!-- Line 3: Repo + Branch -->
                        <div class="flex justify-between items-center text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-800/50">
                            <span class="truncate max-w-[60%] text-slate-400"><i class="fas fa-folder opacity-50 mr-1"></i>${displayRepo}</span>
                            ${branchName ? `
                                <span class="text-[#bd93f9] font-mono flex items-center gap-1">
                                    <i class="fas fa-code-branch text-[8px]"></i> ${branchName}
                                </span>
                            ` : ''}
                        </div>
                    </div>
                `;
            } else {
                // EXPANDED CARD
                return `
                    <div class="session-card kanban-card mb-3 border ${borderClass}" data-id="${task.id}">
                        <!-- Header -->
                        <div class="flex justify-between items-start mb-3 cursor-pointer" data-action="toggle" data-id="${task.id}" role="button" tabindex="0">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-bold text-slate-500 font-mono">#${task.id}</span>
                                <div class="flex gap-1.5 mr-1">
                                    <button data-action="edit" data-id="${task.id}" class="text-slate-500 hover:text-white" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                                    <button data-action="claude" data-id="${task.id}" class="text-slate-500 hover:text-[#bd93f9]" title="Robot"><i class="fas fa-robot"></i></button>
                                </div>
                                <span class="badge ${statusColor}">${displayStatus}</span>
                                <span class="badge ${priorityColor} text-[8px] px-1.5 py-0.5 rounded uppercase font-bold">${task.prioridad}</span>
                            </div>
                            <i class="fas fa-chevron-up text-slate-600 text-[10px]"></i>
                        </div>

                        <!-- Título completo -->
                        <h4>${parsedTitle}</h4>

                        <!-- Descripción -->
                        ${description ? `<div class="task-description">${parsedDesc}</div>` : ''}

                        <!-- Fila: Metadata -->
                        <div class="flex flex-wrap gap-x-4 gap-y-2 mb-3 text-[10px] text-slate-500 border-t border-slate-800 pt-3 uppercase font-bold">
                            <span><span class="text-slate-600 mr-1">STAGE:</span> ${task.tema_principal || '---'}</span>
                            <span><span class="text-slate-600 mr-1">MIL.:</span> ${task.milestone || '---'}</span>
                            <span><span class="text-slate-600 mr-1">TYPE:</span> ${task.task_type || '---'}</span>
                            <span><span class="text-slate-600 mr-1">SECCIÓN:</span> ${task.seccion || '---'}</span>
                        </div>

                        <!-- Fila: Repo + Branch -->
                        <div class="flex justify-between items-center mb-4 text-[11px]">
                            <div class="text-slate-400 flex items-center gap-1">
                                <i class="fas fa-folder opacity-50"></i> ${displayRepo}
                            </div>
                            ${branchName ? `
                                <a href="${branchUrl}" target="_blank" class="text-[#bd93f9] hover:text-[#ff79c6] flex items-center gap-1 font-mono bg-[#bd93f9]/10 px-2 py-1 rounded transition-colors">
                                    <i class="fas fa-code-branch"></i> ${branchName}
                                </a>
                            ` : ''}
                        </div>

                        <!-- Tags -->
                        <div class="flex flex-wrap gap-1 mb-4">
                            ${(task.tags || []).map(tag => `
                                <span class="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">${tag}</span>
                            `).join('')}
                        </div>

                        <!-- Footer -->
                        <div class="flex justify-between items-end border-t border-slate-800 pt-3">
                            <div class="flex items-center gap-2">
                                <div class="flex -space-x-2">
                                    ${(task.asignado_a || []).map(a => `
                                        <div class="w-7 h-7 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden" title="${a}">
                                            <img src="https://github.com/${a}.png" onerror="this.style.display='none'" class="w-full h-full object-cover">
                                            <span class="absolute">${a.charAt(0)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                                ${task.estimated_hours ? `<span class="text-[10px] text-slate-500 ml-2 font-mono">${task.estimated_hours}h est.</span>` : ''}
                            </div>
                            <div class="flex gap-2">
                                <button data-action="claude" data-id="${task.id}" class="text-[10px] bg-[#bd93f9]/20 text-[#bd93f9] border border-[#bd93f9]/30 px-3 py-1.5 rounded hover:bg-[#bd93f9]/30 transition-all font-bold">
                                    🤖 ENVIAR A CLAUDE
                                </button>
                                <button data-action="move" data-id="${task.id}" data-next-status="${nextStatus}" class="w-8 h-8 flex items-center justify-center bg-slate-800 text-slate-400 border border-slate-700 rounded hover:bg-slate-700 transition-all">
                                    <i class="fas fa-arrow-right"></i>
                                </button>
                            </div>
                        </div>
                        ${alertHtml}
                    </div>
                `;
            }
        },

        moveTask: async (taskId, newStatus, btn) => {
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

            try {
                // Gap en paso 6: Verify write permissions
                const token = window.githubApi.getAuthToken();
                const repo = localStorage.getItem('github_repo') || 'hypenosys/hypenosys.github.io';
                const [owner, repoName] = repo.split('/');

                const permissionRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const repoData = await permissionRes.json();

                if (!repoData.permissions || !repoData.permissions.push) {
                    throw new Error("Token sin permisos de escritura en este repositorio.");
                }

                await window.taskOps.updateTask(taskId, { estado: newStatus });

                if (window.logHypenosysAction) {
                    window.logHypenosysAction('task_move', `Tarea ${taskId} movida a ${newStatus}`);
                }

                if (window.showToast) window.showToast(`Tarea ${taskId} movida a ${newStatus}`);

                // Refresh cemetery count in Jules Panel if active
                if (typeof window.renderCemeteryCount === 'function') {
                    window.renderCemeteryCount();
                    const cemeteryPanel = document.getElementById('cemetery-panel');
                    if (cemeteryPanel && !cemeteryPanel.classList.contains('hidden')) {
                        window.renderCemetery();
                    }
                }

                await kanbanUI.refresh();
            } catch (e) {
                console.error('[Kanban] Move failed:', e);
                if (window.showToast) window.showToast(e.message, 'error');
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        },

        updateAlerts: (tasks) => {
            const counter = document.getElementById('alert-counter');
            let totalAlerts = 0;
            tasks.forEach(t => {
                totalAlerts += window.taskEngine.computeAlerts(t).length;
            });

            if (totalAlerts > 0) {
                counter.classList.remove('hidden');
                counter.textContent = `${totalAlerts} ALERTAS`;
            } else {
                counter.classList.add('hidden');
            }
        }
    };

    window.kanbanUI = kanbanUI;
})();
