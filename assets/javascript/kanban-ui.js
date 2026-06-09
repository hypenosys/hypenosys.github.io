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
            if (kanbanUI.expandedCards.has(taskId)) {
                kanbanUI.expandedCards.delete(taskId);
            } else {
                kanbanUI.expandedCards.add(taskId);
            }
            kanbanUI.refresh();
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

            const color = priorityColors[task.prioridad] || 'bg-slate-500';
            const statusColor = statusBadgeColors[task.estado] || 'bg-slate-500';

            const alerts = window.taskEngine.computeAlerts(task);
            const alertHtml = alerts.map(a => `
                <div class="text-[9px] font-bold text-red-400 mt-1 uppercase">⚠️ ${a.message}</div>
            `).join('');

            const currentIdx = STATUS_FLOW.indexOf(task.estado);
            const nextStatus = STATUS_FLOW[(currentIdx + 1) % STATUS_FLOW.length];

            const parsedTitle = typeof marked !== 'undefined' ? marked.parseInline(task.titulo) : task.titulo;
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
                            titulo: task.titulo || task.title || '',
                            descripcion: task.descripcion || task.description || '',
                            acceptance_criteria: task.acceptance_criteria || '',
                            tags: task.tags || [],
                            prioridad: task.prioridad || '',
                            asignados: task.asignado_a || task.asignados || [],
                            comments: task.comments || [],
                            estimated_hours: task.estimated_hours || '',
                            repositorio: task.repo || task.repository || '',
                            rama: task.rama || task.branch || ''
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
                    <div class="session-card kanban-card mb-3 p-3 flex flex-col justify-between" style="height: 80px; overflow: hidden;" data-id="${task.id}">
                        <div class="flex justify-between items-center text-[10px]">
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-slate-500">#${task.id}</span>
                                <div class="flex gap-1">
                                    <button onclick="event.stopPropagation(); openEditTaskModal('${task.id}')" class="text-slate-400 hover:text-white" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                                    <button onclick="event.stopPropagation(); window._openTaskInClaude('${task.id}')" class="text-slate-400 hover:text-[#bd93f9]" title="Robot"><i class="fas fa-robot"></i></button>
                                </div>
                                <span class="badge ${statusColor} text-white text-[8px] px-1.5 py-0.5 rounded-full uppercase font-black tracking-tighter">${task.estado}</span>
                            </div>
                            <button onclick="kanbanUI.toggleCard('${task.id}')" class="text-slate-500 hover:text-white"><i class="fas fa-chevron-down"></i></button>
                        </div>
                        <h4 class="text-sm font-bold text-white truncate my-1 prose-invert">
                            ${parsedTitle}
                        </h4>
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
                    <div class="session-card kanban-card mb-3 p-4" data-id="${task.id}" style="border-color: var(--accent);">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] font-bold text-slate-500">#${task.id}</span>
                                <div class="flex gap-1">
                                    <button onclick="event.stopPropagation(); openEditTaskModal('${task.id}')" class="text-slate-400 hover:text-white" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                                    <button onclick="event.stopPropagation(); window._openTaskInClaude('${task.id}')" class="text-slate-400 hover:text-[#bd93f9]" title="Robot"><i class="fas fa-robot"></i></button>
                                </div>
                                <span class="badge ${statusColor} text-white text-[8px] px-1.5 py-0.5 rounded-full uppercase font-black tracking-tighter">${task.estado}</span>
                                <span class="badge ${color} text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-bold">${task.prioridad}</span>
                            </div>
                            <button onclick="kanbanUI.toggleCard('${task.id}')" class="text-slate-500 hover:text-white"><i class="fas fa-chevron-up"></i></button>
                        </div>

                        <h4 class="text-base font-bold text-white mb-2 prose prose-invert">${parsedTitle}</h4>

                        ${description ? `<div class="text-xs text-slate-400 mb-4 prose prose-invert max-w-full">${parsedDesc}</div>` : ''}

                        <div class="flex flex-wrap gap-x-4 gap-y-2 mb-3 text-[10px] text-slate-500 border-t border-slate-800 pt-3">
                            <span><strong class="text-slate-400 uppercase">Stage:</strong> ${task.tema_principal || '---'}</span>
                            <span><strong class="text-slate-400 uppercase">Milestone:</strong> ${task.milestone || '---'}</span>
                            <span><strong class="text-slate-400 uppercase">Type:</strong> ${task.task_type || '---'}</span>
                        </div>

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

                        <div class="flex flex-wrap gap-1 mb-4">
                            ${(task.tags || []).map(tag => `
                                <span class="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">${tag}</span>
                            `).join('')}
                        </div>

                        <div class="flex justify-between items-end border-t border-slate-800 pt-3">
                            <div class="flex items-center gap-2">
                                <div class="flex -space-x-2">
                                    ${(task.asignado_a || []).map(a => `
                                        <div class="w-7 h-7 rounded-full bg-purple-600 border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-white" title="${a}">
                                            ${a.charAt(0)}
                                        </div>
                                    `).join('')}
                                </div>
                                ${task.estimated_hours ? `<span class="text-[10px] text-slate-500 ml-2">Est: ${task.estimated_hours}h</span>` : ''}
                            </div>
                            <div class="flex gap-2">
                                <button onclick="window._openTaskInClaude('${task.id}')" class="text-[10px] bg-[#bd93f9]/20 text-[#bd93f9] border border-[#bd93f9]/30 px-3 py-1.5 rounded hover:bg-[#bd93f9]/30 transition-all font-bold">
                                    🤖 ENVIAR A CLAUDE
                                </button>
                                <button onclick="window.kanbanUI.moveTask('${task.id}', '${nextStatus}', this)" class="w-8 h-8 flex items-center justify-center bg-slate-700 text-slate-300 border border-slate-600 rounded hover:bg-slate-600 transition-all">
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
