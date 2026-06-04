/* HYPENOSYS — UI MODULE */

function renderDashboard() {
  renderMemberToggles();
  updateJulesBadges();
  renderJulesSessions();
  renderStatsSummary();
  renderKanbanBoard();
  renderGroupStats();
  renderBurnoutGauge();
  renderBudgetChart();
  renderHallOfFame();
  renderMilestoneProgress();
  renderTeamProfiles();
  renderTaskArchive();

  // Part 2 — Production Pipeline
  renderCriticalPathAlerts();
  renderPipelineSwimlanes();
  renderMilestoneBurndownChart();
  renderDependencyGraph();
  renderVelocityTrackerChart();
}

function renderStatsSummary() {
  const tasks = getFilteredTasks(currentTasks);
  const activeTasksCount = tasks.filter(t => !['OK', 'Closed', 'Obsolete'].includes(t.estado)).length;
  const completedTasksCount = tasks.filter(t => ['OK', 'Closed'].includes(t.estado)).length;

  document.getElementById('stat-total-tasks').textContent = activeTasksCount;
  document.getElementById('stat-ok-tasks').textContent    = completedTasksCount;

  const ratio = window.githubApi.computeFixedFoundRatio(tasks);
  document.getElementById('stat-fixed-ratio').textContent = `${(ratio * 100).toFixed(2)}%`;
}

function renderMemberToggles() {
  const container = document.getElementById('member-filters');
  if (!container) return;
  container.innerHTML = '';

  const baseClasses = "font-bold rounded-md transition-all flex-shrink-0";
  const mobileClasses = "px-2 py-0.5 text-xs";
  const desktopClasses = "lg:px-3 lg:py-1 lg:text-sm";

  const allBtn = document.createElement('button');
  allBtn.textContent = '👥 Todos';
  allBtn.className = (activeFilter === null && activeStageFilter === null)
    ? `${baseClasses} ${mobileClasses} ${desktopClasses} bg-emerald-500 text-slate-950`
    : `${baseClasses} ${mobileClasses} ${desktopClasses} text-slate-400 hover:text-white`;

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
      : `${baseClasses} ${mobileClasses} ${desktopClasses} text-slate-400 hover:text-white`;

    btn.addEventListener('click', () => {
      activeFilter = (activeFilter === member) ? null : member;
      renderDashboard();
    });
    container.appendChild(btn);
  }
}

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

function renderCriticalPathAlerts() {
  const panel = document.getElementById('critical-path-panel');
  if (!panel) return;
  panel.innerHTML = '';

  const isCollapsed = localStorage.getItem('alerts_panel_collapsed') === 'true';
  const alerts = [];
  const today = new Date().toISOString().split('T')[0];

  const tasksToAnalyze = getFilteredTasks(currentTasks);

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

function toggleAlertsPanel() {
    const current = localStorage.getItem('alerts_panel_collapsed') === 'true';
    localStorage.setItem('alerts_panel_collapsed', !current);
    renderCriticalPathAlerts();
}

function scrollToTask(id) {
  // Simple search for the task card
  const cards = document.querySelectorAll('.kanban-cards > div');
  for (const card of cards) {
    if (card.querySelector('.text-\\[9px\\]')?.textContent === `#${String(id)}`) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('ring-4', 'ring-emerald-500', 'ring-offset-4', 'ring-offset-slate-950');
      setTimeout(() => card.classList.remove('ring-4', 'ring-emerald-500', 'ring-offset-4', 'ring-offset-slate-950'), 3000);
      return;
    }
  }
}

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

      <!-- Dropdown menu (Tailwind) -->
      <div id="user-menu-${idSuffix}" class="hidden absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl bg-slate-900 border border-slate-800 shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none overflow-hidden" role="menu" aria-orientation="vertical" aria-labelledby="user-menu-button-${idSuffix}" tabindex="-1">
        <div class="py-1" role="none">
          <button onclick="if(window.profileEditor) window.profileEditor.openModal(); else window.authManager.showProfileModal();" class="flex items-center w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors" role="menuitem">
            <i class="fas fa-user fa-sm fa-fw mr-3 text-indigo-400"></i> Mi Perfil
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

function setupDropdownToggle(idSuffix) {
  const btn = document.getElementById(`user-menu-button-${idSuffix}`);
  const menu = document.getElementById(`user-menu-${idSuffix}`);

  if (!btn || !menu) return;

  btn.onclick = (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  };

  // Close when clicking outside - ensure only one listener exists globally
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

function setupEventListeners() {
  // Lightbox keyboard support
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

  if (taskCancel) taskCancel.onclick = () => document.getElementById('create-task-modal').classList.add('hidden');
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

  // Image handling
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
}

function togglePipelineCollapse() {
  const content = document.getElementById('pipeline-content');
  const chevron = document.getElementById('pipeline-chevron');
  content.classList.toggle('hidden');
  chevron.classList.toggle('fa-chevron-down');
  chevron.classList.toggle('fa-chevron-up');
}

function toggleJulesCollapse() {
  const content = document.getElementById('jules-ops-content');
  const chevron = document.getElementById('jules-ops-chevron');
  content.classList.toggle('hidden');
  chevron.classList.toggle('fa-chevron-down');
  chevron.classList.toggle('fa-chevron-up');
}

window.handleDashboardJulesArchive = (id) => {
    const archivedIds = JSON.parse(localStorage.getItem('jules_archived_ids') || '[]');
    archivedIds.push(id);
    localStorage.setItem('jules_archived_ids', JSON.stringify(archivedIds));

    // Guardar datos completos para el archivo si están en cache
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

window.handleDashboardLogin = function() {
    // Trigger the global auth manager login flow if available
    if (window.authManager) {
        window.authManager.handleLogin();
    } else {
        // Fallback if authManager isn't available for some reason
        const rememberMe = document.getElementById('chk-remember-me-dashboard')?.checked || false;
        sessionStorage.setItem('auth_remember_me', rememberMe);

        const clientId = window.authManager?.clientId || 'Ov23liAVwbXNtvhkHJQe';
        const scope = 'repo';
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=${scope}`;
    }
};

