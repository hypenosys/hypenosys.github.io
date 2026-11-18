const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock window, document, and localStorage for DOM test
global.window = global;
global.window.addEventListener = () => {};
global.escapeHtml = (str) => String(str || '');
global.window.startJulesPolling = () => {};
global.window.stopJulesPolling = () => {};
global.window.renderMessages = () => {};
global.window.renderSessionList = () => {};

class MockElement {
    constructor(id = '') {
        this.id = id;
        this.classList = {
            _set: new Set(),
            add(...cls) { cls.forEach(c => this._set.add(c)); },
            remove(...cls) { cls.forEach(c => this._set.delete(c)); },
            contains(c) { return this._set.has(c); },
            toggle(c, force) {
                if (force === undefined) {
                    if (this._set.has(c)) this._set.delete(c);
                    else this._set.add(c);
                } else {
                    if (force) this._set.add(c);
                    else this._set.delete(c);
                }
            }
        };
        this.title = '';
        this.textContent = '';
        this.value = '';
    }
}

function createMockElement(id) {
    return new MockElement(id);
}

const mockToggleBtn = createMockElement('toggle-thinking');
global.window.toggleThinkingBtn = mockToggleBtn;
const mockMandatoryBadge = createMockElement('thinking-mandatory-badge');
const mockSessionTitle = createMockElement('session-title');
const mockChatMessages = createMockElement('chat-messages');

global.document = {
    elements: {
        'toggle-thinking': mockToggleBtn,
        'thinking-mandatory-badge': mockMandatoryBadge,
        'session-title': mockSessionTitle,
        'chat-messages': mockChatMessages
    },
    getElementById(id) {
        if (!this.elements[id]) {
            this.elements[id] = createMockElement(id);
        }
        return this.elements[id];
    },
    querySelector() { return createMockElement(); },
    querySelectorAll() { return []; },
    addEventListener() {}
};

global.localStorage = {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, val) { this._data[key] = String(val); },
    removeItem(key) { delete this._data[key]; }
};

global.BroadcastChannel = class {
    postMessage() {}
    onmessage() {}
};

// Load Block 1, 2, 3 & 4 modules
const capabilitiesCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-thinking-capabilities.js'), 'utf8');
eval(capabilitiesCode);

const adaptersCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-thinking-adapters.js'), 'utf8');
eval(adaptersCode);

const coreCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-chat-core.js'), 'utf8');
eval(coreCode);

const sessionsCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-chat-sessions.js'), 'utf8');
eval(sessionsCode);

console.log("=== RUNNING BLOCK 4 UNIT TESTS ===");

// 1. Test updateThinkingToggleUI hides button for unsupported model (gpt-4o)
localStorage.setItem('hy_ai_config', JSON.stringify({ provider: 'openai', model: 'gpt-4o' }));
window.updateThinkingToggleUI();

assert.strictEqual(mockToggleBtn.classList.contains('hidden'), true);
assert.strictEqual(window.isThinkingEnabled, false);
console.log("✓ Unsupported Model (gpt-4o): #toggle-thinking button hidden OK");

// 2. Test updateThinkingToggleUI shows button for supported model (claude-3-7-sonnet-20250219)
localStorage.setItem('hy_ai_config', JSON.stringify({ provider: 'anthropic', model: 'claude-3-7-sonnet-20250219' }));
window.updateThinkingToggleUI();

assert.strictEqual(mockToggleBtn.classList.contains('hidden'), false);
console.log("✓ Supported Model (claude-3-7-sonnet-20250219): #toggle-thinking button visible OK");

// 3. Test badge/title when canDisable = false (gemini-2.5-pro)
localStorage.setItem('hy_ai_config', JSON.stringify({ provider: 'gemini', model: 'gemini-2.5-pro' }));
window.updateThinkingToggleUI();

assert.strictEqual(mockToggleBtn.classList.contains('hidden'), false);
assert.strictEqual(mockToggleBtn.title, "Razonamiento siempre activo por el modelo");
assert.strictEqual(mockToggleBtn.classList.contains('cursor-not-allowed'), true);
assert.strictEqual(mockMandatoryBadge.classList.contains('hidden'), false);
console.log("✓ Mandatory Reasoning Model (gemini-2.5-pro): canDisable=false badge OK");

// 4. Test createNewSession resets toggle state cleanly
localStorage.setItem('hy_ai_config', JSON.stringify({ provider: 'anthropic', model: 'claude-3-7-sonnet-20250219' }));
window.updateThinkingToggleUI();
window.isThinkingEnabled = true;
mockToggleBtn.classList.add('dracula-cyan');

window.createNewSession();

assert.strictEqual(window.isThinkingEnabled, false);
assert.strictEqual(mockToggleBtn.classList.contains('dracula-cyan'), false);
console.log("✓ createNewSession: toggle state cleanly reset to OFF OK");

// 5. Test session loaded with thinking = true on unsupported model forces window.isThinkingEnabled = false
const sessionWithThinking = { id: 's_test_unsupported', title: 'Test Session', thinking: true, messages: [] };
window.sessions = [sessionWithThinking];
localStorage.setItem('hy_ai_config', JSON.stringify({ provider: 'openai', model: 'gpt-4o' }));

window.loadSession('s_test_unsupported');

assert.strictEqual(window.isThinkingEnabled, false);
assert.strictEqual(mockToggleBtn.classList.contains('hidden'), true);
console.log("✓ Session loaded with thinking=true on unsupported model forced to false OK");

// 6. Test Warning for Unknown Claude Model
localStorage.setItem('hy_ai_config', JSON.stringify({ provider: 'anthropic', model: 'claude-custom-unreleased-9' }));
window.updateThinkingToggleUI();

assert.strictEqual(mockToggleBtn.title.includes("Modelo de Anthropic no registrado"), true);
assert.strictEqual(mockToggleBtn.classList.contains('cursor-not-allowed'), true);
console.log("✓ Unknown Claude Model Warning OK");

// 7. Test User Override Scoped per provider:model
localStorage.setItem('hy_thinking_override_map', JSON.stringify({
    "custom:my-custom-model": { enabled: true, format: "reasoning_content" }
}));

const overrideCap = window.NeuralThinkingCapabilities.resolveCapability('custom', 'my-custom-model');
assert.strictEqual(overrideCap.supportsThinking, true);
assert.strictEqual(overrideCap.overrideFormat, "reasoning_content");

const otherCustomCap = window.NeuralThinkingCapabilities.resolveCapability('custom', 'other-custom-model');
assert.strictEqual(otherCustomCap.supportsThinking, false);
console.log("✓ User Override Scoped per provider:model OK");

// 8. Zero behavioral change DOM test for non-thinking model
localStorage.setItem('hy_ai_config', JSON.stringify({ provider: 'mistral', model: 'mistral-tiny' }));
window.updateThinkingToggleUI();

assert.strictEqual(mockToggleBtn.classList.contains('hidden'), true);
assert.strictEqual(window.isThinkingEnabled, false);
console.log("✓ Zero Behavioral Change DOM Test for Non-Thinking Models OK");

console.log("=== ALL BLOCK 4 UNIT TESTS PASSED ===");
