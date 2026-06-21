/* HYPENOSYS — CONFIG MODULE */

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

const KANBAN_COLUMNS = [
  { id: 'backlog',    label: 'Backlog / ToDo',        states: ['Pending','ToDo',null],           icon: '📋' },
  { id: 'working',   label: 'En Progreso',             states: ['Working','KO'],                  icon: '⚡' },
  { id: 'qa',        label: 'QA / Manual Test',        states: ['Fixed','In Review'],             icon: '🧪' },
  { id: 'done',      label: 'Completado',              states: ['OK','Closed'],                   icon: '✅' }
];

const STATE_CONFIG = {
    'PENDING':  { color: 'bg-slate-700 text-slate-300', label: 'PENDING' },
    'TODO':     { color: 'bg-slate-500 text-white', label: 'TODO' },
    'WORKING':  { color: 'bg-amber-500 text-slate-950', label: 'WORKING' },
    'IN REVIEW':{ color: 'bg-purple-500 text-white', label: 'IN REVIEW' },
    'OK':       { color: 'bg-emerald-500 text-slate-950', label: 'OK' },
    'CRITICAL': { color: 'bg-red-500 text-white', label: 'CRITICAL' },
    'Pending':  { color: 'bg-slate-700 text-slate-300', label: 'Pending' },
    'ToDo':     { color: 'bg-indigo-500 text-white', label: 'ToDo' },
    'Working':  { color: 'bg-amber-500 text-slate-950', label: 'Working' },
    'KO':       { color: 'bg-red-500 text-slate-950', label: 'KO' },
    'Fixed':    { color: 'bg-blue-500 text-slate-950', label: 'Fixed' },
    'In Review':{ color: 'bg-purple-500 text-white', label: 'In Review' },
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

// Global mutable state
let activeFilter = null;
let activeStageFilter = null;
let kanbanFilters = {
    tags: [],
    members: [],
    repos: [],
    states: [],
    milestones: [],
    themes: [],
    priorities: []
};
let currentTasks = [];
let archivedTasks = [];
let currentStats = null;
let modalTags = [];
let modalLinks = [];
let modalSubtasks = [];
let modalComments = [];
let currentBudget = null;
let currentProfiles = null;
let currentTaskImages = [];

// Lightbox state
let lightboxTask = null;
let lightboxImages = [];
let lightboxIndex = 0;

// Chart instance variables
let groupVelocityChart = null;
let __burnoutChart__ = null;
let __budgetChart__ = null;
let __burndownChart__ = null;
let __velocityChart__ = null;
let memberTypeChart = null;
let memberRamaChart = null;
let memberVelocityChart = null;

/**
 * Helper to compare task IDs agnostic of type (string/number)
 */
function sameTaskId(id1, id2) {
    if (id1 === null || id1 === undefined || id2 === null || id2 === undefined) return false;
    return String(id1) === String(id2);
}

/**
 * Helper to check if a task is minimized, defaulting to true if no preference exists.
 */
function isTaskMinimized(taskId) {
    const value = localStorage.getItem(`task_minimized_${String(taskId)}`);
    return value === null ? true : value === 'true';
}

/**
 * Core filtering logic
 */
function getFilteredTasks(tasks) {
  let filtered = tasks;

  // Legacy Filter (Header toggles)
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

  // New Kanban Filters (AND between categories, OR within each category)

  // 1. Tags (OR)
  if (kanbanFilters.tags.length > 0) {
    filtered = filtered.filter(t => {
      const taskTags = t.tags || [];
      return kanbanFilters.tags.some(tag => taskTags.includes(tag));
    });
  }

  // 2. Members (OR)
  if (kanbanFilters.members.length > 0) {
    filtered = filtered.filter(t => {
      const handles = kanbanFilters.members.map(name =>
        Object.keys(MEMBER_MAPPING).find(key => MEMBER_MAPPING[key] === name)
      ).filter(Boolean);

      return kanbanFilters.members.includes(t.resuelto_por) ||
             kanbanFilters.members.includes(t.detectado_por) ||
             kanbanFilters.members.includes(t.apoyo) ||
             (t.asignados && t.asignados.some(h => handles.includes(h)));
    });
  }

  // 3. Repos (OR)
  if (kanbanFilters.repos.length > 0) {
    filtered = filtered.filter(t => {
      const repo = t.repository || t.repo || 'Sin asignar';
      return kanbanFilters.repos.includes(repo);
    });
  }

  // 4. States (OR)
  if (kanbanFilters.states.length > 0) {
    filtered = filtered.filter(t => {
      let state = (t.estado || 'Pending').toUpperCase();
      // Normalize common states to the 6 required ones if possible
      if (state === 'FIXED') state = 'IN REVIEW';
      if (state === 'CLOSED') state = 'OK';
      return kanbanFilters.states.includes(state);
    });
  }

  // 5. Milestones (OR)
  if (kanbanFilters.milestones && kanbanFilters.milestones.length > 0) {
    filtered = filtered.filter(t => kanbanFilters.milestones.includes(t.milestone || 'Sin Milestone'));
  }

  // 6. Themes (OR)
  if (kanbanFilters.themes && kanbanFilters.themes.length > 0) {
    filtered = filtered.filter(t => kanbanFilters.themes.includes(t.tema_principal || 'Sin Tema'));
  }

  // 7. Priorities (OR)
  if (kanbanFilters.priorities && kanbanFilters.priorities.length > 0) {
    filtered = filtered.filter(t => kanbanFilters.priorities.includes(t.prioridad || 'Sin Prioridad'));
  }

  return filtered;
}
