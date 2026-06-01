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

// Global mutable state
let activeFilter = null;
let activeStageFilter = null;
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
