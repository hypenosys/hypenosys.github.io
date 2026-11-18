'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/javascript/jules-pr-sync.js'), 'utf8');

function fixture() {
  let task = {
    id: 900012, organizationId: 'hais', repository: 'hypenosys/HAIS', branch: 'Desarrollo (develop)',
    estado: 'WORKING', jules_session: { session_id: 'session-1' },
    external_links: []
  };
  let session = {
    name: 'sessions/session-1', state: 'COMPLETED',
    outputs: [{ pullRequest: {
      url: 'https://github.com/hypenosys/HAIS/pull/42', title: 'PostgreSQL migrations'
    } }]
  };
  let github = {
    number: 42, state: 'open', merged: false, merged_at: null,
    base: { ref: 'develop', repo: { full_name: 'hypenosys/HAIS' } }
  };
  let fetchError = false;
  const writes = [];
  const completed = [];
  const storage = new Map();
  const context = {
    console, URL, JSON,
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, val) => storage.set(key, val)
    },
    githubApi: { getActiveWorkspace: () => 'hais', getAuthToken: () => 'test-token' },
    taskOps: {
      getAllTasks: async () => [task],
      updateTask: async (id, delta) => {
        assert.equal(id, task.id);
        task = { ...task, ...delta };
        writes.push(delta);
      }
    },
    julesApi: { getSession: async () => session },
    fetch: async () => {
      if (fetchError) throw new Error('network unavailable');
      return { ok: true, json: async () => github };
    },
    HypenosysTaskOrchestrator: { handleTaskCompleted: async id => completed.push(id) }
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'jules-pr-sync.js' });
  return {
    api: context.HypenosysJulesPrSync, writes, completed, storage,
    task: () => task,
    setSession: value => { session = value; },
    setGithub: value => { github = value; },
    setFetchError: value => { fetchError = value; }
  };
}

(async () => {
  const f = fixture();
  assert.equal(f.api.resolveTargetBranch({ rama: 'feature/hais-014', branch: 'Desarrollo (develop)' }), 'develop');
  assert.equal(f.api.resolveTargetBranch({ branch: 'Producción (master)' }), 'master');
  assert.equal(f.api.resolveTargetBranch({ rama: 'feature/hais-014' }, 'master'), 'master');
  assert.equal(f.api.resolveTargetBranch({ rama: 'feature/hais-014' }, 'main'), '');

  assert.equal(f.api.parsePullRequest('https://github.com/hypenosys/HAIS/pull/42').number, 42);
  for (const url of [
    'http://github.com/hypenosys/HAIS/pull/42',
    'https://github.com.evil.test/hypenosys/HAIS/pull/42',
    'https://github.com/hypenosys/HAIS/pull/0',
    'https://github.com/hypenosys/HAIS/pull/42?x=1',
    'https://github.com/other/repo/issues/42'
  ]) assert.equal(f.api.parsePullRequest(url), null);

  assert.equal(await f.api.reconcileSession('session-1'), false);
  assert.equal(f.task().estado, 'REVIEW', 'an open PR must not close the task');
  assert.equal(f.task().pull_request.sync_status, 'manual_review');
  assert.equal(f.task().external_links[0].url, 'https://github.com/hypenosys/HAIS/pull/42');
  assert.equal(f.writes.length, 1);
  await f.api.reconcileSession('session-1');
  assert.equal(f.writes.length, 1, 'repeated polling must be idempotent');

  f.setGithub({
    number: 42, state: 'closed', merged: true, merged_at: '2026-11-05T19:00:00Z',
    base: { ref: 'develop', repo: { full_name: 'hypenosys/HAIS' } }
  });
  assert.equal(await f.api.reconcileSession('session-1'), true);
  assert.equal(f.task().estado, 'OK', 'verified develop merge closes task');
  assert.equal(f.task().completitud, 1);
  assert.equal(f.task().pull_request.sync_status, 'merged');
  assert.equal(f.completed.length, 1, 'orchestrator advances only after verified merge');
  await f.api.reconcileSession('session-1');
  assert.equal(f.writes.length, 2, 'verified merges do not cause duplicate writes');
  assert.equal(f.completed.length, 1);

  f.setFetchError(true);
  await f.api.reconcileSession('session-1');
  assert.equal(f.task().estado, 'OK', 'transient network failure must not downgrade a verified merge');

  const wrong = fixture();
  wrong.setGithub({
    number: 42, state: 'closed', merged: true, merged_at: '2026-11-05T19:00:00Z',
    base: { ref: 'master', repo: { full_name: 'hypenosys/HAIS' } }
  });
  await wrong.api.reconcileSession('session-1');
  assert.equal(wrong.task().estado, 'REVIEW', 'a merge into master is not a merge into develop');
  assert.equal(wrong.task().pull_request.sync_status, 'closed_unmerged');

  const waiting = fixture();
  waiting.setSession({ name: 'sessions/session-1', state: 'COMPLETED', outputs: [] });
  await waiting.api.reconcileSession('session-1');
  assert.equal(waiting.task().estado, 'REVIEW');
  assert.equal(waiting.task().jules_session.pr_sync_status, 'awaiting_pr');

  const mismatch = fixture();
  mismatch.setSession({
    name: 'sessions/session-1', state: 'COMPLETED',
    outputs: [{ pullRequest: { url: 'https://github.com/someone/other-repo/pull/5' } }]
  });
  await mismatch.api.reconcileSession('session-1');
  assert.equal(mismatch.task().pull_request, undefined, 'wrong-repo PR must never be linked');

  const inaccessible = fixture();
  inaccessible.setFetchError(true);
  await inaccessible.api.reconcileSession('session-1');
  assert.equal(inaccessible.task().estado, 'REVIEW', 'failed GitHub verification never completes a task');
  assert.equal(inaccessible.task().pull_request.sync_status, 'verification_pending');

  console.log('Jules PR synchronization: verified merges, pending PRs, idempotence, workspace isolation and failure recovery passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
