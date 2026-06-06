/**
 * Kanban UI Component - Renders and manages the board
 */

(function() {
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
            const color = priorityColors[task.prioridad] || 'bg-slate-500';
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

            return `
                <div class="session-card kanban-card mb-3 p-3" data-id="${task.id}" style="cursor: pointer;">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-[10px] font-bold text-slate-500">${task.id}</span>
                        <div class="flex gap-1">
                            <div class="w-3 h-3 rounded-full ${loop.color}" title="Loop Jules: ${task.jules_loop_estado}"></div>
                            <span class="badge ${color} text-white text-[9px] px-2 py-0.5 rounded">${task.prioridad}</span>
                        </div>
                    </div>
                    <h4 class="text-sm font-bold mb-2 line-clamp-2">${task.titulo}</h4>
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
                        ${task.jules_session_url ? `
                            <button onclick="window.open('${task.jules_session_url}', '_blank'); event.stopPropagation();" class="text-[9px] bg-purple-900/30 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded hover:bg-purple-900/50 transition-all">⚡ JULES</button>
                        ` : ''}
                    </div>
                    ${alertHtml}
                </div>
            `;
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
