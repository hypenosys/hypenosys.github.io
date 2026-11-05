'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/javascript/jules-pr-sync.js'), 'utf8');

function harness({ target = 'develop', supervision = 'claude', ci = 'pending',
  validAuthor = true, hasToken = true, allowMerge = true, base = 'feature/task-42' } = {}) {
  let task = {
    id: 42, estado: 'REVIEW', organizationId: 'hais', repository: 'hypenosys/HAIS',
    rama: 'feature/hais-014', branch: target === 'develop' ? 'Desarrollo (develop)' : 'Producción (master)',
    jules_session: { session_id: 'session-42', status: 'COMPLETED', supervision },
    external_links: []
  };
  const session = {
    name: 'sessions/session-42', state: 'COMPLETED',
    outputs: [{ pullRequest: { url: 'https://github.com/hypenosys/HAIS/pull/42', title: 'Fixtures' } }]
  };
  const pr = {
    number: 42, state: 'open', merged: false, merged_at: null,
    mergeable: true, mergeable_state: 'clean', draft: false,
    body: validAuthor ? 'PR by Jules https://jules.google.com/task/session-42' : 'unrelated PR',
    updated_at: '2026-11-05T19:00:00Z',
    head: { sha: 'a'.repeat(40), repo: { full_name: 'hypenosys/HAIS' } },
    merge_commit_sha: 'b'.repeat(40),
    base: { ref: base, repo: { full_name: 'hypenosys/HAIS' } }
  };
  let stateCI = ci;
  const log = [], writes = [], completed = [];
  const data = new Map([['hy_neural_task_context', JSON.stringify(task)]]);
  const mock = {
    console, URL, JSON, Date,
    localStorage: {
      getItem: k => data.get(k) || null,
      setItem: (k, v) => data.set(k, String(v))
    },
    githubApi: {
      getActiveWorkspace: () => 'hais',
      getAuthToken: () => hasToken ? 'valid-example-token' : null
    },
    taskOps: {
      getAllTasks: async () => [task],
      updateTask: async (id, patch) => {
        assert.equal(id, 42);
        writes.push(patch);
        task = { ...task, ...patch };
      }
    },
    julesApi: { getSession: async () => session },
    HypenosysTaskOrchestrator: { handleTaskCompleted: async id => completed.push(id) },
    fetch: async (rawUrl, options) => {
      const url = new URL(rawUrl), method = options?.method || 'GET';
      log.push({ path: url.pathname, method, body: options?.body ? JSON.parse(options.body) : null });
      const response = (body, ok = true, status = 200) =>
        ({ ok, status, json: async () => body });
      if (url.pathname.endsWith('/pulls/42') && method === 'GET') return response(pr);
      if (url.pathname.endsWith('/pulls/42') && method === 'PATCH') {
        pr.base.ref = JSON.parse(options.body).base;
        pr.updated_at = '2026-11-05T19:01:00Z';
        return response(pr);
      }
      if (url.pathname.endsWith('/pulls/42/merge') && method === 'PUT') {
        assert.equal(JSON.parse(options.body).sha, pr.head.sha);
        if (!allowMerge) return response({ message: 'blocked' }, false, 405);
        pr.merged = true;
        pr.merged_at = '2026-11-05T19:02:00Z';
        pr.state = 'closed';
        return response({ merged: true, sha: 'c'.repeat(40) });
      }
      if (url.pathname.endsWith('/check-runs') && method === 'GET') {
        const checks = stateCI === 'pending' ? [{ status: 'in_progress', conclusion: null }] :
          [{ status: 'completed', conclusion: stateCI === 'success' ? 'success' : 'failure' }];
        return response({ check_runs: checks });
      }
      if (url.pathname.endsWith('/HAIS')) return response({ default_branch: 'master' });
      throw new Error('Unexpected request ' + method + ' ' + rawUrl);
    }
  };
  mock.window = mock;
  vm.runInNewContext(source, mock);
  return {
    api: mock.HypenosysJulesPrSync, task: () => task, log, writes, completed,
    setCI: next => { stateCI = next; }
  };
}
const count = (h, method) => h.log.filter(req => req.method === method).length;
(async () => {
  const develop = harness();
  assert.equal(await develop.api.reconcileSession('session-42'), false);
  assert.equal(count(develop, 'PATCH'), 1, 'retarget PR from task feature branch');
  assert.equal(develop.task().pull_request.base, 'develop');
  assert.equal(develop.task().pull_request.sync_status, 'ci_pending');
  assert.equal(count(develop, 'PUT'), 0, 'retarget must not merge before re-running CI');
  await develop.api.reconcileSession('session-42');
  assert.equal(count(develop, 'PUT'), 0, 'pending CI blocks merge');
  develop.setCI('success');
  assert.equal(await develop.api.reconcileSession('session-42'), true);
  assert.equal(count(develop, 'PUT'), 1);
  assert.equal(develop.task().estado, 'OK');
  assert.equal(develop.task().pull_request.base, 'develop');
  assert.equal(develop.task().pull_request.sync_status, 'merged');
  assert.equal(develop.completed.length, 1);
  await develop.api.reconcileSession('session-42');
  assert.equal(count(develop, 'PUT'), 1, 'merge is idempotent');
  assert.equal(develop.completed.length, 1);

  const master = harness({ target: 'master', base: 'master', ci: 'success' });
  assert.equal(await master.api.reconcileSession('session-42'), true);
  assert.equal(count(master, 'PATCH'), 0);
  assert.equal(count(master, 'PUT'), 1);
  assert.equal(master.task().estado, 'OK');
  assert.equal(master.task().pull_request.target_branch, 'master');

  const failed = harness({ base: 'develop', ci: 'failure' });
  await failed.api.reconcileSession('session-42');
  assert.equal(failed.task().estado, 'REVIEW');
  assert.equal(failed.task().pull_request.sync_status, 'ci_failed');
  assert.equal(count(failed, 'PUT'), 0);

  const human = harness({ base: 'develop', ci: 'success', supervision: 'human' });
  await human.api.reconcileSession('session-42');
  assert.equal(count(human, 'PUT'), 0);
  assert.equal(human.task().pull_request.sync_status, 'manual_review');

  const unauth = harness({ base: 'develop', ci: 'success', hasToken: false });
  await unauth.api.reconcileSession('session-42');
  assert.equal(count(unauth, 'PUT'), 0);
  assert.equal(unauth.task().pull_request.sync_status, 'auth_required');

  const unrelated = harness({ base: 'develop', ci: 'success', validAuthor: false });
  await unrelated.api.reconcileSession('session-42');
  assert.equal(count(unrelated, 'PUT'), 0);

  const rejected = harness({ base: 'develop', ci: 'success', allowMerge: false });
  await rejected.api.reconcileSession('session-42');
  assert.equal(rejected.task().estado, 'REVIEW', 'merge rejection must fail closed');
  assert.equal(rejected.task().pull_request.sync_status, 'merge_blocked');
  assert.equal(count(rejected, 'PUT'), 1);

  console.log('Jules auto-merge integration: develop/master targets, CI gates, OAuth, provenance, human control, retry and idempotence passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
