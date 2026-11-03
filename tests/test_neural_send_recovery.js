'use strict';
// Exercise the actual standalone send, render and cross-tab sync together.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const storage = new Map([
        ['hy_ai_config', JSON.stringify({ provider: 'anthropic', model: 'claude-test' })],
        ['hypenosys_docs_context_enabled', 'false'],
        ['hy_active_claude_session_id', 'task-900009'],
        ['claude_chat_sessions', JSON.stringify([{
            id: 'task-900009', title: '#900009', systemPrompt: 'Analiza la tarea', messages: []
        }])]
    ]);
    const handlers = {};
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) elements.set(id, {
            value: '', style: {}, disabled: false, innerHTML: '', textContent: '',
            scrollHeight: 100, classList: { add() {}, remove() {}, toggle() {} },
            focus() {}, remove() {}, appendChild(child) { this.innerHTML += child.innerHTML; }
        });
        return elements.get(id);
    }
    const context = {
        console: { log() {}, warn() {}, error() {} },
        Date, JSON, Set, Map,
        setTimeout(fn, ms) { const timer = setTimeout(fn, Math.min(ms, 15)); timer.unref(); return timer; },
        clearTimeout,
        BroadcastChannel: class { postMessage() {} },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key)
        },
        document: {
            getElementById: element, addEventListener() {},
            createElement: () => element(Symbol()), body: { appendChild() {} }
        },
        addEventListener: (event, callback) => { handlers[event] = callback; }
    };
    context.window = context;
    vm.createContext(context);
    for (const file of ['neural-chat-core.js', 'neural-chat-ui.js', 'neural-chat-sessions.js', 'neural-chat-send.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/javascript', file), 'utf8'), context, { filename: file });
    }
    context.currentSessionId = 'task-900009';
    context.escapeHtml = context.NeuralChatCore.escapeHtml;
    context.chatInput = element('chat-input');
    context.chatInput.value = 'Analiza la tarea #900009';
    context.chatMessages = element('chat-messages');
    context.sendBtn = element('send-btn');
    context.thinkingIndicator = element('thinking-indicator');
    context.renderSessionList = () => {};
    context.JulesDocsBridge = { buildSystemPrompt: async (_, base) => base };
    context.NeuralProviderClient = { sendMessage: async ({ onDone }) => onDone('Respuesta de Claude') };
    return { context, storage, handlers };
}

async function run() {
    for (const kind of ['broadcast', 'storage']) {
        const { context, storage, handlers } = harness();
        context.NeuralProviderClient.sendMessage = async ({ onToken, onDone }) => {
            // Another component/tab publishes the stored user-only snapshot while
            // the request is using the live session object captured by sendMessage.
            if (kind === 'broadcast') context.neuralSyncChannel.onmessage({ data: { type: 'session-updated' } });
            else handlers.storage({ key: 'claude_chat_sessions' });
            onToken('Respuesta', 'Respuesta de Claude');
            onDone('Respuesta de Claude');
        };
        await context.sendMessage();
        assert.match(context.chatMessages.innerHTML, /Respuesta de Claude/, kind + ': reply stays visible after sync');
        const persisted = JSON.parse(storage.get('claude_chat_sessions'))[0];
        assert.equal(persisted.messages.at(-1).content, 'Respuesta de Claude', kind + ': reply survives reload');
        assert.equal(context._neuralSendInFlight, false);
        assert.equal(context._neuralSendingSession, null);
    }

    {
        const { context, storage } = harness();
        context.NeuralProviderClient.sendMessage = async ({ onError }) => {
            const snapshot = JSON.parse(storage.get('claude_chat_sessions'));
            snapshot.push({ id: 'other-task', title: 'Cambio remoto', messages: [] });
            storage.set('claude_chat_sessions', JSON.stringify(snapshot));
            context.neuralSyncChannel.onmessage({ data: { type: 'session-updated' } });
            onError(Error('Anthropic: HTTP 429'));
        };
        await context.sendMessage();
        context.renderMessages();
        assert.match(context.chatMessages.innerHTML, /HTTP 429/, 'provider failure remains visible through sync');
        assert.equal(context.sessions.find(s => s.id === 'other-task').title, 'Cambio remoto');
        assert.equal(JSON.parse(storage.get('claude_chat_sessions'))[0].messages.at(-1).error, true);
    }

    for (const bridge of [undefined, { buildSystemPrompt: async () => { throw Error('Contexto no disponible'); } },
        { buildSystemPrompt: () => new Promise(() => {}) }]) {
        const { context } = harness();
        context.JulesDocsBridge = bridge;
        // A real deadline keeps this test alive if a context promise never settles.
        let deadline;
        try {
            await Promise.race([context.sendMessage(), new Promise((_, reject) => {
                deadline = setTimeout(() => reject(Error('Context preparation blocked Claude')), 500);
            })]);
        } finally {
            clearTimeout(deadline);
        }
        assert.match(context.chatMessages.innerHTML, /Respuesta de Claude/, 'optional context cannot block Claude');
        assert.equal(context.sendBtn.disabled, false);
    }

    {
        const { context, storage } = harness();
        context.NeuralChatCore.sendMessage = async () => { throw Error('Fallo antes del proveedor'); };
        await context.sendMessage();
        context.renderMessages();
        const session = JSON.parse(storage.get('claude_chat_sessions'))[0];
        assert.equal(session.messages.at(-1).error, true, 'pre-provider errors are persisted');
        assert.match(context.chatMessages.innerHTML, /Fallo antes del proveedor/, 'error survives a rerender');
    }

    {
        const { context } = harness();
        context.NeuralProviderClient.sendMessage = async ({ onToken, onDone }) => {
            // Duplicate UI triggers cannot submit the task twice.
            await context.sendMessage();
            onToken('Respuesta', 'Respuesta de Claude');
            onDone('Respuesta de Claude');
        };
        await context.sendMessage();
        assert.equal(context.sessions[0].messages.filter(m => m.role === 'user').length, 1);
        context.toggleNeuralMessageSelection(1, true);
        context.renderMessages();
        assert.match(context.chatMessages.innerHTML, /checked/);
        assert.match(context.document.getElementById('neural-selected-message-count').textContent, /1 mensajes/);
    }
    console.log('Neural send recovery passed: cross-tab reply persistence, optional context, persistent errors, duplicate triggers and selection');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
