/**
 * HYPENOSYS OPERATIONAL DASHBOARD — LOGIC ENGINE
 * Full implementation for Kanban, Charts, and Stats
 */

const MEMBERS = ['Axel', 'Alex', 'Dídac', 'Javi', 'Mitxel'];
const REFRESH_INTERVAL_MS = 30000; // 30 seconds

let activeFilter = null;
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

document.addEventListener('DOMContentLoaded', initDashboard);

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
    showToast(`Error de sincronización: ${err.message}`, 'error');
  }
}

// ─── RENDERING ENGINE ────────────────────────────────────────

function renderDashboard() {
  renderMemberToggles();
  renderStatsSummary();
  renderKanbanBoard();
  renderQAVelocityChart();
  renderBurnoutGauge();
  renderBudgetChart();
  renderHallOfFame();
  renderMilestoneProgress();
  renderTeamProfiles();
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
  allBtn.className = activeFilter === null
    ? 'px-3 py-1 text-xs font-bold rounded-md bg-emerald-500 text-slate-950 transition-all'
    : 'px-3 py-1 text-xs font-bold rounded-md text-slate-400 hover:text-white transition-all';
  allBtn.addEventListener('click', () => { activeFilter = null; renderDashboard(); });
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
      <span class="text-[9px] font-mono text-slate-500">#${task.id}</span>
      <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${priorityColors[task.prioridad] || 'bg-slate-700'}">${task.prioridad.toUpperCase()}</span>
    </div>
    <p class="text-sm text-slate-200 leading-snug mb-3">${task.descripcion}</p>
    <div class="flex justify-between items-end">
      <div class="flex -space-x-2">
        ${task.resuelto_por ? `<div title="Resuelto por: ${task.resuelto_por}" class="w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-slate-950">${task.resuelto_por[0]}</div>` : ''}
        ${task.detectado_por ? `<div title="Detectado por: ${task.detectado_por}" class="w-6 h-6 rounded-full bg-indigo-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-white">${task.detectado_por[0]}</div>` : ''}
        ${task.apoyo ? `<div title="Apoyo: ${task.apoyo}" class="w-6 h-6 rounded-full bg-purple-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-white">${task.apoyo[0]}</div>` : ''}
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
    el.className = 'flex items-center gap-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800';
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

function renderTeamProfiles() {
  const grid = document.getElementById('team-profiles-grid');
  if (!grid || !currentProfiles) return;
  grid.innerHTML = '';

  const memberStats = window.githubApi.computeAllMemberStats(currentTasks, MEMBERS);

  Object.entries(currentProfiles.members).forEach(([name, profile]) => {
    const stats = memberStats[name] || { found: 0, fixed_ok: 0, support_ok: 0, score: 0 };
    const isSelf = window.currentUser === profile.handle.toLowerCase();
    
    const card = document.createElement('div');
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

function openCreateTaskModal() {
  document.getElementById('create-task-modal').classList.remove('hidden');
}

async function handleCreateTask() {
  const desc = document.getElementById('task-desc-input').value;
  const rama = document.getElementById('task-rama-input').value;
  const priority = document.getElementById('task-priority-input').value;
  const milestone = document.getElementById('task-milestone-input').value;
  const topic = document.getElementById('task-topic-input').value;

  if (!desc) return showToast('La descripción es obligatoria', 'warning');

  const newTask = {
    rama, rama2: null, ver: true, descripcion: desc,
    fecha: new Date().toISOString().split('T')[0],
    tema_principal: topic,
    detectado_por: activeFilter || 'Unassigned',
    resuelto_por: null, apoyo: null, estado: 'Pending',
    prioridad: priority, limite: null, comentario: '',
    milestone, completitud: 0
  };

  showToast(UI_STRINGS.saving, 'info');
  document.getElementById('create-task-modal').classList.add('hidden');

  try {
    await window.githubApi.createTask(newTask);
    showToast(UI_STRINGS.taskCreated(newTask.id), 'success');
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

async function saveProfileEdit(memberName) {
  const profileDelta = {
    display_name: document.getElementById(`edit-name-${memberName}`).value,
    role: document.getElementById(`edit-role-${memberName}`).value,
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
  if (!activeFilter) return tasks;
  return tasks.filter(t =>
    t.resuelto_por === activeFilter ||
    t.detectado_por === activeFilter ||
    t.apoyo === activeFilter
  );
}

function renderUserStatus(user) {
  const container = document.getElementById('user-status');
  if (!container) return;
  container.innerHTML = `
    <div class="flex flex-col items-end">
      <span class="text-[10px] font-bold text-white leading-none">${user.login}</span>
      <span class="text-[9px] text-emerald-500 font-mono">ONLINE</span>
    </div>
    <img src="${user.avatar_url}" class="w-8 h-8 rounded-lg border border-slate-700 shadow-lg pulse-emerald">
  `;
}
