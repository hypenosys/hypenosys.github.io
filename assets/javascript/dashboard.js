/**
 * HYPENOSYS OPERATIONAL DASHBOARD — LOGIC ENGINE
 * Full implementation for Kanban, Charts, and Stats
 */

const MEMBERS = ['Axel', 'Alex', 'Dídac', 'Javi', 'Mitxel'];
const REFRESH_INTERVAL_MS = 60000; // 1 minute

let activeFilter = null;
let currentTasks = [];
let currentStats = null;
let currentBudget = null;
let currentProfiles = null;

const KANBAN_COLUMNS = [
    { id: 'backlog', states: ['Pending', 'ToDo', null] },
    { id: 'working', states: ['Working', 'KO'] },
    { id: 'qa',      states: ['Fixed', '?'] },
    { id: 'done',    states: ['OK', 'Closed'] }
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
};

// ─── INITIALIZATION ───────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initDashboard);

async function initDashboard() {
    const token = sessionStorage.getItem('gh_access_token');
    if (!token) {
        document.getElementById('login-overlay').classList.remove('hidden');
        return;
    }

    try {
        const resp = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) throw new Error('Token inválido');
        const user = await resp.json();

        const ALLOWED = ['axlfc', 'mitxel2022', 'topperh4rley']; // Add others if confirmed
        // For Alex and Dídac, we use placeholders until confirmed. 
        // Based on team.json and requirements, we'll allow those with profiles.
        
        window.currentUserHandle = user.login.toLowerCase();
        
        // Fetch and Refresh Loop
        await refreshDashboardData();
        startAutoRefresh();
        
        renderUserStatus(user);
        renderMemberToggles();
        setupEventListeners();

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
            fetchFileWithSha('_data/dashboard_tasks.json'),
            fetchFileWithSha('_data/studio_stats.json'),
            fetchFileWithSha('_data/studio_budget.json'),
            fetchFileWithSha('_data/team_profiles.json')
        ]);

        currentTasks    = tasksRes.content.tasks || [];
        currentStats    = statsRes.content;
        currentBudget   = budgetRes.content;
        currentProfiles = profilesRes.content;

        renderDashboard();
        
        document.getElementById('last-sync-timestamp').textContent = 
            `Sync: ${new Date().toLocaleTimeString('es-ES')}`;

    } catch (err) {
        showToast(`Error de sincronización: ${err.message}`, 'error');
    }
}

// ─── RENDERING ENGINE ────────────────────────────────────────

function renderDashboard() {
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
    document.getElementById('stat-total-tasks').textContent = tasks.filter(t => t.estado !== 'Obsolete').length;
    document.getElementById('stat-ok-tasks').textContent    = tasks.filter(t => t.estado === 'OK').length;
    
    const ratio = computeFixedFoundRatio(tasks);
    document.getElementById('stat-fixed-ratio').textContent = `${(ratio * 100).toFixed(2)}%`;
}

function renderMemberToggles() {
    const container = document.getElementById('member-filters');
    container.innerHTML = '';
    
    const allBtn = document.createElement('button');
    allBtn.className = `px-3 py-1 text-xs font-bold rounded-md transition-all ${!activeFilter ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`;
    allBtn.textContent = 'TODOS';
    allBtn.onclick = () => { activeFilter = null; renderMemberToggles(); renderDashboard(); };
    container.appendChild(allBtn);

    MEMBERS.forEach(m => {
        const btn = document.createElement('button');
        btn.className = `px-3 py-1 text-xs font-bold rounded-md transition-all ${activeFilter === m ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`;
        btn.textContent = m.toUpperCase();
        btn.onclick = () => { activeFilter = m; renderMemberToggles(); renderDashboard(); };
        container.appendChild(btn);
    });
}

function renderKanbanBoard() {
    const tasks = getFilteredTasks(currentTasks.filter(t => t.estado !== 'Obsolete'));
    
    KANBAN_COLUMNS.forEach(col => {
        const colEl = document.getElementById(`kanban-col-${col.id}`);
        const cardsEl = colEl.querySelector('.kanban-cards');
        const countEl = colEl.querySelector('.col-count');
        
        const colTasks = tasks.filter(t => getTaskColumnId(t) === col.id);
        countEl.textContent = colTasks.length;
        cardsEl.innerHTML = '';

        colTasks.forEach(task => {
            const card = buildTaskCard(task);
            cardsEl.appendChild(card);
        });

        // Setup drop zone
        cardsEl.ondragover = (e) => { e.preventDefault(); colEl.classList.add('drag-over'); };
        cardsEl.ondragleave = () => colEl.classList.remove('drag-over');
        cardsEl.ondrop = async (e) => {
            e.preventDefault();
            colEl.classList.remove('drag-over');
            const taskId = parseInt(e.dataTransfer.getData('task-id'));
            await handleCardDrop(taskId, col.id);
        };
    });
}

function getTaskColumnId(task) {
    if (['Pending', 'ToDo'].includes(task.estado) || task.estado === null) return 'backlog';
    if (['Working', 'KO'].includes(task.estado)) return 'working';
    if (task.estado === 'Fixed' || (task.estado === '?' && task.completitud > 0)) return 'qa';
    if (['OK', 'Closed'].includes(task.estado)) return 'done';
    return 'backlog';
}

function buildTaskCard(task) {
    const card = document.createElement('div');
    card.className = `bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-500 transition-colors group relative`;
    card.draggable = true;
    card.ondragstart = (e) => { e.dataTransfer.setData('task-id', task.id); card.classList.add('opacity-50'); };
    card.ondragend = () => card.classList.remove('opacity-50');

    const priorityColors = {
        Critical: 'bg-red-900 text-red-300',
        Major:    'bg-orange-900 text-orange-300',
        Medium:   'bg-yellow-900 text-yellow-300',
        Minor:    'bg-slate-700 text-slate-300',
        Cosmetic: 'bg-slate-800 text-slate-400',
        ToDo:     'bg-indigo-900 text-indigo-300'
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
    const members = Object.entries(currentStats.members);
    const labels = members.map(([name]) => name);
    const found = members.map(([, s]) => s.found);
    const fixedOK = members.map(([, s]) => s.fixed_ok);
    const support = members.map(([, s]) => s.support_ok);

    if (window.__qaVelocityChart__) window.__qaVelocityChart__.destroy();
    window.__qaVelocityChart__ = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Encontrados', data: found, backgroundColor: '#fbbf24' },
                { label: 'Resueltos (OK)', data: fixedOK, backgroundColor: '#34d399' },
                { label: 'Apoyo OK', data: support, backgroundColor: '#6366f1' }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { size: 10 } } },
                title: { display: true, text: 'VELOCIDAD QA POR MIEMBRO', color: '#f1f5f9', font: { size: 12, weight: 'bold' } }
            },
            scales: {
                x: { ticks: { color: '#475569' }, grid: { color: '#1e293b' } },
                y: { ticks: { color: '#f1f5f9' }, grid: { display: false } }
            }
        }
    });
}

function renderBurnoutGauge() {
    const ctx = document.getElementById('burnout-gauge-canvas').getContext('2d');
    const milestoneId = currentBudget.burnout?.current_milestone || 'M1';
    const milData = (currentBudget.burnout?.milestones || []).find(m => m.id === milestoneId);
    
    const burnoutIndex = milData 
        ? computeBurnoutIndex(currentTasks, milestoneId, milData.date_start, milData.date_end)
        : 0;

    const color = burnoutIndex < 0.4 ? '#34d399' : burnoutIndex < 0.7 ? '#fbbf24' : '#f87171';
    document.getElementById('burnout-index-value').textContent = `${(burnoutIndex * 100).toFixed(1)}%`;
    document.getElementById('burnout-index-value').style.color = color;

    if (window.__burnoutChart__) window.__burnoutChart__.destroy();
    window.__burnoutChart__ = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [burnoutIndex, 1 - burnoutIndex],
                backgroundColor: [color, '#0f172a'],
                borderWidth: 0,
                circumference: 180,
                rotation: 270
            }]
        },
        options: {
            cutout: '85%',
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function renderBudgetChart() {
    const ctx = document.getElementById('budget-doughnut-canvas').getContext('2d');
    const cats = currentBudget.categories || [];
    const labels = cats.map(c => c.label);
    const values = cats.map(c => {
        let total = 0;
        if (c.roles) c.roles.forEach(r => total += (r.hourly_rate * r.monthly_hours));
        if (c.entries) c.entries.forEach(e => total += (e.cost_monthly || 0));
        return total;
    });

    if (window.__budgetChart__) window.__budgetChart__.destroy();
    window.__budgetChart__ = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: ['#6366f1', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#38bdf8'],
                borderWidth: 2,
                borderColor: '#0f172a'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 } } },
                title: { display: true, text: 'DISTRIBUCIÓN PRESUPUESTO', color: '#f1f5f9', font: { size: 12, weight: 'bold' } }
            }
        }
    });
}

function renderHallOfFame() {
    const grid = document.getElementById('hall-of-fame-grid');
    grid.innerHTML = '';
    const hof = currentStats.hall_of_fame || [];
    
    hof.slice(0, 5).forEach(entry => {
        const el = document.createElement('div');
        el.className = 'flex items-center gap-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800';
        el.innerHTML = `
            <div class="text-2xl">${entry.medal}</div>
            <div class="flex-grow">
                <div class="text-sm font-bold">${entry.name}</div>
                <div class="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Score: ${(entry.score * 100).toFixed(1)}%</div>
            </div>
            <div class="flex gap-3 text-xs">
                <span title="Found">🔍 ${entry.found}</span>
                <span title="Fixed OK">✅ ${entry.fixed_ok}</span>
            </div>
        `;
        grid.appendChild(el);
    });
}

function renderMilestoneProgress() {
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
    grid.innerHTML = '';
    
    Object.entries(currentProfiles.members).forEach(([name, profile]) => {
        const card = document.createElement('div');
        card.className = 'bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden relative group';
        card.dataset.member = name;
        
        const isSelf = window.currentUserHandle === profile.handle.toLowerCase();
        
        card.innerHTML = `
            <div class="h-2" style="background-color: ${profile.color_accent}"></div>
            <div class="p-6">
                <div class="flex justify-between items-start mb-4">
                    <img src="https://github.com/${profile.handle || 'ghost'}.png" class="w-16 h-16 rounded-2xl border-2 border-slate-800 shadow-xl bg-slate-800">
                    ${isSelf ? `<button onclick="toggleProfileEdit('${name}')" class="p-2 text-slate-500 hover:text-white transition-colors"><i class="fa-solid fa-pencil"></i></button>` : ''}
                </div>
                <h3 class="text-xl font-bold mb-1">${profile.display_name}</h3>
                <div class="text-xs text-emerald-400 font-bold uppercase tracking-wider mb-3">${profile.role || 'Sin Rol'}</div>
                <p class="text-sm text-slate-400 leading-relaxed mb-4 h-12 overflow-hidden">${profile.bio || 'Sin biografía disponible.'}</p>
                <div class="flex gap-3 text-slate-500">
                    ${profile.links.github ? `<a href="${profile.links.github}" target="_blank" class="hover:text-white"><i class="fa-brands fa-github"></i></a>` : ''}
                    ${profile.links.twitter ? `<a href="${profile.links.twitter}" target="_blank" class="hover:text-white"><i class="fa-brands fa-twitter"></i></a>` : ''}
                    ${profile.links.itch ? `<a href="${profile.links.itch}" target="_blank" class="hover:text-white"><i class="fa-brands fa-itch-io"></i></a>` : ''}
                </div>
            </div>

            <!-- Edit Overlay -->
            <div id="edit-overlay-${name}" class="hidden absolute inset-0 bg-slate-900 z-10 p-6 flex flex-col gap-3">
                <div class="text-xs font-bold text-slate-500 uppercase">Editar Perfil</div>
                <input type="text" id="edit-name-${name}" value="${profile.display_name}" class="bg-slate-950 border border-slate-800 rounded p-2 text-sm" placeholder="Nombre">
                <input type="text" id="edit-role-${name}" value="${profile.role}" class="bg-slate-950 border border-slate-800 rounded p-2 text-sm" placeholder="Rol">
                <textarea id="edit-bio-${name}" class="bg-slate-950 border border-slate-800 rounded p-2 text-sm flex-grow" placeholder="Bio">${profile.bio}</textarea>
                <div class="flex gap-2">
                    <button onclick="saveProfileEdit('${name}')" class="flex-grow py-2 bg-emerald-500 text-slate-950 font-bold rounded text-xs">Guardar</button>
                    <button onclick="toggleProfileEdit('${name}')" class="py-2 px-4 border border-slate-700 rounded text-xs">X</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ─── ACTIONS & EVENT HANDLERS ────────────────────────────────

function setupEventListeners() {
    document.getElementById('task-cancel-btn').onclick = () => document.getElementById('create-task-modal').classList.add('hidden');
    document.getElementById('task-save-btn').onclick   = handleCreateTask;
    
    document.getElementById('qa-cancel-btn').onclick   = () => document.getElementById('qa-assignment-modal').classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.body;
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'fixed bottom-6 right-6 flex flex-col gap-3 z-[200]';
        container.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
    const colors = { success: 'border-emerald-500 text-emerald-400', error: 'border-red-500 text-red-400', info: 'border-blue-500 text-blue-400', warning: 'border-amber-500 text-amber-400' };

    toast.className = `toast bg-slate-900 border-l-4 p-4 rounded-xl shadow-2xl flex items-center gap-3 min-w-[300px] ${colors[type]}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type]} text-xl"></i> <span class="text-sm font-semibold text-slate-100">${message}</span>`;
    
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('toast--visible'), 100);
    setTimeout(() => {
        toast.classList.remove('toast--visible');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
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

    showToast('Creando tarea...', 'info');
    document.getElementById('create-task-modal').classList.add('hidden');

    try {
        await createTask(newTask);
        showToast('Tarea creada con éxito', 'success');
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

    showToast(`Actualizando tarea #${taskId}...`, 'info');
    try {
        await updateTaskStatus(taskId, newEstado, resolverHandle, testerHandle);
        showToast(`Tarea #${taskId} actualizada`, 'success');
        await refreshDashboardData();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}

function promptQAAssignment() {
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
                showToast('Asigna ambos responsables', 'warning');
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
    overlay.classList.toggle('hidden');
}

async function saveProfileEdit(memberName) {
    const profileDelta = {
        display_name: document.getElementById(`edit-name-${memberName}`).value,
        role: document.getElementById(`edit-role-${memberName}`).value,
        bio: document.getElementById(`edit-bio-${memberName}`).value
    };

    // OPTIMISTIC UI UPDATE
    const card = document.querySelector(`[data-member="${memberName}"]`);
    const oldHtml = card.innerHTML;
    
    card.querySelector('h3').textContent = profileDelta.display_name;
    card.querySelector('.text-emerald-400').textContent = profileDelta.role || 'Sin Rol';
    card.querySelector('p').textContent = profileDelta.bio || 'Sin biografía disponible.';
    toggleProfileEdit(memberName);

    showToast('Guardando perfil...', 'info');

    try {
        await updateMemberProfile(memberName, profileDelta);
        showToast('Perfil actualizado correctamente', 'success');
        await refreshDashboardData();
    } catch (err) {
        card.innerHTML = oldHtml;
        showToast(`Fallo al guardar: ${err.message}`, 'error');
    }
}

// ─── HELPERS & FORMULAS ──────────────────────────────────────

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
    container.innerHTML = `
        <div class="flex flex-col items-end">
            <span class="text-[10px] font-bold text-white leading-none">${user.login}</span>
            <span class="text-[9px] text-emerald-500 font-mono">ONLINE</span>
        </div>
        <img src="${user.avatar_url}" class="w-8 h-8 rounded-lg border border-slate-700 shadow-lg pulse-emerald">
    `;
}

// Formulas (repeated from github-api logic for UI computations)
function computeFixedFoundRatio(tasks) {
    const found = tasks.filter(t => t.detectado_por && t.detectado_por !== 'Unassigned').length;
    const fixed = tasks.filter(t => t.estado === 'OK').length;
    return found > 0 ? fixed / found : 0;
}

function computeBurnoutIndex(tasks, currentMilestoneId, milestoneStartDate, milestoneEndDate) {
    const today       = new Date();
    const start       = new Date(milestoneStartDate);
    const end         = new Date(milestoneEndDate);
    const totalDays   = Math.max(1, (end - start) / 86400000);
    const elapsedDays = Math.max(0, (today - start) / 86400000);
    const timePressure = Math.min(1.0, elapsedDays / totalDays);

    const milTasks    = tasks.filter(t => t.milestone === currentMilestoneId && t.estado !== 'Obsolete' && t.estado !== 'OK');
    const totalActive = milTasks.length;
    const critPending = milTasks.filter(t => t.prioridad === 'Critical').length;
    const majPending  = milTasks.filter(t => t.prioridad === 'Major').length;

    const weightedStress = (critPending * 3 + majPending * 2);
    const maxStress      = totalActive * 3;
    const stressRatio    = maxStress > 0 ? weightedStress / maxStress : 0;

    return Math.min(1.0, stressRatio * (0.4 + timePressure * 0.6));
}
