const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock window and localStorage for Node test runner
global.window = global;
global.localStorage = {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, val) { this._data[key] = String(val); },
    removeItem(key) { delete this._data[key]; }
};

// Load Block 1 modules
const capabilitiesCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-thinking-capabilities.js'), 'utf8');
eval(capabilitiesCode);

const adaptersCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-thinking-adapters.js'), 'utf8');
eval(adaptersCode);

console.log("=== RUNNING BLOCK 1 UNIT TESTS ===");

// 1. Test Static Model Resolution (Tier 2)
const anthropicManual = window.NeuralThinkingCapabilities.resolveCapability('anthropic', 'claude-3-7-sonnet-20250219');
assert.strictEqual(anthropicManual.supportsThinking, true);
assert.strictEqual(anthropicManual.family, 'manual');
assert.strictEqual(anthropicManual.canDisable, true);

const anthropicAdaptiveOmit = window.NeuralThinkingCapabilities.resolveCapability('anthropic', 'claude-opus-4-7');
assert.strictEqual(anthropicAdaptiveOmit.supportsThinking, true);
assert.strictEqual(anthropicAdaptiveOmit.family, 'adaptive');
assert.strictEqual(anthropicAdaptiveOmit.offPayloadMode, 'omit');

const anthropicClaude5 = window.NeuralThinkingCapabilities.resolveCapability('anthropic', 'claude-opus-5-5');
assert.strictEqual(anthropicClaude5.supportsThinking, true);
assert.strictEqual(anthropicClaude5.offPayloadMode, 'disabled');

const anthropicFable = window.NeuralThinkingCapabilities.resolveCapability('anthropic', 'claude-fable-5-1');
assert.strictEqual(anthropicFable.canDisable, false);

const geminiPro = window.NeuralThinkingCapabilities.resolveCapability('gemini', 'gemini-2.5-pro');
assert.strictEqual(geminiPro.supportsThinking, true);
assert.strictEqual(geminiPro.canDisable, false);

const openaiO1 = window.NeuralThinkingCapabilities.resolveCapability('openai', 'o1');
assert.strictEqual(openaiO1.supportsThinking, true);
assert.strictEqual(openaiO1.canDisable, false);
assert.strictEqual(openaiO1.hasVisibleThinkingText, false);

console.log("✓ Tier 2 Static Model Table Resolution OK");

// 2. Test Fallback for Unknown Anthropic Models
const unknownAnthropic = window.NeuralThinkingCapabilities.resolveCapability('anthropic', 'claude-unknown-9-0');
assert.strictEqual(unknownAnthropic.supportsThinking, true);
assert.strictEqual(unknownAnthropic.family, 'adaptive');
assert.strictEqual(unknownAnthropic.offPayloadMode, 'omit');
assert.strictEqual(unknownAnthropic.canDisable, false);

console.log("✓ Unknown Anthropic Fallback OK");

// 3. Test Adapters Request Building (Anthropic Manual vs Adaptive vs Off)
const anthropicAdapter = window.NeuralThinkingAdapters.getAdapter('anthropic');

// Manual mode
const reqManual = anthropicAdapter.buildRequest({
    model: 'claude-3-7-sonnet-20250219',
    messages: [{ role: 'user', content: 'hola' }],
    isThinkingEnabled: true,
    budgetTokens: 2048,
    apiKey: 'sk-ant-test'
});
assert.strictEqual(reqManual.url, 'https://api.anthropic.com/v1/messages');
assert.strictEqual(reqManual.headers.Authorization, 'Bearer sk-ant-test');
assert.strictEqual(reqManual.headers['anthropic-version'], '2026-10-21');
assert.strictEqual(reqManual.body.thinking.type, 'enabled');
assert.strictEqual(reqManual.body.thinking.budget_tokens, 2048);
assert.strictEqual(reqManual.body.max_tokens, 4096);

// Adaptive mode ON
const reqAdaptive = anthropicAdapter.buildRequest({
    model: 'claude-opus-4-7',
    messages: [{ role: 'user', content: 'hola' }],
    isThinkingEnabled: true,
    effort: 'high',
    apiKey: 'sk-ant-test'
});
assert.strictEqual(reqAdaptive.body.thinking.type, 'adaptive');
assert.strictEqual(reqAdaptive.body.thinking.display, 'summarized');
assert.strictEqual(reqAdaptive.body.output_config.effort, 'high');

// Opus 4.7 OFF -> omit field
const reqOpusOff = anthropicAdapter.buildRequest({
    model: 'claude-opus-4-7',
    messages: [{ role: 'user', content: 'hola' }],
    isThinkingEnabled: false,
    apiKey: 'sk-ant-test'
});
assert.strictEqual(reqOpusOff.body.thinking, undefined);

// Claude 5 OFF -> type: "disabled"
const reqClaude5Off = anthropicAdapter.buildRequest({
    model: 'claude-opus-5-5',
    messages: [{ role: 'user', content: 'hola' }],
    isThinkingEnabled: false,
    apiKey: 'sk-ant-test'
});
assert.strictEqual(reqClaude5Off.body.thinking.type, 'disabled');

console.log("✓ Anthropic Adapter Request Building & Family OffPayloads OK");

// 4. Test Gemini Exclusivity Assertion
const geminiAdapter = window.NeuralThinkingAdapters.getAdapter('gemini');
assert.throws(() => {
    geminiAdapter.buildRequest({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'hola' }],
        isThinkingEnabled: true,
        effort: 'medium',
        options: { useThinkingConfig: true }
    });
}, /reasoning_effort and thinking_config\/thinking_budget\/thinking_level are mutually exclusive/);

console.log("✓ Gemini Exclusivity Assertion Assertion OK");

// 5. Test 400 Error Thinking Keyword Filtering and TTL Cache
window.NeuralThinkingCapabilities.markModelUnsupported('custom', 'my-test-model', 'Invalid payload parameter: thinking_config not allowed');
assert.strictEqual(window.NeuralThinkingCapabilities.isModelCachedUnsupported('custom', 'my-test-model'), true);

// Non-thinking 400 error should NOT cache as thinking unsupported
window.NeuralThinkingCapabilities.markModelUnsupported('custom', 'my-other-model', 'Invalid API key provided');
assert.strictEqual(window.NeuralThinkingCapabilities.isModelCachedUnsupported('custom', 'my-other-model'), false);

console.log("✓ 400 Error Filtered TTL Cache OK");

// 6. Test Ollama Adapter Request Building with Tier 1 Dynamic Capability
const ollamaAdapter = window.NeuralThinkingAdapters.getAdapter('ollama');
const req2 = ollamaAdapter.buildRequest({
    model: 'deepseek-r1',
    messages: [{ role: 'user', content: 'hola' }],
    isThinkingEnabled: true,
    baseUrl: 'http://localhost:11434/v1',
    options: { dynamicMeta: { capabilities: ['thinking'] } }
});

assert.strictEqual(req2.url, 'http://localhost:11434/api/chat');
assert.strictEqual(req2.body.think, true);

const req2Off = ollamaAdapter.buildRequest({
    model: 'deepseek-r1',
    messages: [{ role: 'user', content: 'hola' }],
    isThinkingEnabled: false,
    baseUrl: 'http://localhost:11434/v1',
    options: { dynamicMeta: { capabilities: ['thinking'] } }
});
assert.strictEqual(req2Off.body.think, false);

console.log("✓ Ollama Adapter Request Building OK");

// 7. Test Mistral Adapter Response Parsing (String and List chunks)
const mistralAdapter = window.NeuralThinkingAdapters.getAdapter('mistral');
const parsedList = mistralAdapter.parseStream({
    choices: [{
        delta: {
            content: [
                { type: 'thinking', thinking: [{ type: 'text', text: 'Pensando...' }] },
                { type: 'text', text: 'Respuesta' }
            ]
        }
    }]
});

assert.strictEqual(parsedList.thinkingDelta, 'Pensando...');
assert.strictEqual(parsedList.contentDelta, 'Respuesta');

console.log("✓ Mistral Stream List Parsing OK");

console.log("=== ALL BLOCK 1 UNIT TESTS PASSED ===");
