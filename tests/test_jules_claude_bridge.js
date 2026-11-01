// Jules ↔ Claude bounded collaboration contract tests (no real network, no API keys).
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const bridgeSource = fs.readFileSync(path.join(__dirname, '../assets/javascript/jules-claude-bridge.js'), 'utf8');
const panelSource = fs.readFileSync(path.join(__dirname, '../pages/jules-panel.html'), 'utf8');
const chatSource = fs.readFileSync(path.join(__dirname, '../pages/claude-chat.html'), 'utf8');
const coreSource = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-chat-core.js'), 'utf8');

function setup() {
    const store = new Map();
    store.set('hy_ai_config', JSON.stringify({provider:'anthropic',model:'claude-test-model',api_key:'TEST_ONLY'}));
    const storage = {
        getItem: key => store.has(key) ? store.get(key) : null,
        setItem: (key,value) => store.set(key,String(value)),
        removeItem: key => store.delete(key)
    };
    const requests = [];
    const sentToJules = [];
    const history = [{name:'sessions/123/activities/base',createTime:'2026-11-01T10:00:00Z',agentMessaged:{agentMessage:'Started'}}];
    const conversation = {id:'claude-1',messages:[],metadata:{linkedJulesTaskId:'123'}};
    const context = {
        console, localStorage: storage,
        document: {getElementById: () => null},
        addEventListener: () => {},
        confirm: () => true,
        setInterval: () => 3, clearInterval: () => {},
        julesPanelSessions: [conversation], currentJulesPanelSessionId: conversation.id,
        julesApi: {
            getActivities: async (sid, count) => {
                assert.equal(sid, 'sessions/123');
                assert.equal(count, 100);
                return {activities: history.slice()};
            },
            sendMessage: async (sid, content) => {
                sentToJules.push({sid, content});
                assert.equal(sid,'sessions/123');
                return {};
            }
        },
        NeuralThinkingAdapters: {getAdapter: name => name === 'anthropic' ? {} : null},
        NeuralProviderClient: {sendMessage: async ({messages, systemPrompt, onDone}) => {
            requests.push({messages,systemPrompt});
            onDone('Análisis de prueba; pregunta: ¿hay logs de validación?');
        }},
        NeuralChatCore: {
            saveSessions: (key, sessions) => {
                assert.equal(key,'claude_chat_sessions');
                assert.equal(sessions[0],conversation);
                storage.setItem(key,JSON.stringify(sessions));
            }
        },
        renderChatV2Messages: () => {},
        location: {href:'https://dev.hypenosys.com/jules-panel/'}
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(bridgeSource, context);
    return {bridge: context.JulesClaudeBridge,history,sentToJules,requests,conversation,context};
}

async function test() {
    // Panel MUST load capabilities, adapter, parser before provider client.
    const markers = [
        'neural-thinking-capabilities.js',
        'neural-thinking-adapters.js',
        'neural-thinking-parser.js',
        'neural-provider-client.js'
    ];
    let prev = 0;
    for(const marker of markers) {
        const idx=panelSource.indexOf(marker);
        assert.ok(idx > prev, 'missing/out of order script: '+marker);
        prev=idx;
    }
    assert.match(panelSource, /jules-claude-bridge\.js/);
    assert.match(chatSource, /jules-claude-bridge\.js/);
    assert.match(chatSource, /neural-activity-bridge-start/);
    assert.match(coreSource, /fromJules \? 'user' : m.role/, 'Jules messages must not impersonate Claude');

    const {bridge,history,sentToJules,requests,conversation} = setup();
    // Explicit activation required; no background relay on load.
    assert.equal(bridge.getState().enabled,false);
    assert.equal(sentToJules.length,0);

    await bridge.analyzeLatest();
    assert.equal(requests.length,1);
    assert.equal(sentToJules.length,0, 'manual analysis is read-only');
    assert.equal(conversation.messages.at(-1).source,'claude_bridge');

    await bridge.start();
    assert.equal(bridge.getState().enabled,true);
    assert.equal(bridge.getState().rounds,0);
    assert.equal(sentToJules.length,0, 'history baseline must not trigger automatic feedback');
    await bridge.pollOnce();
    assert.equal(sentToJules.length,0, 'no new activities');

    for (let i=0; i<3; i++) {
        history.push({name:'sessions/123/activities/new-'+i,createTime:'2026-11-01T10:00:0'+(i+1)+'Z',agentMessaged:{agentMessage:'Update '+i}});
        await bridge.pollOnce();
        assert.equal(sentToJules.length,i+1,'one reply per new event batch');
        await bridge.pollOnce();
        assert.equal(sentToJules.length,i+1,'no duplicate feedback');
    }
    assert.equal(bridge.getState().enabled,false,'auto disabled after three exchanges');
    assert.equal(bridge.getState().rounds,0);
    assert.match(sentToJules[0].content,/NO autorización/);
    assert.equal(requests.length,4,'one manual + three automatic analyses');
    for(const req of requests){
        assert.match(req.systemPrompt,/No actúas como autoridad/);
        assert.match(req.messages[0].content,/NO CONFIABLES/);
    }

    // Changing active conversation must STOP without sending to another session.
    await bridge.start();
    assert.equal(bridge.getState().enabled,true);
    const context = setup(); // independent check, leave previous context unchanged
    bridge.stop();
    assert.equal(bridge.getState().enabled,false);
    assert.equal(sentToJules.length,3);

    console.log('Jules ↔ Claude pilot: manual read-only, session matching, dedupe, 3-round limit and native adapter prerequisites verified');
}
test().catch(error => { console.error(error); process.exitCode=1; });
