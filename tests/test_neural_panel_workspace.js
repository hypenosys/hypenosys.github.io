'use strict';
// Presentation contracts: no network, live sessions only, safe context isolation and draft actions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-panel-workspace.js'), 'utf8');
const nodes = new Map();
function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
        dataset: {}, innerHTML: '', textContent: '', value: '', className: '',
        attributes: {}, classList: { toggle() {} },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(type, fn) { this[type] = fn; },
        querySelectorAll() { return [all, active, finished]; },
        focus() {}, dispatchEvent() {}
    });
    return nodes.get(id);
}
const all = { dataset: { neuralFilter: 'all' }, setAttribute() {} };
const active = { dataset: { neuralFilter: 'active' }, setAttribute() {} };
const finished = { dataset: { neuralFilter: 'finished' }, setAttribute() {} };
const store = new Map();
const calls = [];
const ctx = {
    document: { readyState: 'complete', getElementById: node },
    localStorage: { getItem: key => store.get(key) || null },
    MutationObserver: class { observe() {} }, requestAnimationFrame: callback => callback(),
    addEventListener() {}, console, Date,
    NeuralWorkspaceState: { activeMode: 'claude', activeJulesSessionId: 'one' },
    currentJulesPanelSessionId: 'c1',
    julesPanelSessions: [{ id: 'c1', metadata: { linkedJulesTaskId: 'one' } }],
    julesSessionsCache: [
        { name: 'sessions/one', title: '<img src=x onerror=alert(1)>', state: 'IN_PROGRESS', sourceContext: { source: 'sources/github/org/project', githubRepoContext: { startingBranch: 'develop' } } },
        { name: 'sessions/two', title: 'Complete task', state: 'COMPLETED' },
        { name: 'sessions/three', title: 'Queued task', state: 'QUEUED' }
    ],
    resolveLinkedJulesId: c => c?.metadata?.linkedJulesTaskId,
    resolveLinkedClaudeConversationId: id => id === 'one' ? 'c1' : null,
    getActiveConfig: () => ({ model: 'configured-model' }),
    setJulesComposerDraft(mode, text) { calls.push(['draft', mode, text]); node('v2-chat-input').value = text; },
    selectLinkedJulesSession(id) { calls.push(['select', id]); ctx.NeuralWorkspaceState.activeJulesSessionId = id; },
    JulesClaudeBridge: { getState: () => ({ enabled: false, rounds: 0 }) },
    refreshDashboard: async () => calls.push(['refresh'])
};
ctx.window = ctx;
vm.createContext(ctx);
store.set('hy_neural_task_context', JSON.stringify({ id: 99, titulo: 'UNRELATED TASK', jules_session: { session_id: 'other' } }));
vm.runInContext(source, ctx);
assert.match(node('neural-task-overview').innerHTML, /org\/project/);
assert.doesNotMatch(node('neural-task-overview').innerHTML, /UNRELATED TASK|<img/);
assert.match(node('neural-queue-rows').innerHTML, /&lt;img/);
assert.equal(node('neural-queue-count').textContent, '(3)');
assert.equal(node('neural-composer-model').textContent, 'configured-model');
assert.equal(node('view-chat').dataset.workspaceMode, 'claude');
async function click(target) { await node('view-chat').click({ target: { closest: () => target } }); }
(async () => {
    await click(active);
    assert.equal(node('neural-queue-count').textContent, '(1)');
    assert.doesNotMatch(node('neural-queue-rows').innerHTML, /Complete task|Queued task/);
    await click(finished);
    assert.equal(node('neural-queue-count').textContent, '(1)');
    assert.match(node('neural-queue-rows').innerHTML, /Complete task/);
    node('v2-chat-input').value = 'Keep my existing draft';
    await click({ dataset: { neuralPrompt: 'Review this code' } });
    assert.deepEqual(calls.at(-1), ['draft', 'claude', 'Keep my existing draft\n\nReview this code']);
    assert.equal(calls.some(c => c[0] === 'send'), false);
    ctx.NeuralWorkspaceState.activeMode = 'jules';
    await click({ dataset: { neuralSession: 'two' } });
    assert.deepEqual(calls.at(-1), ['select', 'two']);
    assert.match(node('neural-execution-state').innerHTML, /Completada/);
    assert.equal(node('view-chat').dataset.workspaceMode, 'jules');
    // A fresh Claude conversation must not inherit another task's metadata.
    ctx.NeuralWorkspaceState.activeMode = 'claude';
    ctx.currentJulesPanelSessionId = 'new';
    ctx.NeuralPanelUI.render();
    assert.match(node('neural-task-overview').innerHTML, /Sin tarea vinculada/);
    assert.doesNotMatch(node('neural-task-overview').innerHTML, /org\/project|UNRELATED TASK/);
    ctx.julesSessionsCache = [];
    await click(all);
    assert.match(node('neural-queue-rows').innerHTML, /No hay sesiones de Jules/);
    assert.equal(node('neural-queue-count').textContent, '(0)');
    await click({ dataset: {}, id: 'neural-refresh-sessions' });
    assert.deepEqual(calls.at(-1), ['refresh']);
    console.log('Neural workspace: session filters, selection, escaped data, draft preservation, context isolation and empty state passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
