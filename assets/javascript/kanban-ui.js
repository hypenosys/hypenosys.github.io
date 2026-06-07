/**
 * Kanban UI Component - Renders and manages the board
 */

(function() {
    const STATUS_FLOW = ['BACKLOG', 'TODO', 'WORKING', 'REVIEW', 'DONE', 'BLOCKED'];

    const kanbanUI = {
        init: async () => {
            kanbanUI.bindEvents();
            await kanbanUI.refresh();
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

                list.innerHTML = filtered.map(t => kanbanUI.renderCard(t)).join('');
            });
        },

        renderCard: (task) => {
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

            const loopStates = {
                'sin_loop': { color: 'bg-slate-700', icon: 'fa-circle' },
                'esperando_plan': { color: 'bg-yellow-500 animate-pulse', icon: 'fa-brain' },
                'plan_aprobado': { color: 'bg-blue-500', icon: 'fa-check-double' },
                'ejecutando': { color: 'bg-green-500 animate-pulse', icon: 'fa-rocket' },
                'esperando_validacion': { color: 'bg-orange-500 animate-pulse', icon: 'fa-eye' },
                'completado': { color: 'bg-green-600', icon: 'fa-check-circle' }
            };
            const loop = loopStates[task.jules_loop_estado] || loopStates['sin_loop'];

            const currentIdx = STATUS_FLOW.indexOf(task.estado);
            const nextStatus = STATUS_FLOW[(currentIdx + 1) % STATUS_FLOW.length];

            const parsedTitle = typeof marked !== 'undefined' ? marked.parseInline(task.titulo) : task.titulo;
            const description = task.descripcion || task.description || '';
            const truncatedDesc = description.length > 80 ? description.substring(0, 77) + '...' : description;

            // Robot button action
            const openInClaude = (taskId) => {
                const url = `https://hypenosys.github.io/claude-chat.html?task_id=${taskId}&from=jules-panel`;
                window.open(url, '_blank');
            };
            // Expose to window for inline onclick
            window._openTaskInClaude = openInClaude;

            return `
                <div class="session-card kanban-card mb-3 p-3" data-id="${task.id}">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] font-bold text-slate-500">${task.id}</span>
                            <span class="badge ${statusColor} text-white text-[8px] px-1.5 py-0.5 rounded-full uppercase font-black tracking-tighter">${task.estado}</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <div class="w-3 h-3 rounded-full ${loop.color}" title="Loop Jules: ${task.jules_loop_estado}"></div>
                            <span class="badge ${color} text-white text-[9px] px-2 py-0.5 rounded">${task.prioridad}</span>
                        </div>
                    </div>
                    <h4 class="text-sm font-bold mb-1 line-clamp-2 prose prose-invert flex justify-between items-start gap-2">
                        <strong>${parsedTitle}</strong>
                        <button onclick="window._openTaskInClaude('${task.id}')"
                                class="btn-robot-task flex-shrink-0"
                                title="Abrir en Claude Chat"
                                style="background: transparent; border: 1px solid #bd93f9; color: #bd93f9; border-radius: 4px; padding: 2px 6px; font-size: 12px; cursor: pointer;">
                            🤖
                        </button>
                    </h4>
                    ${truncatedDesc ? `<p class="text-[11px] text-slate-400 mb-2 italic line-clamp-2">${truncatedDesc}</p>` : ''}
                    <div class="flex items-center gap-2 mb-2">
                        ${(task.asignado_a || []).map(a => `
                            <div class="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold" title="${a}">
                                ${a.charAt(0)}
                            </div>
                        `).join('')}
                    </div>
                    <div class="flex flex-wrap gap-1 mb-2">
                        ${(task.tags || []).map(tag => `
                            <span class="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">${tag}</span>
                        `).join('')}
                    </div>
                    <div class="flex justify-between items-center mt-3">
                        <div class="text-[10px] text-slate-400 flex items-center gap-1">
                            <i class="fas fa-code-branch opacity-50"></i> ${task.repo || '---'}
                        </div>
                        <div class="flex gap-1">
                            ${task.jules_session_url ? `
                                <button onclick="window.open('${task.jules_session_url}', '_blank'); event.stopPropagation();" class="text-[9px] bg-purple-900/30 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded hover:bg-purple-900/50 transition-all">⚡ JULES</button>
                            ` : ''}
                            <button onclick="window.kanbanUI.moveTask('${task.id}', '${nextStatus}', this)" class="text-[9px] bg-slate-700 text-slate-300 border border-slate-600 px-2 py-0.5 rounded hover:bg-slate-600 transition-all">MOVER →</button>
                        </div>
                    </div>
                    ${alertHtml}
                </div>
            `;
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
