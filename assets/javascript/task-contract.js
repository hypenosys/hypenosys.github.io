/* HY-RUNE-TC v0.1.0: pure, read-only Hypenosys task adapter. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.HypenosysTaskContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.1.0';
  const STATUS = Object.freeze({
    pending: 'todo', todo: 'todo', backlog: 'todo',
    working: 'in_progress', 'in progress': 'in_progress', in_progress: 'in_progress',
    testing: 'testing', 'in review': 'review', review: 'review',
    ok: 'done', fixed: 'done', completed: 'done', done: 'done',
    blocked: 'blocked', obsolete: 'cancelled', cancelled: 'cancelled', canceled: 'cancelled'
  });
  const PRIORITY = Object.freeze({
    critical: 'critical', major: 'high', high: 'high', medium: 'medium',
    minor: 'low', low: 'low', cosmetic: 'low'
  });
  const STATUSES = new Set(['todo', 'in_progress', 'testing', 'review', 'done', 'blocked', 'cancelled']);
  const PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function validateTaskEnvelope(value) {
    const errors = [];
    if (!isRecord(value)) return { valid: false, errors: ['envelope must be an object'] };
    if (value.contract_version !== VERSION) errors.push('contract_version must be 0.1.0');
    for (const key of ['task_id', 'source', 'external_id', 'title']) {
      if (typeof value[key] !== 'string' || !value[key].trim()) errors.push(key + ' must be a non-empty string');
    }
    if (typeof value.source === 'string' && typeof value.external_id === 'string' &&
        value.task_id !== value.source + ':' + value.external_id) errors.push('task_id must combine source and external_id');
    if (!STATUSES.has(value.status)) errors.push('invalid status');
    if (!PRIORITIES.has(value.priority)) errors.push('invalid priority');
    for (const key of ['description', 'repository', 'branch']) {
      if (own(value, key) && value[key] !== null && typeof value[key] !== 'string') errors.push(key + ' must be a string or null');
    }
    if (own(value, 'acceptance_criteria') && (!Array.isArray(value.acceptance_criteria) ||
        !value.acceptance_criteria.every(item => typeof item === 'string'))) errors.push('acceptance_criteria must be an array of strings');
    if (own(value, 'metadata') && !isRecord(value.metadata)) errors.push('metadata must be an object');
    return { valid: errors.length === 0, errors };
  }

  function normalizeTask(task) {
    if (!isRecord(task)) throw new TypeError('task must be an object');
    const id = task.id;
    if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isSafeInteger(id)))) {
      throw new TypeError('task.id must be a non-empty string or safe integer');
    }
    const translate = (field, table) => {
      const value = task[field];
      if (typeof value !== 'string' || !own(table, value.trim().toLowerCase())) {
        throw new TypeError('unsupported or missing task.' + field);
      }
      return table[value.trim().toLowerCase()];
    };
    const externalId = String(id);
    // Only explicitly selected fields are read; credentials and personal fields are never copied.
    const metadata = { hypenosys: { estado: task.estado, prioridad: task.prioridad } };
    // Preserve a bounded set of non-personal planning fields. Do not copy arbitrary
    // task properties: Kanban records can also contain emails, comments and secrets.
    for (const key of ['tema_principal', 'milestone', 'task_type', 'seccion', 'completitud', 'blocks', 'blocked_by']) {
      if (!own(task, key)) continue;
      const value = task[key];
      if (value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
        metadata.hypenosys[key] = value;
      } else if ((key === 'blocks' || key === 'blocked_by') && Array.isArray(value) &&
                 value.every(item => typeof item === 'string' || (typeof item === 'number' && Number.isSafeInteger(item)))) {
        metadata.hypenosys[key] = value.slice();
      } else {
        throw new TypeError('unsupported task.' + key);
      }
    }
    const envelope = {
      contract_version: VERSION, task_id: 'hypenosys:' + externalId,
      source: 'hypenosys', external_id: externalId, title: task.title,
      status: translate('estado', STATUS), priority: translate('prioridad', PRIORITY), metadata
    };
    for (const [source, target] of [['descripcion', 'description'], ['repository', 'repository'], ['rama', 'branch']]) {
      if (own(task, source)) envelope[target] = task[source];
    }
    if (own(task, 'acceptance_criteria')) {
      const criteria = task.acceptance_criteria;
      if (criteria === null) {
        envelope.acceptance_criteria = [];
        metadata.hypenosys.acceptance_criteria = null;
      } else if (typeof criteria === 'string') {
        envelope.acceptance_criteria = [criteria];
        metadata.hypenosys.acceptance_criteria = criteria;
      } else if (Array.isArray(criteria) && criteria.every(item => typeof item === 'string')) {
        envelope.acceptance_criteria = criteria.slice();
        metadata.hypenosys.acceptance_criteria = criteria.slice();
      } else {
        throw new TypeError('task.acceptance_criteria must be a string, an array of strings, or null');
      }
    }
    const validation = validateTaskEnvelope(envelope);
    if (!validation.valid) throw new TypeError('invalid TaskEnvelope: ' + validation.errors.join('; '));
    return envelope;
  }

  return Object.freeze({ VERSION, normalizeTask, validateTaskEnvelope });
});
