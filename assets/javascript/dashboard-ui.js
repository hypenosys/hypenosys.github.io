/**
 * Módulo de Interfaz de Usuario del Dashboard de Hypenosys
 * Se encarga de coordinar la renderización de todos los componentes visuales.
 */

/**
 * Renderiza el dashboard completo invocando de forma segura cada subcomponente.
 * Utiliza ErrorBoundary para aislar fallos en componentes individuales.
 */
function renderDashboard() {
  const eb = window.ErrorBoundary;

  eb.safeInvoke('header-status-slot', 'Workspace Selector', renderWorkspaceSelector);
  eb.safeInvoke('local-kanban-actions', 'Local Actions', renderLocalWorkspaceActions);
  eb.safeInvoke('member-filters', 'Member Toggles', renderMemberToggles);
  eb.safeInvoke('kanban-filter-bar', 'Kanban Filters', renderKanbanFilters);
  eb.safeInvoke('jules-dashboard-sessions', 'Jules Badges', updateJulesBadges);
  eb.safeInvoke('jules-dashboard-sessions', 'Jules Sessions', renderJulesSessions);
  eb.safeInvoke('stat-total-tasks', 'Stats Summary', renderStatsSummary);
  eb.safeInvoke('kanban-board', 'Kanban Board', renderKanbanBoard);
  eb.safeInvoke('group-stats-section', 'Group Stats', renderGroupStats);
  eb.safeInvoke('group-burnout-index', 'Burnout Gauge', renderBurnoutGauge);
  eb.safeInvoke('group-velocity-chart', 'Budget Chart', renderBudgetChart);
  eb.safeInvoke('hof-current-winners', 'Hall of Fame', renderHallOfFame);
  eb.safeInvoke('current-milestone-label', 'Milestone Progress', renderMilestoneProgress);
  eb.safeInvoke('team-profiles-grid', 'Team Profiles', renderTeamProfiles);
  eb.safeInvoke('archived-tasks-grid', 'Task Archive', renderTaskArchive);

  // Parte 2 — Pipeline de Producción
  eb.safeInvoke('critical-path-panel', 'Critical Path Alerts', renderCriticalPathAlerts);
  eb.safeInvoke('pipeline-swimlanes', 'Pipeline Swimlanes', renderPipelineSwimlanes);
  eb.safeInvoke('milestone-burndown-chart', 'Milestone Burndown Chart', renderMilestoneBurndownChart);
  eb.safeInvoke('dependency-graph-container', 'Dependency Graph', renderDependencyGraph);
  eb.safeInvoke('velocity-tracker-chart', 'Velocity Tracker Chart', renderVelocityTrackerChart);
}

/**
 * Renderiza el resumen de estadísticas globales (total, completadas, ratio).
 */
function renderStatsSummary() {
  const tasks = getFilteredTasks(currentTasks);
  const activeTasksCount = tasks.filter(t => !['OK', 'Closed', 'Obsolete'].includes(t.estado)).length;
  const completedTasksCount = tasks.filter(t => ['OK', 'Closed'].includes(t.estado)).length;

  document.getElementById('stat-total-tasks').textContent = activeTasksCount;
  document.getElementById('stat-ok-tasks').textContent    = completedTasksCount;

  const ratio = window.githubApi.computeFixedFoundRatio(tasks);
  document.getElementById('stat-fixed-ratio').textContent = `${(ratio * 100).toFixed(2)}%`;
}

/**
 * Renderiza los selectores de filtrado por miembro del equipo.
 */
function renderMemberToggles() {
  const container = document.getElementById('member-filters');
  if (!container) return;
  container.innerHTML = '';

  const baseClasses = "font-bold rounded-md transition-all whitespace-nowrap";
  const mobileClasses = "px-2 py-1 text-xs";
  const desktopClasses = "lg:px-3 lg:py-1 lg:text-sm";

  const allBtn = document.createElement('button');
  allBtn.textContent = '👥 Todos';
  allBtn.className = (activeFilter === null && activeStageFilter === null)
    ? `${baseClasses} ${mobileClasses} ${desktopClasses} bg-emerald-500 text-slate-950`
    : `${baseClasses} ${mobileClasses} ${desktopClasses} text-slate-400 hover:text-white hover:bg-slate-800`;

  allBtn.addEventListener('click', () => {
    activeFilter = null;
    activeStageFilter = null;
    renderDashboard();
  });
  container.appendChild(allBtn);

  for (const member of MEMBERS) {
    const btn = document.createElement('button');
    btn.textContent = member;
    btn.className = activeFilter === member
      ? `${baseClasses} ${mobileClasses} ${desktopClasses} bg-emerald-500 text-slate-950`
      : `${baseClasses} ${mobileClasses} ${desktopClasses} text-slate-400 hover:text-white hover:bg-slate-800`;

    btn.addEventListener('click', () => {
      activeFilter = (activeFilter === member) ? null : member;
      renderDashboard();
    });
    container.appendChild(btn);
  }
}

/**
 * Renderiza la sección Hall of Fame con los ganadores del milestone actual.
 */
function renderHallOfFame() {
  const container = document.getElementById('hof-current-winners');
  if (!container) return;

  const hof = currentStats?.hall_of_fame || {};
  const currentMilestone = hof.current_milestone || {};
  const winners = currentMilestone.winners || {};

  container.innerHTML = '';

  const CATEGORIES = [
      { id: 'mvp',           label: 'Milestone MVP', icon: '🏆', color: 'text-amber-400',  metric: 'pts' },
      { id: 'bug_slayer',    label: 'Bug Slayer',    icon: '🐛', color: 'text-red-400',    metric: 'bugs' },
      { id: 'unblocker',     label: 'Unblocker',     icon: '🔗', color: 'text-indigo-400', metric: 'tasks' },
      { id: 'velocity_king', label: 'Velocity King', icon: '⚡', color: 'text-amber-400',  metric: 'sp/d' },
      { id: 'researcher',    label: 'Researcher',    icon: '🧪', color: 'text-purple-400', metric: 'tasks' },
      { id: 'art_lead',      label: 'Art Lead',      icon: '🎨', color: 'text-emerald-400',metric: 'tasks' },
      { id: 'collaborator',  label: 'Collaborator',  icon: '💬', color: 'text-blue-400',   metric: 'comms' }
  ];

  CATEGORIES.forEach(cat => {
      const winner = winners[cat.id];
      const card = document.createElement('div');

      if (winner) {
          const memberStats = (currentStats.members || {})[winner.handle] || {};
          const distinctiveBadge = getDistinctiveBadge(memberStats);

          card.className = 'bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center text-center group hover:border-indigo-500/50 transition-all cursor-pointer';
          card.onclick = (event) => {
              if (event) event.stopPropagation();
              openDeepDiveModal(winner.name);
          };

          card.innerHTML = `
              <div class="text-2xl mb-2">${cat.icon}</div>
              <div class="text-[9px] font-black ${cat.color} uppercase tracking-tighter mb-1">${cat.label}</div>
              <img src="https://github.com/${winner.handle}.png" class="w-12 h-12 rounded-full border-2 border-slate-800 mb-2 group-hover:scale-110 transition-transform shadow-lg">
              <div class="text-xs font-bold text-white mb-1 truncate w-full">${winner.name}</div>
              ${distinctiveBadge ? `<div class="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-1 italic opacity-80">${distinctiveBadge.label}</div>` : ''}
              <div class="text-[10px] font-mono text-slate-500">${winner.value.toFixed(1)} ${cat.metric}</div>
          `;
      } else {
          card.className = 'bg-slate-900/50 border border-slate-800 border-dashed rounded-2xl p-4 flex flex-col items-center text-center opacity-50 grayscale';
          card.innerHTML = `
              <div class="text-2xl mb-2 opacity-30">${cat.icon}</div>
              <div class="text-[9px] font-black text-slate-600 uppercase tracking-tighter mb-1">${cat.label}</div>
              <div class="w-12 h-12 rounded-full border-2 border-slate-800 bg-slate-800 flex items-center justify-center mb-2">
                  <i class="fa-solid fa-user-secret text-slate-700"></i>
              </div>
              <div class="text-[10px] font-bold text-slate-600 italic leading-tight">Sin datos aún para este milestone</div>
          `;
      }
      container.appendChild(card);
  });
}

/**
 * Renderiza el progreso del milestone actual.
 */
function renderMilestoneProgress() {
  if (!currentBudget) return;
  const milId = currentBudget.burnout?.current_milestone || 'M1';
  const mil = (currentBudget.burnout?.milestones || []).find(m => m.id === milId);
  if (!mil) return;

  const tasks = currentTasks.filter(t => t.milestone === milId);
  const total = tasks.length;
  const ok = tasks.filter(t => t.estado === 'OK').length;
  const pct = total > 0 ? (ok / total) * 100 : 0;

  document.getElementById('current-milestone-label').textContent = milId;
  document.getElementById('milestone-progress-bar').style.width = `${pct}%`;
  document.getElementById('milestone-pct-label').textContent = `${pct.toFixed(0)}% completado`;
  document.getElementById('milestone-start').textContent = mil.date_start;
  document.getElementById('milestone-end').textContent = mil.date_end;
}

/**
 * Genera alertas automáticas basadas en la "ruta crítica" (tareas críticas pendientes, fechas superadas, etc.).
 */
function renderCriticalPathAlerts() {
  const panel = document.getElementById('critical-path-panel');
  if (!panel) return;
  panel.innerHTML = '';

  const isCollapsed = localStorage.getItem('alerts_panel_collapsed') === 'true';
  const alerts = [];
  const today = new Date().toISOString().split('T')[0];

  // Las alertas críticas se calculan sobre TODAS las tareas, independientemente de filtros.
  const tasksToAnalyze = currentTasks;

  tasksToAnalyze.forEach(t => {
    if (t.estado === 'Obsolete' || t.estado === 'OK' || t.estado === 'Closed') return;

    const estado = t.estado === '?' ? 'In Review' : (t.estado || 'Pending');

    if (t.prioridad === 'Critical' && ['Pending', 'ToDo', 'Working'].includes(estado)) {
      alerts.push({ type: 'error', msg: `TAREA CRÍTICA PENDIENTE: #${t.id} - ${t.descripcion}`, taskId: t.id });
    }
    if (t.limite && t.limite < today) {
      alerts.push({ type: 'warning', msg: `FECHA LÍMITE SUPERADA: #${t.id} - ${t.descripcion}`, taskId: t.id });
    }
    if (estado === 'Working' && (!t.asignados || t.asignados.length === 0)) {
      alerts.push({ type: 'info', msg: `TAREA EN PROGRESO SIN ASIGNAR: #${t.id} - ${t.descripcion}`, taskId: t.id });
    }
    if (estado === 'KO') {
        alerts.push({ type: 'error', msg: `TAREA EN ESTADO KO: #${t.id} - ${t.descripcion}`, taskId: t.id });
    }
  });

  const burnoutIndex = window.githubApi.computeBurnoutIndex(
    currentTasks,
    currentBudget?.burnout?.current_milestone || 'M1',
    currentBudget?.burnout?.milestones?.find(m => m.id === (currentBudget?.burnout?.current_milestone || 'M1'))?.date_start,
    currentBudget?.burnout?.milestones?.find(m => m.id === (currentBudget?.burnout?.current_milestone || 'M1'))?.date_end
  );

  if (burnoutIndex > 0.7) {
    alerts.push({ type: 'error', msg: `⚠ ALTA PRESIÓN: El Stress Index es del ${(burnoutIndex * 100).toFixed(1)}%. Se recomienda revisar la carga de trabajo.`, taskId: null });
  }

  if (alerts.length > 0) {
    panel.classList.remove('hidden');

    if (isCollapsed) {
        const bar = document.createElement('div');
        bar.className = 'bg-slate-900 border border-slate-800 rounded-xl p-2 flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-all';
        bar.onclick = (event) => {
            if (event) event.stopPropagation();
            toggleAlertsPanel();
        };
        bar.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="bg-red-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full pulse-emerald">${alerts.length}</span>
                <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Alertas de Ruta Crítica activas</span>
            </div>
            <i class="fa-solid fa-chevron-down text-slate-600 mr-2"></i>
        `;
        panel.appendChild(bar);
    } else {
        const header = document.createElement('div');
        header.className = 'flex justify-between items-center mb-2 px-2';
        header.innerHTML = `
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Panel de Alertas Críticas</span>
            <button onclick="toggleAlertsPanel()" class="text-slate-500 hover:text-white transition-colors text-xs flex items-center gap-1">
                <i class="fa-solid fa-chevron-up"></i> Colapsar
            </button>
        `;
        panel.appendChild(header);

        alerts.forEach(a => {
          const div = document.createElement('div');
          const colors = { error: 'bg-red-900/30 border-red-500 text-red-200', warning: 'bg-amber-900/30 border-amber-500 text-amber-200', info: 'bg-indigo-900/30 border-indigo-500 text-indigo-200' };
          div.className = `p-4 rounded-xl border-l-4 flex justify-between items-center ${colors[a.type]}`;
          div.innerHTML = `
            <span class="text-sm font-bold flex items-center gap-2">
              <i class="fa-solid ${a.type === 'error' ? 'fa-circle-exclamation' : a.type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>
              ${a.msg}
            </span>
            ${a.taskId ? `<button onclick="scrollToTask('${String(a.taskId)}')" class="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all uppercase">Ver Tarea</button>` : ''}
          `;
          panel.appendChild(div);
        });
    }
  } else {
    panel.classList.add('hidden');
  }
}

/**
 * Alterna el estado colapsado/expandido del panel de alertas.
 */
function toggleAlertsPanel() {
    const current = localStorage.getItem('alerts_panel_collapsed') === 'true';
    localStorage.setItem('alerts_panel_collapsed', !current);
    renderCriticalPathAlerts();
}

/**
 * Desplaza la vista hasta una tarea específica y la resalta temporalmente.
 * Garantiza que la tarea esté visible eliminando filtros y expandiendo la tarjeta.
 * @param {string|number} id ID de la tarea.
 */
function scrollToTask(id) {
  // 1. Limpiar filtros globales para asegurar que la tarea se renderice
  activeFilter = null;
  activeStageFilter = null;
  kanbanFilters = {
    tags: [],
    members: [],
    repos: [],
    states: [],
    milestones: [],
    themes: [],
    priorities: [],
    sections: []
  };

  // 2. Forzar expansión de la tarea
  localStorage.setItem(`task_minimized_${String(id)}`, 'false');

  // 3. Re-renderizar el dashboard
  renderDashboard();

  // 4. Esperar al siguiente frame para asegurar que el DOM esté listo
  requestAnimationFrame(() => {
    setTimeout(() => {
      const card = document.getElementById(`card-${id}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('ring-4', 'ring-emerald-500', 'ring-offset-4', 'ring-offset-slate-950');
        setTimeout(() => {
          card.classList.remove('ring-4', 'ring-emerald-500', 'ring-offset-4', 'ring-offset-slate-950');
        }, 3000);
      } else {
        console.warn(`[DASHBOARD] No se pudo encontrar la tarjeta card-${id} tras re-renderizar.`);
      }
    }, 100);
  });
}

/**
 * Renderiza el listado de tareas archivadas (en el Cementerio).
 */
function renderTaskArchive() {
    const grid = document.getElementById('archived-tasks-grid');
    const countEl = document.getElementById('archive-count');
    if (!grid || !countEl) return;

    countEl.textContent = `${archivedTasks.length} Tareas`;
    grid.innerHTML = '';

    archivedTasks.sort((a, b) => b.id - a.id).forEach(task => {
        const card = document.createElement('div');
        card.className = 'bg-slate-950/50 p-4 rounded-xl border border-slate-800 flex flex-col gap-2 group hover:border-slate-700 transition-all';

        const estado = task.estado === '?' ? 'In Review' : (task.estado || 'Pending');
        const stateInfo = STATE_CONFIG[estado] || { color: 'bg-slate-700', label: estado };

        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-2">
                    <span class="text-[9px] font-mono text-slate-600">#${task.id}</span>
                    <span class="text-[8px] font-bold px-1.5 py-0.5 rounded ${stateInfo.color} opacity-60">${stateInfo.label}</span>
                </div>
                <button onclick="handleRestoreTask('${task.id}')" class="action-btn text-emerald-500 hover:text-emerald-400 font-bold" title="Resucitar Tarea">
                    <i class="fa-solid fa-hand-holding-heart"></i> <span class="text-[8px] ml-1">RESUCITAR</span>
                </button>
            </div>
            <p class="text-xs text-slate-300 font-bold truncate">${task.title || task.descripcion}</p>
            <p class="text-[10px] text-slate-500 line-clamp-1">${task.title ? task.descripcion : ''}</p>
            <div class="flex justify-between items-center mt-2 border-t border-slate-800 pt-2">
                <span class="text-[8px] text-slate-600 font-mono">${task.fecha}</span>
                <span class="text-[8px] text-slate-600 font-bold uppercase">${task.tema_principal}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

/**
 * Alterna el colapso de la sección de archivo.
 */
function toggleArchiveCollapse() {
    const content = document.getElementById('archive-content');
    const chevron = document.getElementById('archive-chevron');
    const section = document.getElementById('task-archive-section');

    const isHidden = content.classList.contains('hidden');
    if (isHidden) {
        content.classList.remove('hidden');
        chevron.classList.replace('fa-chevron-down', 'fa-chevron-up');
        section.classList.remove('opacity-60');
        section.classList.add('opacity-100');
    } else {
        content.classList.add('hidden');
        chevron.classList.replace('fa-chevron-up', 'fa-chevron-down');
        section.classList.add('opacity-60');
    }
}

/**
 * Renderiza las sesiones activas de Jules en el dashboard.
 */
function renderJulesSessions() {
    const container = document.getElementById('jules-dashboard-sessions');
    if (!container) return;

    const cachedSessions = JSON.parse(localStorage.getItem('jules_sessions_cache') || '[]');
    const archivedIds = new Set(JSON.parse(localStorage.getItem('jules_archived_ids') || '[]'));
    const cemeteryIds = new Set(JSON.parse(localStorage.getItem('jules_cemetery_ids') || '[]'));

    const sessions = cachedSessions.filter(s => {
        const id = s.name.split('/').pop();
        return !archivedIds.has(id) && !cemeteryIds.has(id);
    });

    if (sessions.length === 0) {
        container.innerHTML = '<div class="col-span-full text-center py-8 opacity-40 italic text-sm">No hay sesiones activas.</div>';
        return;
    }

    container.innerHTML = sessions.map(s => {
        const id = s.name.split('/').pop();
        const state = s.state || 'QUEUED';
        const title = s.title || (s.prompt.length > 40 ? s.prompt.substring(0, 37) + '...' : s.prompt);

        const stateColors = {
            'COMPLETED': 'text-emerald-400 border-emerald-500/30',
            'FAILED': 'text-red-400 border-red-500/30',
            'IN_PROGRESS': 'text-blue-400 border-blue-500/30',
            'PAUSED': 'text-slate-400 border-slate-500/30',
            'AWAITING_PLAN_APPROVAL': 'text-amber-400 border-amber-500/30'
        };

        return `
            <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 group hover:border-indigo-500/50 transition-all">
                <div class="flex justify-between items-start">
                    <span class="text-[9px] font-mono text-slate-600">#${id}</span>
                    <div class="flex gap-1">
                        <button onclick="event.stopPropagation(); handleDashboardJulesArchive('${id}')" class="action-btn action-btn--secondary text-slate-500 hover:text-emerald-400" title="Archivar">
                            <i class="fa-solid fa-box-archive text-xs"></i>
                        </button>
                        <button onclick="event.stopPropagation(); handleDashboardJulesCemetery('${id}')" class="action-btn action-btn--secondary text-slate-500 hover:text-red-400" title="Al Cementerio">
                            <i class="fa-solid fa-tombstone text-xs"></i>
                        </button>
                    </div>
                </div>
                <h4 class="text-xs font-bold text-slate-200 line-clamp-2 h-8">${title}</h4>
                <div class="flex justify-between items-center mt-2 border-t border-slate-800 pt-2">
                    <span class="text-[9px] font-bold uppercase tracking-tighter ${stateColors[state] || 'text-slate-500'}">
                        ${state.replace(/_/g, ' ')}
                    </span>
                    <a href="/jules-panel/" class="text-[9px] font-bold text-indigo-400 hover:underline">CONTROL →</a>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Actualiza los badges de estado de Jules en las tarjetas Kanban activas.
 */
function updateJulesBadges() {
    const cachedSessions = JSON.parse(localStorage.getItem('jules_sessions_cache') || '[]');
    currentTasks.forEach(t => {
        if (t.jules_session_id) {
            const el = document.getElementById(`jules-status-${String(t.id)}`);
            if (el) {
                const session = cachedSessions.find(s => s.name.endsWith(t.jules_session_id));
                el.textContent = session ? session.state.replace(/_/g, ' ') : 'Desconocido';
                if (session && ['PLANNING', 'IN_PROGRESS'].includes(session.state)) {
                    el.classList.add('animate-pulse');
                }
            }
        }
    });
}

/**
 * Renderiza el estado y avatar del usuario en el encabezado.
 * @param {Object} user Información del usuario autenticado.
 */
function renderUserStatus(user) {
  if (!user) return;

  const desktop = document.getElementById('user-status');
  const mobile = document.getElementById('user-status-mobile');
  const avatarHtml = window.HypenosysUI.renderAvatar(user);

  const dropdownHtml = (idSuffix) => `
    <div class="relative inline-block text-left" id="user-dropdown-container-${idSuffix}">
      <button type="button" class="flex items-center gap-3 focus:outline-none" id="user-menu-button-${idSuffix}">
        <span class="text-xs font-bold text-slate-400 hidden xl:inline">${user.login}</span>
        <div class="relative">
          ${avatarHtml}
          <span class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
        </div>
      </button>

      <div id="user-menu-${idSuffix}" class="hidden absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl bg-slate-900 border border-slate-800 shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none overflow-hidden" role="menu" aria-orientation="vertical" aria-labelledby="user-menu-button-${idSuffix}" tabindex="-1">
        <div class="py-1" role="none">
          <button onclick="if(window.profileEditor) window.profileEditor.openModal(); else if(window.authManager) window.authManager.showProfileModal();" class="flex items-center w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors" role="menuitem">
            <i class="fas fa-user fa-sm fa-fw mr-3 text-indigo-400"></i> Mi Perfil
          </button>
          <button onclick="window.authManager.showApiConfigModal()" class="flex items-center w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors" role="menuitem">
            <i class="fas fa-key fa-sm fa-fw mr-3 text-indigo-400"></i> Configuración API
          </button>
          <button onclick="window.authManager.showSettingsModal()" class="flex items-center w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors" role="menuitem">
            <i class="fas fa-cog fa-sm fa-fw mr-3 text-indigo-400"></i> Ajustes Avanzados
          </button>
          <div class="border-t border-slate-800 my-1"></div>
          <button onclick="window.authManager.logout()" class="flex items-center w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-red-400 transition-colors" role="menuitem">
            <i class="fas fa-sign-out-alt fa-sm fa-fw mr-3 text-indigo-400"></i> Cerrar Sesión
          </button>
        </div>
      </div>
    </div>
  `;

  if (desktop) {
    desktop.innerHTML = dropdownHtml('desktop');
    setupDropdownToggle('desktop');
  }

  if (mobile) {
    mobile.innerHTML = dropdownHtml('mobile');
    setupDropdownToggle('mobile');
  }
}

/**
 * Configura el comportamiento del menú desplegable de usuario.
 */
function setupDropdownToggle(idSuffix) {
  const btn = document.getElementById(`user-menu-button-${idSuffix}`);
  const menu = document.getElementById(`user-menu-${idSuffix}`);

  if (!btn || !menu) return;

  btn.onclick = (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  };

  if (!window._dropdownGlobalListener) {
    document.addEventListener('click', (e) => {
      document.querySelectorAll('[id^="user-menu-"]').forEach(m => {
        const suffix = m.id.replace('user-menu-', '');
        const b = document.getElementById(`user-menu-button-${suffix}`);
        if (b && !b.contains(e.target) && !m.contains(e.target)) {
          m.classList.add('hidden');
        }
      });
    }, { passive: true });
    window._dropdownGlobalListener = true;
  }
}

/**
 * Muestra una notificación toast en pantalla.
 * @param {string} mensaje Texto de la notificación.
 * @param {string} [tipo='info'] Tipo de toast ('success', 'error', 'info', 'warning').
 * @param {number} [duracionMs=4000] Tiempo visible en milisegundos.
 */
function showToast(mensaje, tipo = 'info', duracionMs = 4000) {
  if (window.hypeToast) {
    window.hypeToast(mensaje, tipo, duracionMs);
  } else {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed bottom-4 right-4 flex flex-col gap-2 z-50';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
    const colors = { success: 'border-emerald-500 text-emerald-400', error: 'border-red-500 text-red-400', info: 'border-indigo-500 text-indigo-400', warning: 'border-amber-500 text-amber-400' };

    toast.className = `toast bg-slate-900 border-l-4 p-4 rounded-xl shadow-2xl flex items-center gap-3 min-w-[300px] ${colors[tipo]}`;
    toast.innerHTML = `<i class="fa-solid ${icons[tipo]} text-xl"></i> <span class="text-sm font-semibold text-slate-100">${mensaje}</span>`;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast--visible'));
    setTimeout(() => {
      toast.classList.remove('toast--visible');
      toast.addEventListener('transitionend', () => toast.remove());
    }, duracionMs);
  }
}

/**
 * Inicializa los oyentes de eventos globales para el dashboard.
 */
function setupEventListeners() {
  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('lightbox-modal');
    if (modal && !modal.classList.contains('hidden')) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') navigateLightbox(-1);
        if (e.key === 'ArrowRight') navigateLightbox(1);
    }
  });

  const taskCancel = document.getElementById('task-cancel-btn');
  const taskSave = document.getElementById('task-save-btn');
  const qaCancel = document.getElementById('qa-cancel-btn');
  const assignCancel = document.getElementById('assignment-cancel-btn');

  if (taskCancel) {
      taskCancel.onclick = () => {
          document.getElementById('create-task-modal').classList.add('hidden');
          pendingImages.forEach(img => { if (img.localUrl) URL.revokeObjectURL(img.localUrl); });
          pendingImages = [];
      };
  }
  if (taskSave) taskSave.onclick = handleCreateTask;

  const tagInput = document.getElementById('task-tags-input');
  if (tagInput) {
      tagInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
              e.preventDefault();
              handleAddTag();
          }
      });
  }

  const acceptanceInput = document.getElementById('task-acceptance-input');
  if (acceptanceInput) {
      const updatePreview = () => {
          const preview = document.getElementById('task-acceptance-preview');
          if (acceptanceInput.value.trim()) {
              preview.classList.remove('hidden');
              preview.innerHTML = marked.parse(acceptanceInput.value);
          } else {
              preview.classList.add('hidden');
          }
      };
      acceptanceInput.addEventListener('input', updatePreview);
      acceptanceInput.addEventListener('change', updatePreview);
  }

  if (qaCancel) qaCancel.onclick = () => document.getElementById('qa-assignment-modal').classList.add('hidden');
  if (assignCancel) assignCancel.onclick = () => document.getElementById('assignment-modal').classList.add('hidden');

  const fileInput = document.getElementById('task-image-input');
  const taskModal = document.getElementById('create-task-modal');
  const imageSection = document.getElementById('task-image-section');

  if (fileInput) {
      fileInput.onchange = (e) => handleImageFiles(e.target.files);
  }

  if (imageSection) {
      imageSection.ondragover = (e) => {
          e.preventDefault();
          imageSection.classList.add('border-emerald-500', 'bg-emerald-500/10');
      };
      imageSection.ondragleave = () => {
          imageSection.classList.remove('border-emerald-500', 'bg-emerald-500/10');
      };
      imageSection.ondrop = (e) => {
          e.preventDefault();
          imageSection.classList.remove('border-emerald-500', 'bg-emerald-500/10');
          handleImageFiles(e.dataTransfer.files);
      };
  }

  if (taskModal) {
      taskModal.onpaste = (e) => {
          const items = (e.clipboardData || e.originalEvent.clipboardData).items;
          for (const item of items) {
              if (item.type.indexOf('image') !== -1) {
                  const file = item.getAsFile();
                  handleImageFiles([file]);
              }
          }
      };
  }

  // Cross-Tab Sync Listener
  try {
    const syncChannel = new BroadcastChannel('hypenosys_neural_sessions_sync');
    syncChannel.onmessage = (event) => {
        if (event.data.type === 'data-updated' || event.data.type === 'sessions-updated') {
            console.log('[DASHBOARD-SYNC] Sync event received:', event.data.type);
            refreshDashboardData();
        }
    };
  } catch(e) {
    console.warn('[DASHBOARD-SYNC] BroadcastChannel failed:', e);
  }
}

/**
 * Alterna la visibilidad del pipeline de producción.
 */
function togglePipelineCollapse() {
  const content = document.getElementById('pipeline-content');
  const chevron = document.getElementById('pipeline-chevron');
  content.classList.toggle('hidden');
  chevron.classList.toggle('fa-chevron-down');
  chevron.classList.toggle('fa-chevron-up');
}

/**
 * Alterna la visibilidad de los filtros avanzados del Kanban.
 */
function toggleKanbanFilters() {
    const container = document.getElementById('kanban-filter-container');
    const arrow = document.getElementById('kanban-filters-arrow');
    const toggleBtn = document.getElementById('kanban-filters-toggle');
    const label = document.getElementById('kanban-filters-label');
    const badge = document.getElementById('active-filters-count');

    const isCollapsed = container.style.maxHeight === '0px' || container.style.maxHeight === '' || container.classList.contains('max-h-0');
    const totalActive = kanbanFilters.tags.length + kanbanFilters.members.length + kanbanFilters.repos.length + kanbanFilters.states.length +
                        kanbanFilters.milestones.length + kanbanFilters.themes.length + kanbanFilters.priorities.length + kanbanFilters.sections.length;

    if (isCollapsed) {
        container.classList.remove('max-h-0', 'opacity-0');
        container.style.maxHeight = '1000px';
        container.style.opacity = '1';
        container.style.marginBottom = '1.5rem';
        if (arrow) arrow.textContent = '▲';
        if (toggleBtn) toggleBtn.classList.add('bg-slate-700');
        if (label) label.textContent = 'Filtros';
        if (badge) badge.classList.add('hidden');
    } else {
        container.style.maxHeight = '0px';
        container.style.opacity = '0';
        container.style.marginBottom = '0px';
        if (arrow) arrow.textContent = '▼';
        if (toggleBtn) toggleBtn.classList.remove('bg-slate-700');

        if (totalActive > 0) {
            if (label) label.textContent = `Filtros · ${totalActive}`;
            if (badge) {
                badge.innerHTML = '';
                badge.classList.remove('hidden');
            }
        } else {
            if (label) label.textContent = 'Filtros';
            if (badge) badge.classList.add('hidden');
        }

        setTimeout(() => {
            if (container.style.maxHeight === '0px') {
                container.classList.add('max-h-0', 'opacity-0');
            }
        }, 300);
    }
}

/**
 * Alterna la visibilidad de la sección de Operaciones Jules.
 */
function toggleJulesCollapse() {
  const content = document.getElementById('jules-ops-content');
  const chevron = document.getElementById('jules-ops-chevron');
  content.classList.toggle('hidden');
  chevron.classList.toggle('fa-chevron-down');
  chevron.classList.toggle('fa-chevron-up');
}

/**
 * Archiva una sesión de Jules desde el dashboard.
 */
window.handleDashboardJulesArchive = (id) => {
    const archivedIds = JSON.parse(localStorage.getItem('jules_archived_ids') || '[]');
    archivedIds.push(id);
    localStorage.setItem('jules_archived_ids', JSON.stringify(archivedIds));

    const cachedSessions = JSON.parse(localStorage.getItem('jules_sessions_cache') || '[]');
    const session = cachedSessions.find(s => s.name.endsWith(id));
    if (session) {
        const archived = JSON.parse(localStorage.getItem('jules_archived_sessions') || '[]');
        if (!archived.some(s => s.name.endsWith(id))) {
            archived.unshift({ ...session, archivedAt: new Date().toISOString() });
            localStorage.setItem('jules_archived_sessions', JSON.stringify(archived));
        }
    }

    showToast(`Sesión #${id} archivada`, 'success');
    renderDashboard();
};

/**
 * Envía una sesión de Jules al "Cementerio".
 */
window.handleDashboardJulesCemetery = (id) => {
    const cemeteryIds = JSON.parse(localStorage.getItem('jules_cemetery_ids') || '[]');
    cemeteryIds.push(id);
    localStorage.setItem('jules_cemetery_ids', JSON.stringify(cemeteryIds));

    const cachedSessions = JSON.parse(localStorage.getItem('jules_sessions_cache') || '[]');
    const session = cachedSessions.find(s => s.name.endsWith(id));
    if (session) {
        const cemetery = JSON.parse(localStorage.getItem('jules_cemetery_sessions') || '[]');
        if (!cemetery.some(s => s.name.endsWith(id))) {
            cemetery.unshift({ ...session, deletedAt: new Date().toISOString() });
            localStorage.setItem('jules_cemetery_sessions', JSON.stringify(cemetery));
        }
    }

    showToast(`Sesión #${id} movida al cementerio`, 'warning');
    renderDashboard();
};

/**
 * Inicia el proceso de login global a través de GitHub OAuth.
 */
window.handleDashboardLogin = function() {
    if (window.authManager) {
        window.authManager.handleLogin();
    } else {
        const rememberMe = document.getElementById('chk-remember-me-dashboard')?.checked || false;
        sessionStorage.setItem('auth_remember_me', rememberMe);
        const clientId = (window.authManager && window.authManager.clientId) || window.HY_OAUTH_CONFIG.clientId;
        const scope = 'repo';
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=${scope}`;
    }
};

/**
 * Renderiza la barra de filtros del Kanban con todas las dimensiones disponibles (Tags, Equipo, Repos, etc.).
 */
function renderKanbanFilters() {
    const container = document.getElementById('kanban-filter-bar');
    if (!container) return;

    const arrow = document.getElementById('kanban-filters-arrow');
    const filterContainer = document.getElementById('kanban-filter-container');
    const label = document.getElementById('kanban-filters-label');
    const badge = document.getElementById('active-filters-count');

    const totalActive = kanbanFilters.tags.length + kanbanFilters.members.length + kanbanFilters.repos.length + kanbanFilters.states.length +
                        kanbanFilters.milestones.length + kanbanFilters.themes.length + kanbanFilters.priorities.length + (kanbanFilters.orgs ? kanbanFilters.orgs.length : 0);
    const isCollapsed = filterContainer.style.maxHeight === '0px' || filterContainer.classList.contains('max-h-0');

    if (!filterContainer.dataset.initialized) {
        filterContainer.style.maxHeight = '0px';
        filterContainer.style.opacity = '0';
        filterContainer.style.marginBottom = '0px';
        if (arrow) arrow.textContent = '▼';
        filterContainer.dataset.initialized = "true";
    }

    if (isCollapsed && totalActive > 0) {
        if (label) label.textContent = `Filtros · ${totalActive}`;
        if (badge) {
            badge.innerHTML = '';
            badge.classList.remove('hidden');
        }
    } else {
        if (label) label.textContent = 'Filtros';
        if (badge) badge.classList.add('hidden');
    }

    const allTags = new Set();
    const allRepos = new Set();
    const allMilestones = new Set();
    const allThemes = new Set();
    const allPriorities = new Set();
    const allSections = new Set();
    const allOrgs = new Set();

    currentTasks.forEach(t => {
        if (t.tags) t.tags.forEach(tag => allTags.add(tag));
        const repo = t.repository || t.repo || 'Sin asignar';
        allRepos.add(repo);
        allMilestones.add(t.milestone || 'Sin Milestone');
        allThemes.add(t.tema_principal || 'Sin Tema');
        allPriorities.add(t.prioridad || 'Sin Prioridad');

        const sections = (t.seccion || 'Sin Sección').split(',').map(s => s.trim()).filter(s => s);
        sections.forEach(s => allSections.add(s));

        const orgId = t.organizationId || 'personal';
        allOrgs.add(orgId);
    });

    const sortedTags = Array.from(allTags).sort();
    const sortedRepos = Array.from(allRepos).sort();
    const sortedMilestones = Array.from(allMilestones).sort();
    const sortedThemes = Array.from(allThemes).sort();
    const sortedPriorities = Array.from(allPriorities).sort();
    const sortedSections = Array.from(allSections).sort();
    const allStates = ['PENDING', 'WORKING', 'IN REVIEW', 'OK', 'CRITICAL', 'TODO'];

    container.innerHTML = '';

    const createPill = (label, active, onClick, customActiveClass = '') => {
        const btn = document.createElement('button');
        btn.textContent = label;
        let classes = 'filter-pill px-3 py-1 text-xs font-bold rounded-full border transition-all ';
        if (active) {
            classes += customActiveClass ? `${customActiveClass} border-transparent` : 'bg-emerald-500 text-slate-950 border-emerald-500';
        } else {
            classes += 'text-slate-400 border-slate-800 hover:border-slate-600';
        }
        btn.className = classes;
        btn.onclick = onClick;
        return btn;
    };

    const createRow = (title, icon) => {
        const row = document.createElement('div');
        row.className = 'flex flex-wrap items-center gap-3';
        const label = document.createElement('div');
        label.className = 'text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[70px] flex items-center gap-2';
        label.innerHTML = `<i class="${icon} text-slate-600"></i> ${title}`;
        row.appendChild(label);
        const content = document.createElement('div');
        content.className = 'flex flex-wrap gap-2 flex-1';
        row.appendChild(content);
        return { row, content };
    };

    // Fila 1: Tags
    const tagsRow = createRow('Tags', 'fa-solid fa-tags');
    sortedTags.forEach(tag => {
        const active = kanbanFilters.tags.includes(tag);
        const pill = createPill(tag, active, () => {
            if (active) kanbanFilters.tags = kanbanFilters.tags.filter(t => t !== tag);
            else kanbanFilters.tags.push(tag);
            renderDashboard();
        });
        tagsRow.content.appendChild(pill);
    });
    container.appendChild(tagsRow.row);

    // Fila 2: Personas
    const membersRow = createRow('Equipo', 'fa-solid fa-users');
    MEMBERS.forEach(member => {
        const active = kanbanFilters.members.includes(member);
        const pill = createPill(member, active, () => {
            if (active) kanbanFilters.members = kanbanFilters.members.filter(m => m !== member);
            else kanbanFilters.members.push(member);
            renderDashboard();
        });
        membersRow.content.appendChild(pill);
    });
    container.appendChild(membersRow.row);

    // Fila 3: Repos
    const reposRow = createRow('Repos', 'fa-solid fa-code-fork');
    sortedRepos.forEach(repo => {
        const active = kanbanFilters.repos.includes(repo);
        const pill = createPill(repo, active, () => {
            if (active) kanbanFilters.repos = kanbanFilters.repos.filter(r => r !== repo);
            else kanbanFilters.repos.push(repo);
            renderDashboard();
        });
        reposRow.content.appendChild(pill);
    });
    container.appendChild(reposRow.row);

    // Fila 4: Milestones
    const milestonesRow = createRow('Milestone', 'fa-solid fa-flag-checkered');
    sortedMilestones.forEach(milestone => {
        const active = kanbanFilters.milestones.includes(milestone);
        const pill = createPill(milestone, active, () => {
            if (active) kanbanFilters.milestones = kanbanFilters.milestones.filter(m => m !== milestone);
            else kanbanFilters.milestones.push(milestone);
            renderDashboard();
        });
        milestonesRow.content.appendChild(pill);
    });
    container.appendChild(milestonesRow.row);

    // Fila 5: Tema Principal
    const themesRow = createRow('Tema', 'fa-solid fa-layer-group');
    sortedThemes.forEach(theme => {
        const active = kanbanFilters.themes.includes(theme);
        const pill = createPill(theme, active, () => {
            if (active) kanbanFilters.themes = kanbanFilters.themes.filter(t => t !== theme);
            else kanbanFilters.themes.push(theme);
            renderDashboard();
        });
        themesRow.content.appendChild(pill);
    });
    container.appendChild(themesRow.row);

    // Fila 6: Prioridad
    const prioritiesRow = createRow('Prioridad', 'fa-solid fa-bolt');
    sortedPriorities.forEach(priority => {
        const active = kanbanFilters.priorities.includes(priority);
        const pill = createPill(priority, active, () => {
            if (active) kanbanFilters.priorities = kanbanFilters.priorities.filter(p => p !== priority);
            else kanbanFilters.priorities.push(priority);
            renderDashboard();
        });
        prioritiesRow.content.appendChild(pill);
    });
    container.appendChild(prioritiesRow.row);

    // Fila 7: Secciones
    const sectionsRow = createRow('Sección', 'fa-solid fa-puzzle-piece');
    sortedSections.forEach(section => {
        const active = kanbanFilters.sections.includes(section);
        const pill = createPill(section, active, () => {
            if (active) kanbanFilters.sections = kanbanFilters.sections.filter(s => s !== section);
            else kanbanFilters.sections.push(section);
            renderDashboard();
        });
        sectionsRow.content.appendChild(pill);
    });
    container.appendChild(sectionsRow.row);

    // Fila 7.5: Organizaciones de origen (SÓLO en el Kanban Personal)
    const ws = window.githubApi.getActiveWorkspace();
    if (ws === 'personal' && allOrgs.size > 0) {
        const orgsRow = createRow('Orgs', 'fa-solid fa-building');
        Array.from(allOrgs).sort().forEach(orgId => {
            const active = kanbanFilters.orgs && kanbanFilters.orgs.includes(orgId);
            const displayLabel = orgId === 'personal' ? 'PERSONAL' : orgId.replace(/-/g, ' ').toUpperCase();
            const pill = createPill(displayLabel, active, () => {
                if (!kanbanFilters.orgs) kanbanFilters.orgs = [];
                if (active) kanbanFilters.orgs = kanbanFilters.orgs.filter(o => o !== orgId);
                else kanbanFilters.orgs.push(orgId);
                renderDashboard();
            });
            orgsRow.content.appendChild(pill);
        });
        container.appendChild(orgsRow.row);
    }

    // Fila 8: Estados y Botón Limpiar
    const lastRowWrapper = document.createElement('div');
    lastRowWrapper.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2 border-t border-slate-800/50';

    const statesRow = createRow('Estados', 'fa-solid fa-list-check');
    allStates.forEach(state => {
        const active = kanbanFilters.states.includes(state);
        const config = STATE_CONFIG[state];
        const pill = createPill(state, active, () => {
            if (active) kanbanFilters.states = kanbanFilters.states.filter(s => s !== state);
            else kanbanFilters.states.push(state);
            renderDashboard();
        }, config.color);
        statesRow.content.appendChild(pill);
    });
    lastRowWrapper.appendChild(statesRow.row);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'text-[10px] font-black text-slate-500 hover:text-red-400 uppercase tracking-widest transition-all flex items-center gap-2 px-3 py-2 bg-slate-950 rounded-lg border border-slate-800 hover:border-red-900/50';
    clearBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Limpiar todo';
    clearBtn.onclick = () => {
        kanbanFilters = { tags: [], members: [], repos: [], states: [], milestones: [], themes: [], priorities: [], sections: [], orgs: [] };
        renderDashboard();
    };
    lastRowWrapper.appendChild(clearBtn);

    container.appendChild(lastRowWrapper);
}

let __workspaces__ = [];

async function renderWorkspaceSelector() {
    const slot = document.getElementById('header-status-slot');
    if (!slot) return;

    const currentWs = window.githubApi.getActiveWorkspace();

    if (__workspaces__.length === 0) {
        try {
            const orgsRes = await window.githubApi.fetchFileWithSha('_data/organizations.json');
            if (orgsRes && orgsRes.content && orgsRes.content.organizations) {
                __workspaces__ = orgsRes.content.organizations;
            } else {
                __workspaces__ = [{ id: 'hypenosys', name: 'Hypenosys', createdBy: 'Axlfc', createdAt: '2025-01-01T00:00:00.000Z', isDefault: true }];
            }
        } catch (e) {
            console.error('[WORKSPACE] Failed to load organizations, using fallback:', e);
            __workspaces__ = [{ id: 'hypenosys', name: 'Hypenosys', createdBy: 'Axlfc', createdAt: '2025-01-01T00:00:00.000Z', isDefault: true }];
        }
    }

    let currentWsName = 'Hypenosys';
    if (currentWs === 'personal') {
        currentWsName = 'Kanban Personal';
    } else {
        const found = __workspaces__.find(w => w.id === currentWs);
        if (found) currentWsName = found.name;
    }

    let itemsHtml = '';

    // Organizations Section
    itemsHtml += `<div class="px-3 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900">Organizaciones</div>`;
    const userHandle = (window.currentUser || (window.githubApi && window.githubApi.user && window.githubApi.user.login) || '').toLowerCase();
    const filteredWorkspaces = __workspaces__.filter(w => {
        if (!w.members || !Array.isArray(w.members)) return false;
        return w.members.some(m => m.toLowerCase() === userHandle);
    });
    filteredWorkspaces.forEach(w => {
        const activeClass = currentWs === w.id ? 'text-indigo-400 font-bold bg-slate-900' : 'text-slate-300';
        itemsHtml += `
            <div class="flex items-center justify-between w-full hover:bg-slate-800/80 transition-colors" style="padding-right: 0.5rem;">
                <button onclick="switchWorkspace('${w.id}')" class="flex items-center flex-grow px-4 py-2 text-xs text-left ${activeClass}" style="border: none; background: transparent; outline: none;">
                    <i class="fa-solid fa-building mr-2 text-[10px] opacity-70"></i> ${w.name}
                </button>
                <button onclick="event.stopPropagation(); openManageMembersModal('${w.id}')" class="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors" style="border: none; background: transparent; outline: none;" title="Gestionar miembros">
                    <i class="fa-solid fa-cog text-[11px]"></i>
                </button>
            </div>
        `;
    });

    // Personal Section
    itemsHtml += `<div class="px-3 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-t border-b border-slate-900 mt-1">Personal</div>`;
    const personalActive = currentWs === 'personal' ? 'text-indigo-400 font-bold bg-slate-900' : 'text-slate-300';
    itemsHtml += `
        <button onclick="switchWorkspace('personal')" class="flex items-center w-full px-4 py-2 text-xs text-left hover:bg-slate-800 transition-colors ${personalActive}">
            <i class="fa-solid fa-user mr-2 text-[10px] opacity-70"></i> Kanban Personal
        </button>
    `;

    // Actions Section
    itemsHtml += `<div class="border-t border-slate-900 my-1"></div>`;
    itemsHtml += `
        <button onclick="promptCreateOrganization()" class="flex items-center w-full px-4 py-2 text-xs text-left text-emerald-400 hover:bg-slate-800 transition-colors font-bold">
            <i class="fa-solid fa-plus mr-2 text-[10px]"></i> Nueva Organización
        </button>
    `;

    slot.innerHTML = `
        <div class="relative inline-block text-left" id="workspace-selector-container" style="z-index: 4000;">
            <button type="button" class="flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 border border-slate-800 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:border-slate-700 transition-all focus:outline-none" id="workspace-menu-button">
                <i class="fa-solid ${currentWs === 'personal' ? 'fa-user' : 'fa-building'} text-indigo-400"></i>
                <span>${currentWsName}</span>
                <i class="fa-solid fa-chevron-down text-slate-500 text-[10px]"></i>
            </button>

            <div id="workspace-menu" class="hidden absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-xl bg-slate-950 border border-slate-800 shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none overflow-hidden" role="menu">
                <div class="py-1" role="none">
                    ${itemsHtml}
                </div>
            </div>
        </div>
    `;

    const btn = document.getElementById('workspace-menu-button');
    const menu = document.getElementById('workspace-menu');
    if (btn && menu) {
        btn.onclick = (e) => {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        };
        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !menu.contains(e.target)) {
                menu.classList.add('hidden');
            }
        });
    }
}

window.switchWorkspace = async (ws) => {
    window.githubApi.setActiveWorkspace(ws);
    // Reset active filters to prevent filtering issues on workspace change
    activeFilter = null;
    activeStageFilter = null;
    kanbanFilters = {
        tags: [],
        members: [],
        repos: [],
        states: [],
        milestones: [],
        themes: [],
        priorities: [],
        sections: [],
        orgs: []
    };

    // Clear last sync data string to force a full re-render of the new workspace dataset
    window._lastDataString = null;

    try {
        await refreshDashboardData();
    } catch (err) {
        console.error('[WORKSPACE] Failed to refresh workspace data:', err);
    }
};

window.promptCreateOrganization = async () => {
    const orgName = prompt('Introduce el nombre de la nueva organización:');
    if (!orgName || !orgName.trim()) return;

    const orgId = orgName.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    if (!orgId) {
        alert('Nombre de organización inválido.');
        return;
    }

    if (orgId === 'hypenosys' || orgId === 'personal') {
        alert('Ese ID de organización está reservado.');
        return;
    }

    if (__workspaces__.some(w => w.id === orgId)) {
        alert('La organización ya existe.');
        return;
    }

    if (window.hypeToast) {
        window.hypeToast('Creando organización en GitHub...', 'info');
    }

    try {
        await window.githubApi.atomicWrite('_data/organizations.json', (db) => {
            if (!db.organizations) db.organizations = [];
            db.organizations.push({
                id: orgId,
                name: orgName.trim(),
                createdBy: (window.githubApi.user && window.githubApi.user.login) ? window.githubApi.user.login : 'Axlfc',
                createdAt: new Date().toISOString(),
                isDefault: false
            });
            return db;
        }, `feat: nueva organización ${orgName.trim()} añadida`);

        if (window.hypeToast) {
            window.hypeToast('Organización creada correctamente ✓', 'success');
        }

        window.switchWorkspace(orgId);
    } catch (e) {
        console.error('[WORKSPACE] Failed to create organization:', e);
        alert('Fallo al crear la organización: ' + e.message);
    }
};

function renderLocalWorkspaceActions() {
    const container = document.getElementById('local-kanban-actions');
    if (!container) return;

    const currentWs = window.githubApi.getActiveWorkspace();
    if (currentWs !== 'personal') {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <button onclick="exportPersonalKanban()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-lg text-sm transition-all flex items-center gap-1.5" title="Exportar tareas locales como JSON">
            <i class="fa-solid fa-file-export"></i> <span class="hidden md:inline">Exportar</span>
        </button>
        <button onclick="triggerImportPersonalKanban()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-lg text-sm transition-all flex items-center gap-1.5" title="Importar tareas locales desde JSON">
            <i class="fa-solid fa-file-import"></i> <span class="hidden md:inline">Importar</span>
        </button>
        <input type="file" id="import-personal-file" class="hidden" accept=".json" onchange="importPersonalKanban(event)">
    `;
}

window.exportPersonalKanban = () => {
    const username = (window.githubApi.user && window.githubApi.user.login) ? window.githubApi.user.login.toLowerCase() : 'guest';
    const tasksData = localStorage.getItem(`hypenosys_personal_kanban_tasks_${username}`);
    const archiveData = localStorage.getItem(`hypenosys_personal_kanban_archive_${username}`);

    const exportPayload = {
        schema_version: "1.2.0",
        exported_at: new Date().toISOString(),
        tasks: tasksData ? JSON.parse(tasksData).tasks : [],
        archive: archiveData ? JSON.parse(archiveData).tasks : []
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `kanban_personal_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    if (window.hypeToast) {
        window.hypeToast("Exportación completada ✓", "success");
    }
};

window.triggerImportPersonalKanban = () => {
    document.getElementById('import-personal-file')?.click();
};

window.importPersonalKanban = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || !Array.isArray(data.tasks)) {
                throw new Error("El archivo JSON no tiene un formato válido (debe contener un array 'tasks').");
            }

            const username = (window.githubApi.user && window.githubApi.user.login) ? window.githubApi.user.login.toLowerCase() : 'guest';

            // Save tasks
            const tasksPayload = {
                schema_version: data.schema_version || "1.2.0",
                last_updated: new Date().toISOString(),
                last_updated_by: "Importador",
                tasks: data.tasks
            };
            localStorage.setItem(`hypenosys_personal_kanban_tasks_${username}`, JSON.stringify(tasksPayload));

            // Save archive
            const archivePayload = {
                schema_version: data.schema_version || "1.2.0",
                last_updated: new Date().toISOString(),
                last_updated_by: "Importador",
                tasks: data.archive || []
            };
            localStorage.setItem(`hypenosys_personal_kanban_archive_${username}`, JSON.stringify(archivePayload));

            if (window.hypeToast) {
                window.hypeToast("Importación completada ✓", "success");
            } else {
                alert("Importación completada con éxito.");
            }

            window.location.reload();
        } catch (err) {
            console.error('[IMPORT] Failed:', err);
            alert("Error al importar el archivo: " + err.message);
        }
    };
    reader.readAsText(file);
};

// --- GESTIÓN DE MIEMBROS POR ORGANIZACIÓN (MODAL) ---

let activeManageOrgId = null;

window.openManageMembersModal = (orgId) => {
    activeManageOrgId = orgId;
    const org = __workspaces__.find(w => w.id === orgId);
    if (!org) return;

    document.getElementById('manage-members-title').textContent = `Gestionar Miembros`;
    document.getElementById('manage-members-subtitle').textContent = `Organización: ${org.name}`;
    document.getElementById('add-member-input').value = '';
    document.getElementById('add-member-error').classList.add('hidden');

    renderManageMembersList(org);

    document.getElementById('manage-members-modal').classList.remove('hidden');
};

window.closeManageMembersModal = () => {
    document.getElementById('manage-members-modal').classList.add('hidden');
    activeManageOrgId = null;
};

function renderManageMembersList(org) {
    const listContainer = document.getElementById('manage-members-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const members = org.members || [];
    if (members.length === 0) {
        listContainer.innerHTML = `<div class="text-xs text-slate-500 italic py-2 text-center">No hay miembros en esta organización.</div>`;
        return;
    }

    members.forEach(member => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-slate-900/60 p-2 rounded border border-slate-800/80 mb-2';

        const display = MEMBER_MAPPING[member.toLowerCase()] || member;

        div.innerHTML = `
            <span class="text-xs font-bold text-slate-200">${display} <span class="text-[10px] text-slate-500 font-mono">(${member})</span></span>
            <button onclick="handleRemoveOrgMember('${member}')" class="text-slate-500 hover:text-red-400 transition-colors p-1 border-0 bg-transparent outline-none" title="Eliminar miembro">
                <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
        `;
        listContainer.appendChild(div);
    });
}

window.handleAddOrgMember = async () => {
    const input = document.getElementById('add-member-input');
    const errEl = document.getElementById('add-member-error');
    if (!input || !errEl || !activeManageOrgId) return;

    errEl.classList.add('hidden');
    const username = input.value.trim();

    if (!username) {
        errEl.textContent = 'El nombre de usuario no puede estar vacío.';
        errEl.classList.remove('hidden');
        return;
    }

    const org = __workspaces__.find(w => w.id === activeManageOrgId);
    if (!org) return;

    const members = org.members || [];
    if (members.some(m => m.toLowerCase() === username.toLowerCase())) {
        errEl.textContent = 'El usuario ya pertenece a esta organización.';
        errEl.classList.remove('hidden');
        return;
    }

    if (window.hypeToast) {
        window.hypeToast('Guardando miembro en GitHub...', 'info');
    }

    try {
        const result = await window.githubApi.atomicWrite('_data/organizations.json', (db) => {
            const orgInDb = db.organizations.find(w => w.id === activeManageOrgId);
            if (orgInDb) {
                if (!orgInDb.members) orgInDb.members = [];
                orgInDb.members.push(username);
            }
            return db;
        }, `chore: añadir miembro ${username} a la organización ${org.name}`);

        if (result.success) {
            if (window.hypeToast) {
                window.hypeToast('Miembro añadido correctamente ✓', 'success');
            }
            __workspaces__ = result.content.organizations;
            window.__workspaces__ = __workspaces__;

            const updatedOrg = __workspaces__.find(w => w.id === activeManageOrgId);
            renderManageMembersList(updatedOrg);

            loadWorkspaceMembers();
            renderDashboard();
            input.value = '';
        } else {
            throw new Error('No se pudo guardar la organización.');
        }
    } catch (e) {
        console.error('[MEMBER] Failed to add member:', e);
        errEl.textContent = 'Fallo al guardar: ' + e.message;
        errEl.classList.remove('hidden');
        if (window.hypeToast) {
            window.hypeToast('Error guardando en GitHub: ' + e.message, 'error');
        }
    }
};

window.handleRemoveOrgMember = async (username) => {
    if (!activeManageOrgId) return;
    const org = __workspaces__.find(w => w.id === activeManageOrgId);
    if (!org) return;

    if (!confirm(`¿Estás seguro de que deseas eliminar a ${username} de ${org.name}?`)) return;

    if (window.hypeToast) {
        window.hypeToast('Eliminando miembro en GitHub...', 'info');
    }

    try {
        const result = await window.githubApi.atomicWrite('_data/organizations.json', (db) => {
            const orgInDb = db.organizations.find(w => w.id === activeManageOrgId);
            if (orgInDb && orgInDb.members) {
                orgInDb.members = orgInDb.members.filter(m => m.toLowerCase() !== username.toLowerCase());
            }
            return db;
        }, `chore: eliminar miembro ${username} de la organización ${org.name}`);

        if (result.success) {
            if (window.hypeToast) {
                window.hypeToast('Miembro eliminado ✓', 'success');
            }
            __workspaces__ = result.content.organizations;
            window.__workspaces__ = __workspaces__;

            const updatedOrg = __workspaces__.find(w => w.id === activeManageOrgId);
            renderManageMembersList(updatedOrg);

            loadWorkspaceMembers();
            renderDashboard();
        } else {
            throw new Error('No se pudo guardar la organización.');
        }
    } catch (e) {
        console.error('[MEMBER] Failed to remove member:', e);
        if (window.hypeToast) {
            window.hypeToast('Error guardando en GitHub: ' + e.message, 'error');
        }
    }
};
