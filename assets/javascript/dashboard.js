/**
 * HYPENOSYS OPERATIONAL DASHBOARD — LOGIC ENGINE
 * Full implementation for Kanban, Charts, and Stats
 */

const MEMBERS = ['Axel', 'Alex', 'Dídac', 'Javi', 'Mitxel'];
const MEMBER_MAPPING = {
    'axlfc': 'Axel',
    'topperh4rley': 'Alex',
    'javi26031994-a11y': 'Javi',
    'dkdidac-design': 'Dídac',
    'mitxel2022': 'Mitxel'
};
const STAGES = ['Concepto / GDD', 'Pre-producción', 'Tools / Automation', 'Arte / Assets', 'Programación / Engine', 'QA / Testing', 'Build / Deploy', 'Post-launch'];
const REFRESH_INTERVAL_MS = 30000; // 30 seconds

let activeFilter = null;
let activeStageFilter = null;
let currentTasks = [];
let archivedTasks = [];
let currentStats = null;
let currentBudget = null;
let currentProfiles = null;
let currentTaskImages = []; // TODO: Migrate to external storage (e.g. GitHub Assets/R2) if JSON size exceeds 10MB

const KANBAN_COLUMNS = [
  { id: 'backlog',    label: 'Backlog / ToDo',        states: ['Pending','ToDo',null],           icon: '📋' },
  { id: 'working',   label: 'En Progreso',             states: ['Working','KO'],                  icon: '⚡' },
  { id: 'qa',        label: 'QA / Manual Test',        states: ['Fixed','In Review'],             icon: '🧪' },
  { id: 'done',      label: 'Completado',              states: ['OK','Closed'],                   icon: '✅' }
];

const STATE_CONFIG = {
    'Pending':  { color: 'bg-slate-700 text-slate-300', label: 'Pending' },
    'ToDo':     { color: 'bg-indigo-500 text-white', label: 'ToDo' },
    'Working':  { color: 'bg-amber-500 text-slate-950', label: 'Working' },
    'KO':       { color: 'bg-red-500 text-slate-950', label: 'KO' },
    'Fixed':    { color: 'bg-blue-500 text-slate-950', label: 'Fixed' },
    'In Review':{ color: 'bg-purple-500 text-white', label: 'In Review' },
    'OK':       { color: 'bg-emerald-500 text-slate-950', label: 'OK' },
    'Closed':   { color: 'bg-slate-800 text-slate-400', label: 'Closed' },
    'Obsolete': { color: 'bg-slate-950 text-slate-600 line-through', label: 'Obsolete' }
};

const UI_STRINGS = {
  loading:         'Cargando datos del repositorio...',
  saving:          'Guardando cambios...',
  saved:           'Cambios guardados correctamente.',
  conflict:        'Conflicto detectado — ejecutando sincronización automática...',
  unauthorized:    'Acceso denegado. Tu cuenta de GitHub no pertenece al equipo.',
  taskMoved:       (id, col) => `Tarea #${id} movida a "${col}".`,
  taskCreated:     (id) => `Tarea #${id} creada correctamente.`,
  qaRequired:      'Debes asignar tanto el detector QA como el resolutor para mover a Verificación.',
  networkError:    'Error de red — comprueba tu conexión e inténtalo de nuevo.',
  retrying:        (n, max) => `Reintentando escritura (${n}/${max})...`,
  burnoutLow:      'Equipo estable — carga de trabajo bajo control.',
  burnoutMedium:   'Carga moderada — revisar tareas críticas pendientes.',
  burnoutHigh:     '⚠ Riesgo de saturación — intervención recomendada.',
};

// ─── INITIALIZATION ───────────────────────────────────────────

document.addEventListener('DOMContentLoaded', handleDOMContentLoaded);

async function handleDOMContentLoaded() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');

  if (code) {
    console.log('[DASHBOARD] OAuth code detected. Handling callback...');
    const loginOverlay = document.getElementById('login-overlay');
    loginOverlay.classList.remove('hidden');

    // Save original HTML if needed, but we just want to show progress
    const statusMsg = loginOverlay.querySelector('p');
    if (statusMsg) statusMsg.textContent = 'Autenticando con GitHub...';

    try {
      const result = await window.githubApi.exchangeCodeForToken(code);
      if (result.valid) {
          window.history.replaceState({}, document.title, window.location.pathname);
          await initDashboard();
      } else {
          throw new Error('No autorizado');
      }
    } catch (err) {
      console.error('[DASHBOARD] OAuth Error:', err);
      showToast('Error de autenticación: ' + err.message, 'error');
      loginOverlay.classList.remove('hidden');
    }
  } else {
    await initDashboard();
  }
}

async function initDashboard() {
  console.log('[DASHBOARD] Initializing Dashboard...');
  const token = window.githubApi.getAuthToken();
  if (!token) {
    console.log('[DASHBOARD] No token found during init.');
    document.getElementById('login-overlay').classList.remove('hidden');
    return;
  }

  try {
    const { valid, user } = await window.githubApi.validateToken();
    if (!valid) {
        console.log('[DASHBOARD] Token validation failed or unauthorized.');
        if (user) {
            document.getElementById('unauthorized-msg').textContent = `Tu cuenta de GitHub (${user.login}) no pertenece al equipo de Hypenosys.`;
            document.getElementById('unauthorized-overlay').classList.remove('hidden');
        } else {
            document.getElementById('login-overlay').classList.remove('hidden');
        }
        return;
    }

    console.log('[DASHBOARD] Access granted for:', user.login);
    document.getElementById('login-overlay').classList.add('hidden');
    window.currentUser = user.login.toLowerCase();

    await refreshDashboardData();

    // Set default filter to current user if they match
    const memberMatch = MEMBERS.find(m => m.toLowerCase() === window.currentUser ||
                                          (currentProfiles && currentProfiles.members[m] && currentProfiles.members[m].handle.toLowerCase() === window.currentUser));
    if (memberMatch) activeFilter = memberMatch;

    startAutoRefresh();
    renderUserStatus(user);
    setupEventListeners();
    renderDashboard();

  } catch (err) {
    console.error(err);
    document.getElementById('login-overlay').classList.remove('hidden');
  }
}

function startAutoRefresh() {
  setInterval(refreshDashboardData, REFRESH_INTERVAL_MS);
}

// ─── DATA FETCHING ───────────────────────────────────────────

async function refreshDashboardData() {
  try {
    const [tasksRes, archiveRes, statsRes, budgetRes, profilesRes] = await Promise.all([
      window.githubApi.fetchFileWithSha('_data/dashboard_tasks.json'),
      window.githubApi.fetchFileWithSha('_data/dashboard_tasks_archive.json'),
      window.githubApi.fetchFileWithSha('_data/studio_stats.json'),
      window.githubApi.fetchFileWithSha('_data/studio_budget.json'),
      window.githubApi.fetchFileWithSha('_data/team_profiles.json')
    ]);

    currentTasks    = tasksRes.content.tasks || [];
    archivedTasks   = archiveRes.content.tasks || [];
    currentStats    = statsRes.content;
    currentBudget   = budgetRes.content;
    currentProfiles = profilesRes.content;

    renderDashboard();

    document.getElementById('last-sync-timestamp').textContent =
      `Última sincronización: ${new Date().toLocaleTimeString('es-ES')}`;

  } catch (err) {
    let msg = `Error de sincronización: ${err.message}`;
    if (err.message.includes('401')) msg = "Token inválido o expirado. Por favor, vuelve a iniciar sesión.";
    if (err.message.includes('403')) msg = "Sin permisos de escritura en el repositorio.";
    if (err.message.includes('404')) msg = "Archivo no encontrado en el repositorio.";
    if (err.message.includes('409')) msg = "Conflicto detectado — ejecutando sincronización automática...";
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') msg = "Error de red — comprueba tu conexión e inténtalo de nuevo.";

    showToast(msg, 'error');
  }
}

// ─── RENDERING ENGINE ────────────────────────────────────────

function renderDashboard() {
  renderMemberToggles();
  updateJulesBadges();
  renderJulesSessions();
  renderStatsSummary();
  renderKanbanBoard();
  renderQAVelocityChart();
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
  const activeTasks = tasks.filter(t => t.estado !== 'Obsolete');
  document.getElementById('stat-total-tasks').textContent = activeTasks.length;
  document.getElementById('stat-ok-tasks').textContent    = tasks.filter(t => t.estado === 'OK').length;

  const ratio = window.githubApi.computeFixedFoundRatio(tasks);
  document.getElementById('stat-fixed-ratio').textContent = `${(ratio * 100).toFixed(2)}%`;
}

function renderMemberToggles() {
  const container = document.getElementById('member-filters');
  if (!container) return;
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.textContent = '👥 Todos';
  allBtn.className = (activeFilter === null && activeStageFilter === null)
    ? 'px-3 py-1 text-xs font-bold rounded-md bg-emerald-500 text-slate-950 transition-all'
    : 'px-3 py-1 text-xs font-bold rounded-md text-slate-400 hover:text-white transition-all';
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
      ? 'px-3 py-1 text-xs font-bold rounded-md bg-emerald-500 text-slate-950 transition-all'
      : 'px-3 py-1 text-xs font-bold rounded-md text-slate-400 hover:text-white transition-all';
    btn.addEventListener('click', () => {
      activeFilter = (activeFilter === member) ? null : member;
      renderDashboard();
    });
    container.appendChild(btn);
  }
}

function renderKanbanBoard() {
  const tasks = getFilteredTasks(currentTasks.filter(t => t.estado !== 'Obsolete'));

  // Update Global Toggle Icon
  const globalToggle = document.getElementById('global-kanban-toggle');
  if (globalToggle) {
    const anyExpanded = tasks.some(t => localStorage.getItem(`task_minimized_${t.id}`) !== 'true');
    const icon = globalToggle.querySelector('i');
    if (icon) {
      icon.className = anyExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
    }
  }

  for (const col of KANBAN_COLUMNS) {
    const colEl = document.getElementById(`kanban-col-${col.id}`);
    if (!colEl) continue;
    const cardsEl = colEl.querySelector('.kanban-cards');
    const countEl = colEl.querySelector('.col-count');
    
    const colTasks = tasks.filter(t => getTaskColumn(t) === col.id);
    countEl.textContent = colTasks.length;
    cardsEl.innerHTML = '';

    for (const task of colTasks) {
      const card = buildTaskCard(task);
      cardsEl.appendChild(card);
    }

    cardsEl.ondragover = (e) => { e.preventDefault(); colEl.classList.add('drag-over'); };
    cardsEl.ondragleave = () => colEl.classList.remove('drag-over');
    cardsEl.ondrop = async (e) => {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      const taskId = parseInt(e.dataTransfer.getData('text/plain'), 10);
      await handleCardDrop(taskId, col.id);
    };
  }
}

function getTaskColumn(task) {
  const estado = task.estado === '?' ? 'In Review' : task.estado;
  if (['Pending','ToDo'].includes(estado) || estado === null) return 'backlog';
  if (['Working','KO'].includes(estado)) return 'working';
  if (estado === 'Fixed' || estado === 'In Review') return 'qa';
  if (['OK','Closed'].includes(estado)) return 'done';
  return 'backlog';
}

function buildTaskCard(task) {
  const isMinimized = localStorage.getItem(`task_minimized_${task.id}`) === 'true';
  const hasImages = task.images && task.images.length > 0;
  const isImagesExpanded = localStorage.getItem(`task_images_expanded_${task.id}`) === 'true';
  const card = document.createElement('div');
  card.className = `bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-500 transition-all group relative ${isMinimized ? 'py-2' : ''}`;
  card.draggable = true;
  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', String(task.id));
    card.classList.add('opacity-50');
  });
  card.addEventListener('dragend', () => card.classList.remove('opacity-50'));

  const priorityColors = {
    Critical: 'bg-red-500 text-slate-950 font-black',
    Major:    'bg-orange-500 text-slate-950 font-black',
    Medium:   'bg-yellow-500 text-slate-950 font-black',
    Minor:    'bg-slate-700 text-slate-300',
    Cosmetic: 'bg-slate-800 text-slate-400',
    ToDo:     'bg-indigo-500 text-white font-bold',
    Obsolete: 'bg-slate-950 text-slate-500 line-through'
  };

  const priorityColorsMinimized = {
    Critical: 'bg-red-500 text-slate-950',
    Major:    'bg-orange-500 text-slate-950',
    Medium:   'bg-yellow-500 text-slate-950',
    Minor:    'bg-slate-700 text-slate-300',
    Cosmetic: 'bg-slate-800 text-slate-400',
    ToDo:     'bg-indigo-500 text-white',
    Obsolete: 'bg-slate-950 text-slate-500 line-through'
  };

  const estado = task.estado === '?' ? 'In Review' : (task.estado || 'Pending');
  const stateInfo = STATE_CONFIG[estado] || { color: 'bg-slate-700', label: estado };

    const canArchive = ['OK', 'Closed', 'Obsolete'].includes(estado);

  if (isMinimized) {
    card.innerHTML = `
      <div class="flex justify-between items-center gap-2">
        <div class="flex items-center gap-2 overflow-hidden">
          <span class="text-[9px] font-mono text-slate-500 flex-shrink-0">#${task.id}</span>
          <button onclick="openEditTaskModal('${task.id}')" class="text-[10px] text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
            <i class="fa-solid fa-pencil"></i>
          </button>
          <p class="text-xs text-slate-200 truncate font-semibold">${task.descripcion}</p>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          ${canArchive ? `
            <button onclick="handleArchiveTask('${task.id}')" class="text-slate-500 hover:text-emerald-400 mr-1 transition-colors" title="Archivar">
                <i class="fa-solid fa-box-archive text-[10px]"></i>
            </button>
          ` : ''}
          <span class="text-[8px] font-bold px-1 py-0.5 rounded ${priorityColorsMinimized[task.prioridad] || 'bg-slate-700'}">${task.prioridad[0]}</span>
          <span class="text-[8px] font-bold px-1 py-0.5 rounded ${stateInfo.color}">${stateInfo.label}</span>
          <button onclick="toggleTaskMinimize('${task.id}')" class="text-slate-500 hover:text-white ml-1">
            <i class="fa-solid fa-chevron-down"></i>
          </button>
        </div>
      </div>
    `;
  } else {
    card.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <div class="flex gap-2 items-center">
          <span class="text-[9px] font-mono text-slate-500">#${task.id}</span>
          <button onclick="openEditTaskModal('${task.id}')" class="text-[10px] text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all">
            <i class="fa-solid fa-pencil"></i>
          </button>
        </div>
        <div class="flex gap-2 items-center">
          ${canArchive ? `
            <button onclick="handleArchiveTask('${task.id}')" class="text-[10px] font-bold text-slate-500 hover:text-emerald-400 flex items-center gap-1 px-2 py-0.5 bg-slate-900 rounded border border-slate-700 transition-all mr-2" title="Mover al Cementerio">
                <i class="fa-solid fa-box-archive"></i> ARCHIVAR
            </button>
          ` : ''}
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${priorityColors[task.prioridad] || 'bg-slate-700'}">${task.prioridad.toUpperCase()}</span>
          <button onclick="toggleTaskMinimize('${task.id}')" class="text-slate-500 hover:text-white">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
        </div>
      </div>
      <p class="text-sm text-slate-200 leading-snug mb-3">${task.descripcion}</p>

      ${hasImages ? `
      <div class="mb-3 border border-slate-700 rounded-lg overflow-hidden">
        <button onclick="toggleCardImages('${task.id}')" class="w-full flex items-center justify-between p-2 bg-slate-900/50 hover:bg-slate-900 transition-all text-[10px] font-bold text-slate-400">
            <span><i class="fa-solid fa-paperclip mr-1"></i> ${task.images.length} imágenes</span>
            <i class="fa-solid fa-chevron-${isImagesExpanded ? 'up' : 'down'}"></i>
        </button>
        <div id="card-images-${task.id}" class="${isImagesExpanded ? '' : 'hidden'} p-2 bg-slate-950 grid grid-cols-3 gap-2">
            ${task.images.map((img, idx) => `
                <div class="aspect-square rounded border border-slate-800 overflow-hidden cursor-pointer hover:border-emerald-500 transition-all" onclick="openLightbox('${task.id}', ${idx})">
                    <img src="${img.src}" class="w-full h-full object-cover" alt="Task image">
                </div>
            `).join('')}
        </div>
      </div>
      ` : ''}

      <div class="mb-3">
          <select onchange="handleQuickStageUpdate(${task.id}, this.value)" class="w-full bg-slate-950/50 border border-slate-700 rounded text-[10px] p-1 text-slate-400 focus:text-white focus:border-indigo-500 outline-none">
              ${STAGES.map(s => `<option value="${s}" ${task.tema_principal === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
      </div>

      ${task.jules_session_id ? `
      <div class="mb-3 p-2 bg-indigo-500/10 border border-indigo-500/20 rounded flex items-center justify-between">
          <span class="text-[9px] font-bold text-indigo-400 flex items-center gap-1">
              <i class="fa-solid fa-robot"></i> JULES
          </span>
          <span id="jules-status-${task.id}" class="text-[8px] font-mono text-indigo-300 uppercase">Cargando...</span>
      </div>
      ` : ''}

      <div class="flex justify-between items-end">
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <div class="flex -space-x-2">
              ${task.resuelto_por ? `<div onclick="scrollToProfile('${task.resuelto_por}')" title="Resuelto por: ${task.resuelto_por}" class="w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-slate-950 cursor-pointer hover:scale-110 transition-transform">${task.resuelto_por[0]}</div>` : ''}
              ${task.detectado_por ? `<div onclick="scrollToProfile('${task.detectado_por}')" title="Detectado por: ${task.detectado_por}" class="w-6 h-6 rounded-full bg-indigo-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-white cursor-pointer hover:scale-110 transition-transform">${task.detectado_por[0]}</div>` : ''}
              ${task.apoyo ? `<div onclick="scrollToProfile('${task.apoyo}')" title="Apoyo: ${task.apoyo}" class="w-6 h-6 rounded-full bg-purple-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-white cursor-pointer hover:scale-110 transition-transform">${task.apoyo[0]}</div>` : ''}
            </div>
            <span class="text-[8px] font-bold px-1.5 py-0.5 rounded ${stateInfo.color}">${stateInfo.label.toUpperCase()}</span>
          </div>

          <div onclick="openAssignmentModal(${task.id})" class="flex -space-x-1.5 cursor-pointer hover:opacity-80 transition-opacity min-h-[24px] items-center">
            ${(task.asignados || []).length > 0
              ? task.asignados.map(handle => {
                  const name = MEMBER_MAPPING[handle] || handle;
                  return `<img src="https://github.com/${handle}.png" class="w-6 h-6 rounded-full border-2 border-slate-800 shadow-sm" title="Asignado: ${name}">`;
                }).join('')
              : `<div class="w-6 h-6 rounded-full border border-dashed border-slate-600 flex items-center justify-center text-slate-500 hover:border-emerald-500 hover:text-emerald-500 transition-colors">
                   <i class="fa-solid fa-plus text-[10px]"></i>
                 </div>`
            }
          </div>
          ${task.email_responsable ? `<div class="text-[8px] text-slate-500 mt-1 flex items-center gap-1"><i class="fa-solid fa-envelope text-[7px]"></i> ${task.email_responsable}</div>` : ''}
        </div>
        <div class="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
          ${task.rama}${task.rama2 ? ` / ${task.rama2}` : ''}
        </div>
      </div>
    `;
  }
  return card;
}

function toggleTaskMinimize(taskId) {
  const key = `task_minimized_${taskId}`;
  const current = localStorage.getItem(key) === 'true';
  localStorage.setItem(key, !current);
  renderKanbanBoard();
}

function toggleCardImages(taskId) {
    const key = `task_images_expanded_${taskId}`;
    const current = localStorage.getItem(key) === 'true';
    localStorage.setItem(key, !current);
    renderKanbanBoard();
}

function toggleAllTasks() {
  const tasks = getFilteredTasks(currentTasks.filter(t => t.estado !== 'Obsolete'));
  const anyExpanded = tasks.some(t => localStorage.getItem(`task_minimized_${t.id}`) !== 'true');

  // If any expanded -> minimize all. If all minimized -> expand all.
  const newState = anyExpanded; // if anyExpanded is true, we want to minimize (set to true)

  tasks.forEach(t => {
    localStorage.setItem(`task_minimized_${t.id}`, newState);
  });

  renderKanbanBoard();
}

// ─── CHART RENDERING ──────────────────────────────────────────

function renderQAVelocityChart() {
  const ctx = document.getElementById('qa-velocity-chart').getContext('2d');
  if (!ctx || !currentTasks) return;

  // Use either activeFilter or all members
  const labels = activeFilter ? [activeFilter] : MEMBERS;
  const filteredStats = window.githubApi.computeAllMemberStats(currentTasks, labels);

  const found = labels.map(name => filteredStats[name].found);
  const fixedOK = labels.map(name => filteredStats[name].fixed_ok);
  const support = labels.map(name => filteredStats[name].support_ok);

  if (window.__qaVelocityChart__) window.__qaVelocityChart__.destroy();
  window.__qaVelocityChart__ = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Bugs encontrados',   data: found,   backgroundColor: 'rgba(251,191,36,0.8)' },
        { label: 'Bugs resueltos (OK)', data: fixedOK, backgroundColor: 'rgba(52,211,153,0.8)' },
        { label: 'Apoyo con OK',        data: support, backgroundColor: 'rgba(139,92,246,0.8)' }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#e2e8f0' } },
        title:  { display: true, text: 'Velocidad QA', color: '#f1f5f9' }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } },
        y: { ticks: { color: '#e2e8f0' }, grid: { display: false } }
      }
    }
  });
}

function renderBurnoutGauge() {
  const ctx = document.getElementById('burnout-gauge-canvas').getContext('2d');
  if (!ctx || !currentBudget) return;

  const tasks = getFilteredTasks(currentTasks);
  const current = currentBudget.burnout?.current_milestone || 'M1';
  const milData = (currentBudget.burnout?.milestones || []).find(m => m.id === current);

  const burnoutIndex = milData
    ? window.githubApi.computeBurnoutIndex(tasks, current, milData.date_start, milData.date_end)
    : 0;

  document.getElementById('burnout-index-value').textContent = `${(burnoutIndex * 100).toFixed(1)}%`;
  const color = burnoutIndex < 0.4 ? '#34d399' : burnoutIndex < 0.7 ? '#fbbf24' : '#f87171';
  const label = burnoutIndex < 0.4 ? UI_STRINGS.burnoutLow : burnoutIndex < 0.7 ? UI_STRINGS.burnoutMedium : UI_STRINGS.burnoutHigh;

  if (window.__burnoutChart__) window.__burnoutChart__.destroy();
  window.__burnoutChart__ = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data:            [burnoutIndex, 1 - burnoutIndex],
        backgroundColor: [color, 'rgba(30,41,59,0.6)'],
        borderWidth:     0,
        circumference:   180,
        rotation:        270
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '85%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        title: {
          display: true,
          text:    label,
          color:   color,
          font:    { size: 12 }
        }
      }
    }
  });
}

function renderBudgetChart() {
  const ctx = document.getElementById('budget-doughnut-canvas').getContext('2d');
  if (!ctx || !currentBudget) return;

  const categories = currentBudget.categories || [];
  const labels = categories.map(c => c.label);
  const values = categories.map(c => {
    let total = 0;
    if (c.roles)   c.roles.forEach(r => total += (r.hourly_rate || 0) * (r.monthly_hours || 0));
    if (c.entries) c.entries.forEach(e => total += e.cost_monthly || 0);
    return total;
  });

  const PALETTE = ['#6366f1','#34d399','#fbbf24','#f87171','#a78bfa','#38bdf8','#fb923c'];

  if (window.__budgetChart__) window.__budgetChart__.destroy();
  window.__budgetChart__ = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data:            values,
        backgroundColor: PALETTE,
        borderColor:     'rgba(15,23,42,0.8)',
        borderWidth:     2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#e2e8f0', padding: 16, font: { size: 11 } } },
        title:  { display: true, text: 'Distribución de Presupuesto', color: '#f1f5f9', font: { size: 14 } }
      }
    }
  });
}

function renderHallOfFame() {
  const container = document.getElementById('hall-of-fame-grid');
  if (!container || !currentTasks) return;

  const hof = window.githubApi.computeHallOfFame(currentTasks, MEMBERS);
  const filtered = activeFilter ? hof.filter(e => e.name === activeFilter) : hof;

  container.innerHTML = '';
  filtered.slice(0, 5).forEach(entry => {
    const el = document.createElement('div');
    el.className = 'flex items-center gap-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800 cursor-pointer hover:bg-slate-900 transition-colors';
    el.onclick = () => scrollToProfile(entry.name);
    el.innerHTML = `
      <div class="text-2xl">${entry.medal}</div>
      <div class="flex-grow">
        <div class="text-sm font-bold text-white">${entry.name}</div>
        <div class="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Score: ${(entry.score * 100).toFixed(1)}%</div>
      </div>
      <div class="flex gap-3 text-xs text-slate-400">
        <span title="Encontrados">🔍 ${entry.found}</span>
        <span title="Resueltos OK">✅ ${entry.fixed_ok}</span>
      </div>
    `;
    container.appendChild(el);
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
        bar.onclick = toggleAlertsPanel;
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
            ${a.taskId ? `<button onclick="scrollToTask(${a.taskId})" class="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all uppercase">Ver Tarea</button>` : ''}
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
    if (card.querySelector('.text-\\[9px\\]')?.textContent === `#${id}`) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('ring-4', 'ring-emerald-500', 'ring-offset-4', 'ring-offset-slate-950');
      setTimeout(() => card.classList.remove('ring-4', 'ring-emerald-500', 'ring-offset-4', 'ring-offset-slate-950'), 3000);
      return;
    }
  }
}

function renderPipelineSwimlanes() {
  const container = document.getElementById('pipeline-swimlanes');
  if (!container) return;
  container.innerHTML = '';

  const STAGES = [
    { id: 'CONCEPT',        label: 'Concept',        icon: 'fa-lightbulb', topics: ['Concepto / GDD'] },
    { id: 'PRE-PRODUCTION', label: 'Pre-Production', icon: 'fa-map',       topics: ['Pre-producción'] },
    { id: 'PRODUCTION',     label: 'Production',     icon: 'fa-gears',     topics: ['Tools / Automation', 'Arte / Assets', 'Programación / Engine'] },
    { id: 'ALPHA',          label: 'Alpha',          icon: 'fa-flask',     topics: ['QA / Testing'], milestoneFilter: 'M1' },
    { id: 'BETA',           label: 'Beta',           icon: 'fa-bug',       topics: ['QA / Testing'], milestoneFilter: 'M2' },
    { id: 'GOLD',           label: 'Gold',           icon: 'fa-compact-disc', topics: ['Build / Deploy'] },
    { id: 'SHIPPED',        label: 'Shipped',        icon: 'fa-truck-fast', topics: ['Post-launch'] }
  ];

  STAGES.forEach(stage => {
    const stageTasks = currentTasks.filter(t =>
      stage.topics.includes(t.tema_principal) &&
      (!stage.milestoneFilter || t.milestone === stage.milestoneFilter)
    );

    const total = stageTasks.length;
    const ok = stageTasks.filter(t => t.estado === 'OK').length;
    const pct = total > 0 ? (ok / total) * 100 : 0;

    const assignees = [...new Set(stageTasks.map(t => t.resuelto_por || t.detectado_por).filter(Boolean))];

    const colorClass = pct < 30 ? 'bg-red-500' : pct < 70 ? 'bg-amber-500' : 'bg-emerald-500';

    const card = document.createElement('div');
    card.className = 'min-w-[240px] bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 group hover:border-slate-600 transition-all cursor-pointer';
    card.onclick = () => {
        activeFilter = null;
        activeStageFilter = stage;
        renderDashboard();
        showToast(`Filtrando por etapa: ${stage.label}`, 'info');
    };

    card.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="flex items-center gap-2">
            <i class="fa-solid ${stage.icon} text-indigo-400"></i>
            <span class="text-sm font-bold">${stage.label}</span>
        </div>
        <span class="text-[10px] font-mono text-slate-500">${ok}/${total}</span>
      </div>
      <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
        <div class="h-full ${colorClass} transition-all duration-1000" style="width: ${pct}%"></div>
      </div>
      <div class="flex justify-between items-center">
        <div class="flex -space-x-1.5">
            ${assignees.slice(0, 4).map(name => `<img src="https://github.com/${currentProfiles?.members[name]?.handle || 'ghost'}.png" class="w-5 h-5 rounded-full border border-slate-900" title="${name}">`).join('')}
            ${assignees.length > 4 ? `<div class="w-5 h-5 rounded-full bg-slate-800 border border-slate-900 flex items-center justify-center text-[8px] font-bold">+${assignees.length - 4}</div>` : ''}
        </div>
        <span class="text-[10px] font-bold text-slate-400">${pct.toFixed(0)}%</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderMilestoneBurndownChart() {
  const ctx = document.getElementById('milestone-burndown-chart').getContext('2d');
  if (!ctx || !currentBudget || !currentTasks) return;

  const milestoneId = currentBudget.burnout?.current_milestone || 'M1';
  const mil = currentBudget.burnout?.milestones?.find(m => m.id === milestoneId);
  if (!mil) return;

  const tasks = currentTasks.filter(t => t.milestone === milestoneId && t.estado !== 'Obsolete');
  const totalTasks = tasks.length;

  const start = new Date(mil.date_start);
  const end = new Date(mil.date_end);
  const daysTotal = Math.ceil((end - start) / 86400000);

  const labels = [];
  const idealData = [];
  const actualData = [];

  const today = new Date();
  const daysElapsed = Math.ceil((today - start) / 86400000);

  for (let i = 0; i <= daysTotal; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    labels.push(d.toISOString().split('T')[0]);

    // Ideal: linear from totalTasks to 0
    idealData.push(totalTasks - (totalTasks * (i / daysTotal)));

    // Actual: count tasks completed after this date or not yet completed
    if (i <= daysElapsed) {
        const remainingAtThisDay = tasks.filter(t => {
            if (t.estado !== 'OK') return true;
            // Assuming 'fecha' is the completion date if estado is 'OK'
            return new Date(t.fecha) > d;
        }).length;
        actualData.push(remainingAtThisDay);
    }
  }

  if (window.__burndownChart__) window.__burndownChart__.destroy();
  window.__burndownChart__ = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Ideal', data: idealData, borderColor: 'rgba(148,163,184,0.5)', borderDash: [5, 5], fill: false, tension: 0, pointRadius: 0 },
        { label: 'Actual', data: actualData, borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', fill: true, tension: 0.1 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#e2e8f0' } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8', maxTicksLimit: 7 }, grid: { color: 'rgba(148,163,184,0.1)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' }, beginAtZero: true }
      }
    }
  });
}

function renderDependencyGraph() {
  const container = document.getElementById('dependency-graph-container');
  if (!container) return;

  const milestoneId = currentBudget?.burnout?.current_milestone || 'M1';
  const tasks = currentTasks.filter(t => t.milestone === milestoneId && t.estado !== 'Obsolete');

  const nodes = [];
  const edges = [];

  tasks.forEach(t => {
    const blockedBy = t.comentario?.match(/#BLOCKED_BY:(\d+)/);
    const blocks = t.comentario?.match(/#BLOCKS:(\d+)/);

    if (blockedBy || blocks) {
      nodes.push(t);
      if (blockedBy) edges.push({ from: parseInt(blockedBy[1]), to: t.id, type: 'blocked_by' });
      if (blocks) edges.push({ from: t.id, to: parseInt(blocks[1]), type: 'blocks' });
    }
  });

  if (nodes.length === 0) {
    container.innerHTML = '<div class="h-full flex items-center justify-center text-slate-500 italic text-sm">No dependencies found in this milestone.</div>';
    return;
  }

  // Deduplicate nodes
  const uniqueNodes = [...new Map(nodes.map(n => [n.id, n])).values()];

  // Arrange in columns by state
  const columns = { Pending: [], Working: [], Fixed: [], OK: [] };
  uniqueNodes.forEach(n => {
    const col = n.estado === 'Pending' || n.estado === 'ToDo' || n.estado === null ? 'Pending' :
                n.estado === 'Working' || n.estado === 'KO' ? 'Working' :
                n.estado === 'Fixed' || n.estado === '?' ? 'Fixed' : 'OK';
    columns[col].push(n);
  });

  const COL_WIDTH = 200;
  const ROW_HEIGHT = 80;
  const positions = new Map();

  let svgWidth = Object.keys(columns).length * COL_WIDTH;
  let maxRow = Math.max(...Object.values(columns).map(c => c.length));
  let svgHeight = maxRow * ROW_HEIGHT + 40;

  let svgHtml = `<svg width="100%" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;

  let colIdx = 0;
  for (const [colName, colTasks] of Object.entries(columns)) {
    colTasks.forEach((t, rowIdx) => {
      const x = colIdx * COL_WIDTH + 20;
      const y = rowIdx * ROW_HEIGHT + 40;
      positions.set(t.id, { x, y });
    });
    colIdx++;
  }

  edges.forEach(e => {
    const start = positions.get(e.from);
    const end = positions.get(e.to);
    if (start && end) {
      const color = e.type === 'blocked_by' ? '#f87171' : '#fbbf24';
      const dash = e.type === 'blocked_by' ? '5,5' : '';
      svgHtml += `<path d="M ${start.x + 150} ${start.y + 20} L ${end.x} ${end.y + 20}" stroke="${color}" stroke-width="2" fill="none" stroke-dasharray="${dash}" marker-end="url(#arrowhead)"/>`;
    }
  });

  positions.forEach((pos, id) => {
    const t = uniqueNodes.find(n => n.id === id);
    const color = t.estado === 'OK' ? '#10b981' : '#6366f1';
    svgHtml += `
      <g class="cursor-pointer" onclick="scrollToTask(${id})">
        <rect x="${pos.x}" y="${pos.y}" width="150" height="40" rx="8" fill="#1e293b" stroke="${color}" stroke-width="1"/>
        <text x="${pos.x + 10}" y="${pos.y + 25}" fill="#f1f5f9" font-size="10" font-family="monospace">#${id} ${t.descripcion.substring(0, 15)}...</text>
      </g>
    `;
  });

  svgHtml += `
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orientation="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
      </marker>
    </defs>
  </svg>`;

  container.innerHTML = svgHtml;
}

function renderVelocityTrackerChart() {
  const ctx = document.getElementById('velocity-tracker-chart').getContext('2d');
  if (!ctx || !currentTasks) return;

  // Group tasks by week
  const createdByWeek = {};
  const completedByWeek = {};

  currentTasks.forEach(t => {
    if (t.estado === 'Obsolete') return;

    const weekC = getWeekNumber(new Date(t.fecha_creacion || t.fecha)); // Fallback to fecha
    createdByWeek[weekC] = (createdByWeek[weekC] || 0) + 1;

    if (t.estado === 'OK') {
        const weekO = getWeekNumber(new Date(t.fecha));
        completedByWeek[weekO] = (completedByWeek[weekO] || 0) + 1;
    }
  });

  const weeks = [...new Set([...Object.keys(createdByWeek), ...Object.keys(completedByWeek)])].sort();
  const createdData = weeks.map(w => createdByWeek[w] || 0);
  const completedData = weeks.map(w => completedByWeek[w] || 0);
  const netVelocity = weeks.map(w => (completedByWeek[w] || 0) - (createdByWeek[w] || 0));

  if (window.__velocityChart__) window.__velocityChart__.destroy();
  window.__velocityChart__ = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weeks.map(w => `Semana ${w}`),
      datasets: [
        { label: 'Creadas', data: createdData, backgroundColor: 'rgba(248, 113, 113, 0.5)' },
        { label: 'Completadas', data: completedData, backgroundColor: 'rgba(52, 211, 153, 0.5)' },
        { label: 'Velocidad Neta', data: netVelocity, type: 'line', borderColor: '#facc15', tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#e2e8f0' } } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } }
      }
    }
  });
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function renderTeamProfiles() {
  const grid = document.getElementById('team-profiles-grid');
  if (!grid || !currentProfiles) return;
  grid.innerHTML = '';

  const memberStats = window.githubApi.computeAllMemberStats(currentTasks, MEMBERS);

  Object.entries(currentProfiles.members).forEach(([name, profile]) => {
    const stats = memberStats[name] || { found: 0, fixed_ok: 0, support_ok: 0, score: 0 };
    const isSelf = window.currentUser === (profile.handle || '').toLowerCase();
    
    const card = document.createElement('div');
    card.id = `profile-card-${name.toLowerCase()}`;
    card.className = `bg-slate-900 border ${isSelf ? 'border-emerald-500 ring-1 ring-emerald-500 pulse-emerald' : 'border-slate-800'} rounded-2xl overflow-hidden relative group transition-all`;
    card.dataset.member = name;

    card.innerHTML = `
      <div class="h-2" style="background-color: ${profile.color_accent}"></div>
      <div class="p-6">
        <div class="flex justify-between items-start mb-4">
          <img src="https://github.com/${profile.handle || 'ghost'}.png" class="w-16 h-16 rounded-2xl border-2 border-slate-800 shadow-xl bg-slate-800">
          ${isSelf ? `<button onclick="toggleProfileEdit('${name}')" class="p-2 text-slate-500 hover:text-white transition-colors"><i class="fa-solid fa-pencil"></i></button>` : ''}
        </div>
        <h3 class="text-xl font-bold mb-1 text-white">${profile.display_name}</h3>
        <div class="text-xs text-emerald-400 font-bold uppercase tracking-wider mb-3">${profile.role || 'Sin Rol'}</div>
        <p class="text-sm text-slate-400 leading-relaxed mb-4 h-12 overflow-hidden">${profile.bio || 'Sin biografía disponible.'}</p>
        
        <div class="grid grid-cols-2 gap-2 mb-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-[10px] font-mono">
          <div class="text-slate-500">SCORE: <span class="text-emerald-400">${(stats.score * 100).toFixed(1)}%</span></div>
          <div class="text-slate-500">FOUND: <span class="text-amber-400">${stats.found}</span></div>
          <div class="text-slate-500">FIXED: <span class="text-emerald-400">${stats.fixed_ok}</span></div>
          <div class="text-slate-500">SUPPORT: <span class="text-indigo-400">${stats.support_ok}</span></div>
        </div>

        <div class="flex gap-3 text-slate-500">
          ${profile.links.github ? `<a href="${profile.links.github}" target="_blank" class="hover:text-white"><i class="fa-brands fa-github"></i></a>` : ''}
          ${profile.links.twitter ? `<a href="${profile.links.twitter}" target="_blank" class="hover:text-white"><i class="fa-brands fa-twitter"></i></a>` : ''}
          ${profile.links.itch ? `<a href="${profile.links.itch}" target="_blank" class="hover:text-white"><i class="fa-brands fa-itch-io"></i></a>` : ''}
        </div>
      </div>

      <!-- Edit Overlay -->
      <div id="edit-overlay-${name}" class="hidden absolute inset-0 bg-slate-900 z-10 p-6 flex flex-col gap-3">
        <div class="text-xs font-bold text-slate-500 uppercase">Editar Perfil</div>
        <input type="text" id="edit-name-${name}" value="${profile.display_name}" class="bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white" placeholder="Nombre">
        <input type="text" id="edit-role-${name}" value="${profile.role}" class="bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white" placeholder="Rol">
        <input type="url" id="edit-portfolio-${name}" value="${profile.portfolio || ''}" class="bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white" placeholder="Portfolio URL">
        <textarea id="edit-bio-${name}" class="bg-slate-950 border border-slate-800 rounded p-2 text-sm text-white flex-grow" placeholder="Bio">${profile.bio}</textarea>
        <div class="flex gap-2">
          <button onclick="saveProfileEdit('${name}')" class="flex-grow py-2 bg-emerald-500 text-slate-950 font-bold rounded text-xs">Guardar</button>
          <button onclick="toggleProfileEdit('${name}')" class="py-2 px-4 border border-slate-700 rounded text-xs text-white">X</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ─── ACTIONS & EVENT HANDLERS ────────────────────────────────

function setupEventListeners() {
  const taskCancel = document.getElementById('task-cancel-btn');
  const taskSave = document.getElementById('task-save-btn');
  const qaCancel = document.getElementById('qa-cancel-btn');
  const assignCancel = document.getElementById('assignment-cancel-btn');

  if (taskCancel) taskCancel.onclick = () => document.getElementById('create-task-modal').classList.add('hidden');
  if (taskSave) taskSave.onclick = handleCreateTask;
  if (qaCancel) qaCancel.onclick = () => document.getElementById('qa-assignment-modal').classList.add('hidden');
  if (assignCancel) assignCancel.onclick = () => document.getElementById('assignment-modal').classList.add('hidden');

  // Image handling
  const dropzone = document.getElementById('task-image-dropzone');
  const fileInput = document.getElementById('task-image-input');
  const taskModal = document.getElementById('create-task-modal');

  if (dropzone && fileInput) {
      dropzone.onclick = () => fileInput.click();
      dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('border-emerald-500', 'bg-emerald-500/10'); };
      dropzone.ondragleave = () => dropzone.classList.remove('border-emerald-500', 'bg-emerald-500/10');
      dropzone.ondrop = (e) => {
          e.preventDefault();
          dropzone.classList.remove('border-emerald-500', 'bg-emerald-500/10');
          handleImageFiles(e.dataTransfer.files);
      };
      fileInput.onchange = (e) => handleImageFiles(e.target.files);
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

function showToast(mensaje, tipo = 'info', duracionMs = 4000) {
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

function populateMemberSelects() {
    const resolverSelect = document.getElementById('task-resolver-input');
    const detectorSelect = document.getElementById('task-detector-input');
    const asignadosContainer = document.getElementById('task-asignados-container');
    if (!resolverSelect || !detectorSelect || !asignadosContainer) return;

    const options = `<option value="">-- Unassigned --</option>` +
        MEMBERS.map(m => `<option value="${m}">${m}</option>`).join('');

    resolverSelect.innerHTML = options;
    detectorSelect.innerHTML = options;

    asignadosContainer.innerHTML = '';
    Object.entries(MEMBER_MAPPING).forEach(([handle, name]) => {
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 bg-slate-900 px-2 py-1 rounded border border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors';
        label.innerHTML = `
            <input type="checkbox" name="asignados" value="${handle}" class="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500">
            <span class="text-[10px] font-bold">${name}</span>
        `;
        asignadosContainer.appendChild(label);
    });
}

function openCreateTaskModal() {
  populateMemberSelects();
  document.getElementById('task-modal-title').textContent = 'Crear Nueva Tarea';
  document.getElementById('task-id-input').value = '';
  document.getElementById('task-desc-input').value = '';
  document.getElementById('task-rama-input').value = 'PRO';
  document.getElementById('task-priority-input').value = 'Major';
  document.getElementById('task-milestone-input').value = 'M1';
  document.getElementById('task-topic-input').value = 'Programación / Engine';
  document.getElementById('task-status-input').value = 'Pending';
  document.getElementById('task-completion-input').value = '0';
  document.getElementById('task-resolver-input').value = '';
  document.getElementById('task-detector-input').value = activeFilter || '';
  document.getElementById('task-email-responsable-input').value = '';
  document.getElementById('task-emails-asignados-input').value = '';

  currentTaskImages = [];
  renderImagePreviews();
  const imageSection = document.getElementById('task-image-section');
  if (imageSection) imageSection.classList.add('hidden');
  const chevron = document.getElementById('task-image-chevron');
  if (chevron) chevron.className = 'fa-solid fa-chevron-down';

  const checkboxes = document.querySelectorAll('#task-asignados-container input[name="asignados"]');
  checkboxes.forEach(cb => cb.checked = false);

  document.getElementById('create-task-modal').classList.remove('hidden');
}

function openEditTaskModal(taskId) {
    const task = currentTasks.find(t => t.id === taskId);
    if (!task) return;

    populateMemberSelects();
    document.getElementById('task-modal-title').textContent = `Editar Tarea #${taskId}`;
    document.getElementById('task-id-input').value = taskId;
    document.getElementById('task-desc-input').value = task.descripcion || '';
    document.getElementById('task-rama-input').value = task.rama || 'PRO';
    document.getElementById('task-priority-input').value = task.prioridad || 'Major';
    document.getElementById('task-milestone-input').value = task.milestone || 'M1';
    document.getElementById('task-topic-input').value = task.tema_principal || 'Programación / Engine';
    let status = task.estado || 'Pending';
    if (status === '?') status = 'In Review';
    document.getElementById('task-status-input').value = status;
    document.getElementById('task-completion-input').value = task.completitud || '0';
    document.getElementById('task-resolver-input').value = task.resuelto_por || '';
    document.getElementById('task-detector-input').value = task.detectado_por || '';
    document.getElementById('task-email-responsable-input').value = task.email_responsable || '';
    document.getElementById('task-emails-asignados-input').value = (task.emails_asignados || []).join(', ');

    currentTaskImages = JSON.parse(JSON.stringify(task.images || []));
    renderImagePreviews();
    const imageSection = document.getElementById('task-image-section');
    if (imageSection) imageSection.classList.add('hidden');
    const chevron = document.getElementById('task-image-chevron');
    if (chevron) chevron.className = 'fa-solid fa-chevron-down';

    const checkboxes = document.querySelectorAll('#task-asignados-container input[name="asignados"]');
    checkboxes.forEach(cb => {
        cb.checked = (task.asignados || []).includes(cb.value);
    });

    document.getElementById('create-task-modal').classList.remove('hidden');
}

function openAssignmentModal(taskId) {
    const task = currentTasks.find(t => t.id === taskId);
    if (!task) return;

    const list = document.getElementById('assignment-list');
    list.innerHTML = '';

    Object.entries(MEMBER_MAPPING).forEach(([handle, name]) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-emerald-500/50 transition-all';
        const isChecked = (task.asignados || []).includes(handle);

        item.innerHTML = `
            <div class="flex items-center gap-3">
                <img src="https://github.com/${handle}.png" class="w-8 h-8 rounded-full border border-slate-800">
                <span class="text-sm font-bold text-slate-200">${name}</span>
            </div>
            <input type="checkbox" value="${handle}" ${isChecked ? 'checked' : ''} class="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900">
        `;
        list.appendChild(item);
    });

    const modal = document.getElementById('assignment-modal');
    modal.classList.remove('hidden');

    document.getElementById('assignment-save-btn').onclick = async () => {
        const selected = Array.from(list.querySelectorAll('input:checked')).map(cb => cb.value);
        showToast(UI_STRINGS.saving, 'info');
        modal.classList.add('hidden');
        try {
            await window.githubApi.updateTask(taskId, { asignados: selected });
            showToast(`Asignados actualizados para #${taskId}`, 'success');
            await refreshDashboardData();
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    };
}

async function handleQuickStageUpdate(taskId, newStage) {
    showToast(UI_STRINGS.saving, 'info');
    try {
        await window.githubApi.updateTask(taskId, { tema_principal: newStage });
        showToast(`Tarea #${taskId} movida a ${newStage}`, 'success');
        await refreshDashboardData();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}

async function handleCreateTask() {
  const taskId = document.getElementById('task-id-input').value;
  const desc = document.getElementById('task-desc-input').value;
  const rama = document.getElementById('task-rama-input').value;
  const priority = document.getElementById('task-priority-input').value;
  const milestone = document.getElementById('task-milestone-input').value;
  const topic = document.getElementById('task-topic-input').value;
  const status = document.getElementById('task-status-input').value;
  const completion = parseFloat(document.getElementById('task-completion-input').value) || 0;
  const resolver = document.getElementById('task-resolver-input').value || null;
  const detector = document.getElementById('task-detector-input').value || 'Unassigned';
  const asignados = Array.from(document.querySelectorAll('#task-asignados-container input[name="asignados"]:checked')).map(cb => cb.value);
  const emailResponsable = document.getElementById('task-email-responsable-input').value || null;
  const emailsAsignados = (document.getElementById('task-emails-asignados-input').value || '').split(',').map(e => e.trim()).filter(e => e);

  if (!desc) return showToast('La descripción es obligatoria', 'warning');

  const taskData = {
    rama,
    descripcion: desc,
    tema_principal: topic,
    prioridad: priority,
    milestone,
    estado: status,
    completitud: completion,
    resuelto_por: resolver,
    detectado_por: detector,
    asignados: asignados,
    email_responsable: emailResponsable,
    emails_asignados: emailsAsignados,
    images: currentTaskImages
  };

  showToast(UI_STRINGS.saving, 'info');
  document.getElementById('create-task-modal').classList.add('hidden');

  try {
    if (taskId) {
        await window.githubApi.updateTask(parseInt(taskId), taskData);
        showToast(`Tarea #${taskId} actualizada`, 'success');
    } else {
        const newTask = {
            ...taskData,
            rama2: null,
            ver: true,
            fecha: new Date().toISOString().split('T')[0],
            apoyo: null,
            limite: null,
            comentario: ''
        };
        await window.githubApi.createTask(newTask);
        showToast('Tarea creada correctamente', 'success');
    }
    await refreshDashboardData();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function handleArchiveTask(taskId) {
    if (!confirm(`¿Estás seguro de que quieres enviar la tarea #${taskId} al Cementerio?`)) return;
    showToast(UI_STRINGS.saving, 'info');
    try {
        await window.githubApi.archiveTask(taskId);
        showToast(`Tarea #${taskId} enviada al Cementerio`, 'success');
        await refreshDashboardData();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}

async function handleRestoreTask(taskId) {
    showToast(UI_STRINGS.saving, 'info');
    try {
        await window.githubApi.restoreTask(taskId);
        showToast(`Tarea #${taskId} resucitada del Cementerio`, 'success');
        await refreshDashboardData();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
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
                <button onclick="handleRestoreTask('${task.id}')" class="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <i class="fa-solid fa-hand-holding-heart"></i> RESUCITAR
                </button>
            </div>
            <p class="text-xs text-slate-400 line-clamp-2">${task.descripcion}</p>
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

async function handleCardDrop(taskId, targetColumnId) {
  const stateMap = { backlog: 'Pending', working: 'Working', qa: 'Fixed', done: 'OK' };
  const newEstado = stateMap[targetColumnId];

  let resolverHandle = null;
  let testerHandle   = null;

  if (targetColumnId === 'qa') {
    const selection = await promptQAAssignment(taskId);
    if (!selection) return;
    testerHandle = selection.tester;
    resolverHandle = selection.resolver;
  }

  showToast(UI_STRINGS.saving, 'info');
  try {
    await window.githubApi.updateTaskStatus(taskId, newEstado, resolverHandle, testerHandle);
    showToast(UI_STRINGS.taskMoved(taskId, targetColumnId), 'success');
    await refreshDashboardData();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

function promptQAAssignment(taskId) {
  return new Promise((resolve) => {
    const modal = document.getElementById('qa-assignment-modal');
    const testerSelect = document.getElementById('qa-tester-select');
    const resolverSelect = document.getElementById('qa-resolver-select');

    [testerSelect, resolverSelect].forEach(s => {
      s.innerHTML = '<option value="">-- Seleccionar --</option>';
      MEMBERS.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        s.appendChild(opt);
      });
    });

    modal.classList.remove('hidden');
    document.getElementById('qa-confirm-btn').onclick = () => {
      if (!testerSelect.value || !resolverSelect.value) {
        showToast(UI_STRINGS.qaRequired, 'warning');
        return;
      }
      modal.classList.add('hidden');
      resolve({ tester: testerSelect.value, resolver: resolverSelect.value });
    };
    document.getElementById('qa-cancel-btn').onclick = () => {
      modal.classList.add('hidden');
      resolve(null);
    };
  });
}

function toggleTaskImageSection() {
    const section = document.getElementById('task-image-section');
    const chevron = document.getElementById('task-image-chevron');
    if (section && chevron) {
        section.classList.toggle('hidden');
        chevron.classList.toggle('fa-chevron-up');
        chevron.classList.toggle('fa-chevron-down');
    }
}

function handleImageFiles(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            showToast(`Archivo no válido: ${file.name}. Solo se aceptan imágenes.`, 'warning');
            continue;
        }

        if (file.size > 2 * 1024 * 1024) {
            showToast(`Imagen demasiado grande: ${file.name}. Máximo 2MB.`, 'warning');
            continue;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const imgObj = {
                id: Math.random().toString(36).substr(2, 9),
                name: file.name,
                src: e.target.result,
                createdAt: new Date().toISOString()
            };
            currentTaskImages.push(imgObj);
            renderImagePreviews();
        };
        reader.readAsDataURL(file);
    }
}

function renderImagePreviews() {
    const container = document.getElementById('task-image-previews');
    if (!container) return;
    container.innerHTML = '';

    currentTaskImages.forEach((img, idx) => {
        const div = document.createElement('div');
        div.className = 'relative group aspect-square rounded-lg overflow-hidden border border-slate-700 bg-slate-950';
        div.innerHTML = `
            <img src="${img.src}" class="w-full h-full object-cover" alt="">
            <div class="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button type="button" onclick="openLightbox('current', ${idx})" class="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center hover:scale-110 transition-transform">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button type="button" onclick="removeTaskImage('${img.id}')" class="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:scale-110 transition-transform">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="name-label absolute bottom-0 left-0 right-0 p-1 bg-slate-950/80 text-[8px] text-slate-300 truncate pointer-events-none">
            </div>
        `;
        div.querySelector('.name-label').textContent = img.name;
        container.appendChild(div);
    });
}

function removeTaskImage(imgId) {
    currentTaskImages = currentTaskImages.filter(img => img.id !== imgId);
    renderImagePreviews();
}

function openLightbox(srcOrTaskId, imageIndex) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    if (!modal || !img) return;

    if (imageIndex === undefined) {
        // Fallback or direct src (discouraged for large base64)
        img.src = srcOrTaskId;
    } else {
        if (srcOrTaskId === 'current') {
            if (currentTaskImages[imageIndex]) {
                img.src = currentTaskImages[imageIndex].src;
            }
        } else {
            const task = currentTasks.find(t => String(t.id) === String(srcOrTaskId));
            if (task && task.images && task.images[imageIndex]) {
                img.src = task.images[imageIndex].src;
            }
        }
    }
    modal.classList.remove('hidden');
}

function closeLightbox() {
    const modal = document.getElementById('lightbox-modal');
    if (modal) modal.classList.add('hidden');
}

function toggleProfileEdit(memberName) {
  const overlay = document.getElementById(`edit-overlay-${memberName}`);
  if (overlay) overlay.classList.toggle('hidden');
}

function scrollToProfile(memberName) {
  const card = document.getElementById(`profile-card-${memberName.toLowerCase()}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('ring-4', 'ring-indigo-500', 'ring-offset-4', 'ring-offset-slate-950');
    setTimeout(() => {
      card.classList.remove('ring-4', 'ring-indigo-500', 'ring-offset-4', 'ring-offset-slate-950');
    }, 3000);
  }
}

async function saveProfileEdit(memberName) {
  const profileDelta = {
    display_name: document.getElementById(`edit-name-${memberName}`).value,
    role: document.getElementById(`edit-role-${memberName}`).value,
    portfolio: document.getElementById(`edit-portfolio-${memberName}`).value,
    bio: document.getElementById(`edit-bio-${memberName}`).value
  };

  showToast(UI_STRINGS.saving, 'info');

  try {
    await window.githubApi.updateMemberProfile(memberName, profileDelta);
    showToast(UI_STRINGS.saved, 'success');
    toggleProfileEdit(memberName);
    await refreshDashboardData();
  } catch (err) {
    showToast(`Fallo al guardar: ${err.message}`, 'error');
  }
}

// ─── HELPERS ──────────────────────────────────────────────────

function getFilteredTasks(tasks) {
  let filtered = tasks;

  if (activeFilter) {
    const activeHandle = Object.keys(MEMBER_MAPPING).find(key => MEMBER_MAPPING[key] === activeFilter);
    filtered = filtered.filter(t =>
      t.resuelto_por === activeFilter ||
      t.detectado_por === activeFilter ||
      t.apoyo === activeFilter ||
      (t.asignados && t.asignados.includes(activeHandle))
    );
  }

  if (activeStageFilter) {
    filtered = filtered.filter(t =>
      activeStageFilter.topics.includes(t.tema_principal) &&
      (!activeStageFilter.milestoneFilter || t.milestone === activeStageFilter.milestoneFilter)
    );
  }

  return filtered;
}

function updateJulesBadges() {
    const cachedSessions = JSON.parse(localStorage.getItem('jules_sessions_cache') || '[]');
    currentTasks.forEach(t => {
        if (t.jules_session_id) {
            const el = document.getElementById(`jules-status-${t.id}`);
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
                    <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="handleDashboardJulesArchive('${id}')" class="text-slate-500 hover:text-emerald-400" title="Archivar">
                            <i class="fa-solid fa-box-archive text-xs"></i>
                        </button>
                        <button onclick="handleDashboardJulesCemetery('${id}')" class="text-slate-500 hover:text-red-400" title="Al Cementerio">
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

function renderUserStatus(user) {
  const container = document.getElementById('user-status');
  if (!container) return;
  container.innerHTML = `
    <div class="flex flex-col items-end">
      <span class="text-[10px] font-bold text-white leading-none">${user.login}</span>
      <span class="text-[9px] text-emerald-500 font-mono">ONLINE</span>
    </div>
    <div class="pulse-emerald rounded-full">
      ${window.HypenosysUI.renderAvatar(user)}
    </div>
  `;
}

/**
 * Handle login from the dashboard overlay
 */
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
