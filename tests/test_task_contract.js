'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalizeTask, validateTaskEnvelope } = require('../assets/javascript/task-contract.js');

const task = () => ({
  id: 4, title: 'Brainstorming', descripcion: 'Definir el rumbo creativo.',
  estado: 'Pending', prioridad: 'Critical', repository: 'hypenosys/docs',
  rama: 'docs/brainstorming-ideation', acceptance_criteria: 'El GDD contiene los conceptos acordados.',
  email_responsable: 'private@example.test', token: 'secret'
});

test('normalizes a representative Kanban task without leaking unrelated fields or mutating it', () => {
  const input = task();
  const original = structuredClone(input);
  const result = normalizeTask(input);
  assert.deepEqual(result, {
    contract_version: '0.1.0', task_id: 'hypenosys:4', source: 'hypenosys', external_id: '4',
    title: 'Brainstorming', description: 'Definir el rumbo creativo.', status: 'todo', priority: 'critical',
    repository: 'hypenosys/docs', branch: 'docs/brainstorming-ideation',
    acceptance_criteria: ['El GDD contiene los conceptos acordados.'],
    metadata: { hypenosys: { estado: 'Pending', prioridad: 'Critical', acceptance_criteria: 'El GDD contiene los conceptos acordados.' } }
  });
  assert.deepEqual(validateTaskEnvelope(result), { valid: true, errors: [] });
  assert.deepEqual(input, original);
  assert.doesNotMatch(JSON.stringify(result), /private@example|secret/);
});

test('maps legacy statuses and priorities explicitly and rejects ambiguous or unknown values', () => {
  for (const [estado, expected] of Object.entries({ Pending: 'todo', ToDo: 'todo', Working: 'in_progress', Testing: 'testing', 'In Review': 'review', OK: 'done', Fixed: 'done', Completed: 'done', Blocked: 'blocked', Obsolete: 'cancelled' })) {
    assert.equal(normalizeTask({ ...task(), estado }).status, expected);
  }
  for (const [prioridad, expected] of Object.entries({ Critical: 'critical', Major: 'high', High: 'high', Medium: 'medium', Minor: 'low', Cosmetic: 'low' })) {
    assert.equal(normalizeTask({ ...task(), prioridad }).priority, expected);
  }
  assert.throws(() => normalizeTask({ ...task(), estado: 'mystery' }), /estado/);
  assert.throws(() => normalizeTask({ ...task(), prioridad: 'ToDo' }), /prioridad/);
  assert.throws(() => normalizeTask({ ...task(), estado: 'constructor' }), /estado/);
});

test('distinguishes missing, null, and empty values and copies criteria arrays', () => {
  const input = task();
  delete input.repository;
  delete input.acceptance_criteria;
  const missing = normalizeTask(input);
  assert.equal(Object.hasOwn(missing, 'repository'), false);
  assert.equal(Object.hasOwn(missing, 'acceptance_criteria'), false);
  const nil = normalizeTask({ ...input, repository: null, acceptance_criteria: null });
  assert.equal(nil.repository, null);
  assert.deepEqual(nil.acceptance_criteria, []);
  assert.equal(nil.metadata.hypenosys.acceptance_criteria, null);
  const empty = normalizeTask({ ...input, repository: '', acceptance_criteria: '' });
  assert.equal(empty.repository, '');
  assert.deepEqual(empty.acceptance_criteria, ['']);
  const criteria = ['first', 'second'];
  const array = normalizeTask({ ...input, acceptance_criteria: criteria });
  array.acceptance_criteria.push('third');
  assert.deepEqual(criteria, ['first', 'second']);
  assert.deepEqual(array.metadata.hypenosys.acceptance_criteria, ['first', 'second']);
  assert.throws(() => normalizeTask({ ...input, acceptance_criteria: { text: 'x' } }), /acceptance_criteria/);
});

test('retains bounded planning metadata without copying unrelated personal fields', () => {
  const input = { ...task(), milestone: 'M1', task_type: 'chore', completitud: 0.2, blocked_by: [5, '006'], comments: ['private'] };
  const result = normalizeTask(input);
  assert.equal(result.metadata.hypenosys.milestone, 'M1');
  assert.equal(result.metadata.hypenosys.task_type, 'chore');
  assert.equal(result.metadata.hypenosys.completitud, 0.2);
  assert.deepEqual(result.metadata.hypenosys.blocked_by, [5, '006']);
  assert.equal(Object.hasOwn(result.metadata.hypenosys, 'comments'), false);
  result.metadata.hypenosys.blocked_by.push(7);
  assert.deepEqual(input.blocked_by, [5, '006']);
});

test('requires stable identifiers, required fields and valid output types', () => {
  for (const id of [null, '', '  ', NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => normalizeTask({ ...task(), id }), /task.id/);
  }
  assert.equal(normalizeTask({ ...task(), id: 0 }).task_id, 'hypenosys:0');
  assert.equal(normalizeTask({ ...task(), id: '004' }).task_id, 'hypenosys:004');
  assert.throws(() => normalizeTask({ ...task(), title: '' }), /title/);
  assert.throws(() => normalizeTask({ ...task(), repository: 42 }), /repository/);
  const envelope = normalizeTask(task());
  for (const broken of [
    { ...envelope, contract_version: '1.0.0' }, { ...envelope, task_id: 'other:4' },
    { ...envelope, title: '   ' }, { ...envelope, source: ' ' },
    { ...envelope, status: 'unknown' }, { ...envelope, priority: 'ToDo' },
    { ...envelope, acceptance_criteria: ['ok', null] }, { ...envelope, metadata: null }
  ]) assert.equal(validateTaskEnvelope(broken).valid, false);
  assert.equal(validateTaskEnvelope(null).valid, false);
});

test('exposes the adapter in a browser without requiring DOM, storage, or network', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../assets/javascript/task-contract.js'), 'utf8'), context);
  assert.equal(context.HypenosysTaskContract.normalizeTask(task()).task_id, 'hypenosys:4');
});
