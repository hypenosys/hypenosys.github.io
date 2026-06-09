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

        toggleCard: (taskId) => {
            const idStr = String(taskId);
            if (kanbanUI.expandedCards.has(idStr)) {
                kanbanUI.expandedCards.delete(idStr);
            } else {
                kanbanUI.expandedCards.add(idStr);
            }

            // Universal refresh trigger
            if (typeof refreshDashboard === 'function') {
                refreshDashboard();
            } else if (typeof renderKanbanBoard === 'function') {
                renderKanbanBoard();
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
                const filtered = tasks.filter(t => t.estado === status);

                list.innerHTML = filtered.map(t => {
                    const isExpanded = kanbanUI.expandedCards.has(String(t.id));
                    return kanbanUI.renderCard(t, isExpanded);
                }).join('');
            });
        },

        renderCard: (task, isExpanded = false) => {
            const priorityColors = {
                'CRITICAL': 'bg-red-500',
                'HIGH': 'bg-orange-500',
                'MEDIUM': 'bg-yellow-500',
                'LOW': 'bg-slate-500'
            };

            const statusBadgeColors = {
                'BACKLOG': 'bg-slate-600',
                'TODO': 'bg-yellow-600',
                'WORKING': 'bg-blue-600',
                'REVIEW': 'bg-purple-600',
                'DONE': 'bg-green-600',
                'BLOCKED': 'bg-red-600'
            };

            const priorityColor = priorityColors[task.prioridad] || 'bg-slate-500';
            const statusColor = statusBadgeColors[task.estado] || 'bg-slate-500';

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
                window._openTaskInClaude = async (taskId) => {
                    const tasks = await window.taskOps.getAllTasks();
                    const task = tasks.find(t => String(t.id) === String(taskId));
                    if (task) {
                        const payload = {
                            id: task.id,
                            titulo: task.titulo || task.title || '',
                            descripcion: task.descripcion || task.description || '',
                            acceptance_criteria: task.acceptance_criteria || '',
                            tags: task.tags || [],
                            prioridad: task.prioridad || task.priority || '',
                            asignados: task.asignado_a || task.asignados || [],
                            comments: task.comments || task.comentarios || [],
                            estimated_hours: task.estimated_hours || '',
                            story_points: task.story_points || '',
                            completitud: task.completitud || '',
                            start_date: task.start_date || '',
                            due_date: task.due_date || '',
                            milestone: task.milestone || '',
                            task_type: task.task_type || '',
                            tema_principal: task.tema_principal || '',
                            repositorio: task.repo || task.repository || '',
                            rama: task.rama || task.branch || '',
                            subtasks: task.subtasks || task.subtareas || [],
                            links: task.external_links || task.links || [],
                            bloqueada_por: task.blocked_by || task.bloqueada_por || [],
                            bloquea_a: task.blocks || task.bloquea_a || [],
                            jules_loop_estado: task.jules_loop_estado || (task.jules_session ? task.jules_session.status : ''),
                            jules_session_url: task.jules_session_url || (task.jules_session ? task.jules_session.session_url : '')
                        };
                        localStorage.setItem('claude_task_context', JSON.stringify(payload));
                    }
                    const url = `https://hypenosys.github.io/claude-chat.html?task_id=${taskId}&from=jules-panel`;
                    window.open(url, '_blank');
                };
            }

            if (!isExpanded) {
                // COLLAPSED CARD
                return `
                    <div class="session-card kanban-card mb-3 p-3 flex flex-col justify-between cursor-pointer border border-slate-800 hover:border-slate-700 transition-all"
                         style="height: 80px; overflow: hidden;" data-id="${task.id}"
                         onclick="window.kanbanUI.toggleCard('${task.id}')">

                        <!-- Line 1: ID + Acciones + Status + Expand -->
                        <div class="flex justify-between items-center text-[10px]">
                            <div class="flex items-center gap-2">
                                <span class="font-mono text-slate-500 font-bold">#${task.id}</span>
                                <div class="flex gap-1.5">
                                    <button onclick="event.stopPropagation(); openEditTaskModal('${task.id}')" class="text-slate-500 hover:text-white transition-colors" title="Editar">
                                        <i class="fas fa-pencil-alt"></i>
                                    </button>
                                    <button onclick="event.stopPropagation(); window._openTaskInClaude('${task.id}')" class="text-slate-500 hover:text-[#bd93f9] transition-colors" title="Robot">
                                        <i class="fas fa-robot"></i>
                                    </button>
                                </div>
                                <span class="badge ${statusColor} text-white text-[8px] px-1.5 py-0.5 rounded-full uppercase font-black tracking-tighter">${task.estado}</span>
                            </div>
                            <i class="fas fa-chevron-down text-slate-600 text-[10px]"></i>
                        </div>

                        <!-- Line 2: Título (truncado) -->
                        <h4 class="text-sm font-bold text-white truncate py-1 prose-invert">
                            ${parsedTitle}
                        </h4>

                        <!-- Line 3: Repo + Branch -->
                        <div class="flex justify-between items-center text-[10px] text-slate-500">
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
                    <div class="session-card kanban-card mb-3 p-4 shadow-lg border border-[#bd93f9]/30" data-id="${task.id}">
                        <!-- Header -->
                        <div class="flex justify-between items-start mb-3 cursor-pointer" onclick="window.kanbanUI.toggleCard('${task.id}')">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-bold text-slate-500 font-mono">#${task.id}</span>
                                <div class="flex gap-1.5 mr-1">
                                    <button onclick="event.stopPropagation(); openEditTaskModal('${task.id}')" class="text-slate-500 hover:text-white" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                                    <button onclick="event.stopPropagation(); window._openTaskInClaude('${task.id}')" class="text-slate-500 hover:text-[#bd93f9]" title="Robot"><i class="fas fa-robot"></i></button>
                                </div>
                                <span class="badge ${statusColor} text-white text-[8px] px-1.5 py-0.5 rounded-full uppercase font-black tracking-tighter">${task.estado}</span>
                                <span class="badge ${priorityColor} text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold">${task.prioridad}</span>
                            </div>
                            <i class="fas fa-chevron-up text-slate-600 text-[10px]"></i>
                        </div>

                        <!-- Título completo -->
                        <h4 class="text-base font-bold text-white mb-2 prose prose-invert">${parsedTitle}</h4>

                        <!-- Descripción -->
                        ${description ? `<div class="text-xs text-slate-400 mb-4 prose prose-invert max-w-full">${parsedDesc}</div>` : ''}

                        <!-- Fila: Metadata -->
                        <div class="flex flex-wrap gap-x-4 gap-y-2 mb-3 text-[10px] text-slate-500 border-t border-slate-800 pt-3 uppercase font-bold">
                            <span><span class="text-slate-600 mr-1">STAGE:</span> ${task.tema_principal || '---'}</span>
                            <span><span class="text-slate-600 mr-1">MIL.:</span> ${task.milestone || '---'}</span>
                            <span><span class="text-slate-600 mr-1">TYPE:</span> ${task.task_type || '---'}</span>
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
                                <button onclick="window._openTaskInClaude('${task.id}')" class="text-[10px] bg-[#bd93f9]/20 text-[#bd93f9] border border-[#bd93f9]/30 px-3 py-1.5 rounded hover:bg-[#bd93f9]/30 transition-all font-bold">
                                    🤖 ENVIAR A CLAUDE
                                </button>
                                <button onclick="window.kanbanUI.moveTask('${task.id}', '${nextStatus}', this)" class="w-8 h-8 flex items-center justify-center bg-slate-800 text-slate-400 border border-slate-700 rounded hover:bg-slate-700 transition-all">
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
