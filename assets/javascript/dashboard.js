/**
 * HYPENOSYS OPERATIONAL DASHBOARD — LOGIC ENGINE
 * Full implementation for Kanban, Charts, and Stats
 */

const MEMBERS = ['Axel', 'Alex', 'Dídac', 'Javi', 'Mitxel'];
const STAGES = ['Concepto / GDD', 'Pre-producción', 'Tools / Automation', 'Arte / Assets', 'Programación / Engine', 'QA / Testing', 'Build / Deploy', 'Post-launch'];
const REFRESH_INTERVAL_MS = 30000; // 30 seconds

let activeFilter = null;
let activeStageFilter = null;
let currentTasks = [];
let currentStats = null;
let currentBudget = null;
let currentProfiles = null;

const KANBAN_COLUMNS = [
  { id: 'backlog',    label: 'Backlog / ToDo',        states: ['Pending','ToDo',null],           icon: '📋' },
  { id: 'working',   label: 'En Progreso',             states: ['Working','KO'],                  icon: '⚡' },
  { id: 'qa',        label: 'QA / Manual Test',        states: ['Fixed','?'],                     icon: '🧪' },
  { id: 'done',      label: 'Completado',              states: ['OK','Closed'],                   icon: '✅' }
];

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
    const loginOverlay = document.getElementById('login-overlay');
    const originalOverlayHTML = loginOverlay.innerHTML;
    loginOverlay.classList.remove('hidden');
    loginOverlay.innerHTML = `
      <div class="text-center">
        <div class="text-emerald-400 text-6xl mb-6 animate-spin"><i class="fa-solid fa-circle-notch"></i></div>
        <h1 class="text-3xl font-bold mb-2">Autenticando con GitHub...</h1>
        <p class="text-slate-400 mb-8 max-w-sm mx-auto">Intercambiando código de autorización por token de acceso.</p>
      </div>
    `;

    try {
      const resp = await fetch('https://hypenosys-gatekeeper-v2.axlffcc.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await resp.json();
      console.log('[Gatekeeper Response]', JSON.stringify(data));

      const token = data.access_token || data.token;

      if (token) {
        sessionStorage.setItem('gh_access_token', token.trim());
        window.history.replaceState({}, document.title, window.location.pathname);
        loginOverlay.classList.add('hidden');
        loginOverlay.innerHTML = originalOverlayHTML;
      } else {
        throw new Error(data.error || 'No se recibió el token de acceso.');
      }
    } catch (err) {
      console.error('OAuth Exchange Error:', err);
      loginOverlay.innerHTML = originalOverlayHTML;
      loginOverlay.classList.remove('hidden');
      showToast('Error de autenticación: ' + err.message, 'error');
      return;
    }
  }

  await initDashboard();
}

async function initDashboard() {
  const token = sessionStorage.getItem('gh_access_token') || localStorage.getItem('github_token');
  if (!token) {
    document.getElementById('login-overlay').classList.remove('hidden');
    return;
  }

  if (!sessionStorage.getItem('gh_access_token')) {
    sessionStorage.setItem('gh_access_token', token);
  }

  try {
    const { valid, user } = await window.githubApi.validateToken();
    if (!valid) {
        if (user) {
            document.getElementById('unauthorized-msg').textContent = `Tu cuenta de GitHub (${user.login}) no pertenece al equipo de Hypenosys.`;
            document.getElementById('unauthorized-overlay').classList.remove('hidden');
        } else {
            document.getElementById('login-overlay').classList.remove('hidden');
        }
        return;
    }

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
    const [tasksRes, statsRes, budgetRes, profilesRes] = await Promise.all([
      window.githubApi.fetchFileWithSha('_data/dashboard_tasks.json'),
      window.githubApi.fetchFileWithSha('_data/studio_stats.json'),
      window.githubApi.fetchFileWithSha('_data/studio_budget.json'),
      window.githubApi.fetchFileWithSha('_data/team_profiles.json')
    ]);

    currentTasks    = tasksRes.content.tasks || [];
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
  renderStatsSummary();
  renderKanbanBoard();
  renderQAVelocityChart();
  renderBurnoutGauge();
  renderBudgetChart();
  renderHallOfFame();
  renderMilestoneProgress();
  renderTeamProfiles();

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
  if (['Pending','ToDo'].includes(task.estado) || task.estado === null) return 'backlog';
  if (['Working','KO'].includes(task.estado)) return 'working';
  if (task.estado === 'Fixed' || (task.estado === '?' && task.completitud > 0 && task.completitud < 1)) return 'qa';
  if (['OK','Closed'].includes(task.estado)) return 'done';
  return 'backlog';
}

function buildTaskCard(task) {
  const card = document.createElement('div');
  card.className = `bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-500 transition-colors group relative`;
  card.draggable = true;
  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', String(task.id));
    card.classList.add('opacity-50');
  });
  card.addEventListener('dragend', () => card.classList.remove('opacity-50'));

  const priorityColors = {
    Critical: 'bg-red-900 text-red-300',
    Major:    'bg-orange-900 text-orange-300',
    Medium:   'bg-yellow-900 text-yellow-300',
    Minor:    'bg-slate-700 text-slate-300',
    Cosmetic: 'bg-slate-800 text-slate-400',
    ToDo:     'bg-indigo-900 text-indigo-300',
    Obsolete: 'bg-slate-900 text-slate-500 line-through'
  };

  card.innerHTML = `
    <div class="flex justify-between items-start mb-2">
      <div class="flex gap-2 items-center">
        <span class="text-[9px] font-mono text-slate-500">#${task.id}</span>
        <button onclick="openEditTaskModal(${task.id})" class="text-[10px] text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all">
          <i class="fa-solid fa-pencil"></i>
        </button>
      </div>
      <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${priorityColors[task.prioridad] || 'bg-slate-700'}">${task.prioridad.toUpperCase()}</span>
    </div>
    <p class="text-sm text-slate-200 leading-snug mb-3">${task.descripcion}</p>

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
      <div class="flex -space-x-2">
        ${task.resuelto_por ? `<div onclick="scrollToProfile('${task.resuelto_por}')" title="Resuelto por: ${task.resuelto_por}" class="w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-slate-950 cursor-pointer hover:scale-110 transition-transform">${task.resuelto_por[0]}</div>` : ''}
        ${task.detectado_por ? `<div onclick="scrollToProfile('${task.detectado_por}')" title="Detectado por: ${task.detectado_por}" class="w-6 h-6 rounded-full bg-indigo-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-white cursor-pointer hover:scale-110 transition-transform">${task.detectado_por[0]}</div>` : ''}
        ${task.apoyo ? `<div onclick="scrollToProfile('${task.apoyo}')" title="Apoyo: ${task.apoyo}" class="w-6 h-6 rounded-full bg-purple-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-white cursor-pointer hover:scale-110 transition-transform">${task.apoyo[0]}</div>` : ''}
      </div>
      <div class="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
        ${task.rama}${task.rama2 ? ` / ${task.rama2}` : ''}
      </div>
    </div>
  `;
  return card;
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

function renderCriticalPathAlerts() {
  const panel = document.getElementById('critical-path-panel');
  if (!panel) return;
  panel.innerHTML = '';

  const alerts = [];
  const today = new Date().toISOString().split('T')[0];

  currentTasks.forEach(t => {
    if (t.estado === 'Obsolete' || t.estado === 'OK' || t.estado === 'Closed') return;

    if (t.prioridad === 'Critical') {
      alerts.push({ type: 'error', msg: `TAREA CRÍTICA PENDIENTE: #${t.id} - ${t.descripcion}`, taskId: t.id });
    }
    if (t.limite && t.limite < today) {
      alerts.push({ type: 'warning', msg: `FECHA LÍMITE SUPERADA: #${t.id} - ${t.descripcion}`, taskId: t.id });
    }
    if (t.estado === 'Working' && !t.resuelto_por) {
      alerts.push({ type: 'info', msg: `TAREA EN PROGRESO SIN ASIGNAR: #${t.id} - ${t.descripcion}`, taskId: t.id });
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
  } else {
    panel.classList.add('hidden');
  }
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

  if (taskCancel) taskCancel.onclick = () => document.getElementById('create-task-modal').classList.add('hidden');
  if (taskSave) taskSave.onclick = handleCreateTask;
  if (qaCancel) qaCancel.onclick = () => document.getElementById('qa-assignment-modal').classList.add('hidden');
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
    if (!resolverSelect || !detectorSelect) return;

    const options = `<option value="">-- Unassigned --</option>` +
        MEMBERS.map(m => `<option value="${m}">${m}</option>`).join('');

    resolverSelect.innerHTML = options;
    detectorSelect.innerHTML = options;
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
    document.getElementById('task-status-input').value = task.estado || 'Pending';
    document.getElementById('task-completion-input').value = task.completitud || '0';
    document.getElementById('task-resolver-input').value = task.resuelto_por || '';
    document.getElementById('task-detector-input').value = task.detectado_por || '';

    document.getElementById('create-task-modal').classList.remove('hidden');
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
    detectado_por: detector
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
    filtered = filtered.filter(t =>
      t.resuelto_por === activeFilter ||
      t.detectado_por === activeFilter ||
      t.apoyo === activeFilter
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
