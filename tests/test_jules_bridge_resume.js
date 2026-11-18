'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/javascript/jules-claude-bridge.js'), 'utf8');

function setup(storage = new Map()) {
    const events = {};
    const calls = { model: 0, approvals: 0, feedback: 0, confirmations: 0, reads: 0 };
    storage.set('hy_ai_config', JSON.stringify({ provider: 'anthropic', model: 'claude-test', api_key: 'TEST_ONLY' }));
    storage.set('hy_neural_task_context', JSON.stringify({ id: 900009, titulo: 'Sincronizar PR y CI',
        jules_session: { session_id: '123', supervision: 'claude' } }));
    const conversation = { id: 'claude-task', messages: [], metadata: { linkedJulesTaskId: '123' } };
    const context = {
        console, Date, JSON, Math,
        document: { getElementById: () => null },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key)
        },
        addEventListener: (event, callback) => { events[event] = callback; },
        setInterval: () => 1, clearInterval() {}, setTimeout() {},
        confirm: () => { calls.confirmations++; return true; },
        julesPanelSessions: [conversation], currentJulesPanelSessionId: conversation.id,
        NeuralThinkingAdapters: { getAdapter: () => ({}) },
        julesApi: {
            getSession: async () => ({ state: 'AWAITING_PLAN_APPROVAL' }),
            getActivities: async () => {
                calls.reads++;
                return { activities: [{ name: 'sessions/123/activities/plan-1', createTime: '2026-11-03T19:30:00Z',
                    planGenerated: { plan: { steps: [{ title: 'Implementar el cambio', description: 'Validar con pruebas.' }] } } }] };
            },
            approvePlan: async sid => { assert.equal(sid, 'sessions/123'); calls.approvals++; },
            sendMessage: async () => { calls.feedback++; }
        },
        NeuralProviderClient: { sendMessage: async ({ onDone }) => {
            calls.model++;
            onDone(JSON.stringify({ decision: 'approve_plan', message: 'Approve plan', reason: 'Plan viable y verificable.' }));
        } },
        NeuralChatCore: { saveSessions: (key, sessions) => storage.set(key, JSON.stringify(sessions)) },
        renderChatV2Messages() {}
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(source, context);
    return { context, bridge: context.JulesClaudeBridge, events, storage, calls };
}

async function run() {
    const legacy = setup();
    legacy.storage.set('hy_jules_supervision_mode_123', 'claude');
    await legacy.bridge.resume();
    assert.equal(legacy.bridge.getState().enabled, true, 'restore the recorded Claude launch policy');
    assert.equal(legacy.calls.confirmations, 0, 'restoration does not ask to authorize the same policy again');
    await legacy.bridge.pollOnce();
    assert.equal(legacy.calls.model, 1, 'review a plan already waiting when restored');
    assert.equal(legacy.calls.approvals, 1, 'approve only after the structured Claude decision');
    assert.equal(legacy.bridge.getState().rounds, 1);
    assert.equal(legacy.bridge.getState().maxRounds, 8);
    assert.match(legacy.context.julesPanelSessions[0].messages.at(-1).content, /API aceptó/);

    legacy.events.pagehide();
    const reloaded = setup(legacy.storage);
    await reloaded.bridge.resume();
    assert.equal(reloaded.bridge.getState().rounds, 1, 'reload does not reset the budget');
    await reloaded.bridge.pollOnce();
    assert.equal(reloaded.calls.model, 0, 'reload does not review the same plan again');
    assert.equal(reloaded.calls.approvals, 0, 'reload cannot duplicate an approval');
    reloaded.bridge.stop();
    await reloaded.bridge.resume();
    assert.equal(reloaded.bridge.getState().enabled, false, 'manual stop survives automatic restore');

    for (const mode of ['human', 'review', 'auto', null]) {
        const other = setup();
        if (mode) other.storage.set('hy_jules_supervision_mode_123', mode);
        await other.bridge.resume();
        assert.equal(other.bridge.getState().enabled, false, 'never upgrade ' + mode + ' to Claude supervision');
        assert.equal(other.calls.reads, 0);
    }

    const syncing = setup();
    syncing.storage.set('hy_jules_supervision_mode_123', 'claude');
    syncing.context.NeuralProviderClient.sendMessage = async ({ onDone }) => {
        syncing.calls.model++;
        // Simulate a cross-tab refresh while the model is reviewing the plan.
        syncing.context.julesPanelSessions = [{ id: 'claude-task', metadata: { linkedJulesTaskId: '123' },
            messages: [{ role: 'user', content: 'Mensaje añadido mientras revisabas' }] }];
        onDone(JSON.stringify({ decision: 'approve_plan', message: 'Approve plan' }));
    };
    await syncing.bridge.resume();
    await syncing.bridge.pollOnce();
    const saved = JSON.parse(syncing.storage.get('claude_chat_sessions'))[0];
    assert.equal(saved.messages[0].content, 'Mensaje añadido mientras revisabas');
    assert.match(syncing.context.julesPanelSessions[0].messages.at(-1).content, /API aceptó/);
    syncing.events.pagehide();

    const feedback = setup();
    feedback.storage.set('hy_jules_supervision_mode_123', 'claude');
    feedback.context.NeuralProviderClient.sendMessage = async ({ onDone }) =>
        onDone(JSON.stringify({ decision: 'send_feedback', message: 'Añade la prueba de idempotencia.' }));
    feedback.context.julesApi.sendMessage = async () => {
        feedback.context.julesPanelSessions = [{ id: 'claude-task', metadata: { linkedJulesTaskId: '123' },
            messages: [{ role: 'user', content: 'Mensaje durante el envío del feedback' }] }];
    };
    await feedback.bridge.resume();
    await feedback.bridge.pollOnce();
    const feedbackSaved = JSON.parse(feedback.storage.get('claude_chat_sessions'))[0];
    assert.equal(feedbackSaved.messages[0].content, 'Mensaje durante el envío del feedback');
    assert.equal(feedbackSaved.metadata.claudePlanFeedbackCount, 1);
    feedback.bridge.stop();

    const limit = setup(syncing.storage);
    const key = 'hy_jules_claude_bridge_progress_123';
    limit.storage.set(key, JSON.stringify({ conversationId: 'claude-task', sessionName: 'sessions/123', enabled: true, rounds: 8 }));
    await limit.bridge.resume();
    assert.equal(limit.bridge.getState().enabled, false);
    assert.equal(limit.calls.model, 0, 'reload never bypasses the 8-decision cap');

    const failed = setup();
    failed.storage.set('hy_jules_supervision_mode_123', 'claude');
    failed.context.NeuralProviderClient.sendMessage = async ({ onError }) => onError(Error('HTTP 429'));
    await failed.bridge.resume();
    await failed.bridge.pollOnce();
    assert.match(failed.bridge.getState().status, /429/);
    await failed.bridge.resume();
    assert.equal(failed.bridge.getState().enabled, false, 'an API error requires an explicit retry');
    assert.match(failed.context.julesPanelSessions[0].messages.at(-1).content, /429/, 'review errors remain in the transcript');

    const wrong = setup();
    wrong.storage.set('hy_jules_supervision_mode_123', 'claude');
    wrong.context.NeuralWorkspaceState = { activeMode: 'jules', activeJulesSessionId: 'another-session' };
    await wrong.bridge.resume();
    assert.equal(wrong.calls.reads, 0, 'never review the wrong selected Jules session');

    const staleTask = setup();
    staleTask.storage.set('hy_jules_supervision_mode_123', 'claude');
    staleTask.storage.set('hy_neural_task_context', JSON.stringify({ id: 999, jules_session: { session_id: 'unrelated' } }));
    await staleTask.bridge.resume();
    await staleTask.bridge.pollOnce();
    assert.equal(staleTask.calls.model, 0, 'do not review against another task context');
    assert.equal(staleTask.calls.approvals, 0);
    assert.equal(staleTask.bridge.getState().enabled, false);
    console.log('Jules supervisor recovery passed: authorized resume, waiting plan, live transcript, persisted limits, manual stop, API error and session isolation');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
