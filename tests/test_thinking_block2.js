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

let lastToastMessage = null;
global.window.showToast = (msg) => { lastToastMessage = msg; };

// Load Block 1 & Block 2 modules
const capabilitiesCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-thinking-capabilities.js'), 'utf8');
eval(capabilitiesCode);

const adaptersCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-thinking-adapters.js'), 'utf8');
eval(adaptersCode);

const clientCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-provider-client.js'), 'utf8');
eval(clientCode);

console.log("=== RUNNING BLOCK 2 UNIT TESTS ===");

// 1. Byte-for-byte payload comparison for non-thinking models across providers (toggle ON and OFF)
let capturedFetchCall = null;
global.fetch = async (url, options) => {
    capturedFetchCall = { url, options, bodyParsed: JSON.parse(options.body) };
    return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "ok" } }] }),
        body: {
            getReader() {
                return {
                    read: async () => ({ done: true, value: new Uint8Array() })
                };
            }
        }
    };
};

function testPayloadIdentity(provider, model, isThinkingEnabled, expectedStream = true) {
    localStorage.setItem('hy_ai_config', JSON.stringify({
        provider: provider,
        model: model,
        api_key: 'sk-test'
    }));

    window.NeuralProviderClient.sendMessage({
        messages: [{ role: 'user', content: 'test msg' }],
        systemPrompt: 'sys prompt',
        options: { isThinkingEnabled: isThinkingEnabled }
    });

    const expectedPayload = {
        model: model,
        messages: [
            { role: 'system', content: 'sys prompt' },
            { role: 'user', content: 'test msg' }
        ],
        stream: expectedStream
    };

    assert.strictEqual(
        JSON.stringify(capturedFetchCall.bodyParsed),
        JSON.stringify(expectedPayload)
    );
}

// Cases requested by user:
testPayloadIdentity('openai', 'gpt-3.5-turbo', false);
console.log("✓ Identity OK: openai / gpt-3.5-turbo (OFF)");

testPayloadIdentity('openai', 'gpt-4o', false);
console.log("✓ Identity OK: openai / gpt-4o (OFF)");

testPayloadIdentity('openai', 'gpt-4o', true);
console.log("✓ Identity OK: openai / gpt-4o (ON - non-reasoning model)");

testPayloadIdentity('ollama', 'llama3', false);
console.log("✓ Identity OK: ollama / llama3 (OFF)");

testPayloadIdentity('ollama', 'llama3', true);
console.log("✓ Identity OK: ollama / llama3 (ON - non-reasoning model)");

testPayloadIdentity('custom', 'my-custom-model', false);
console.log("✓ Identity OK: custom / my-custom-model (OFF)");

testPayloadIdentity('custom', 'my-custom-model', true);
console.log("✓ Identity OK: custom / my-custom-model (ON - without override)");

testPayloadIdentity('nvidia_nim', 'nvidia/unlisted-model', false, false);
console.log("✓ Identity OK: nvidia_nim / unlisted (OFF)");

testPayloadIdentity('nvidia_nim', 'nvidia/unlisted-model', true, false);
console.log("✓ Identity OK: nvidia_nim / unlisted (ON - unlisted model)");

testPayloadIdentity('mistral', 'mistral-tiny', false);
console.log("✓ Identity OK: mistral / mistral-tiny (OFF)");

testPayloadIdentity('mistral', 'mistral-tiny', true);
console.log("✓ Identity OK: mistral / mistral-tiny (ON - non-reasoning model)");

// 2. Test Real Normalized Anthropic Model IDs
const anthropicAdapter = window.NeuralThinkingAdapters.getAdapter('anthropic');

// claude-opus-5-5 OFF sends { type: "disabled" }
const reqOpus5Off = anthropicAdapter.buildRequest({
    model: 'claude-opus-5-5',
    messages: [{ role: 'user', content: 'hi' }],
    isThinkingEnabled: false
});
assert.strictEqual(reqOpus5Off.body.thinking.type, 'disabled');
console.log("✓ Normalized Anthropic ID OK: claude-opus-5-5 OFF sends { type: 'disabled' }");

// claude-fable-5-1 OFF (canDisable = false) sends no thinking field
const capFable = window.NeuralThinkingCapabilities.resolveCapability('anthropic', 'claude-fable-5-1');
assert.strictEqual(capFable.canDisable, false);
const reqFableOff = anthropicAdapter.buildRequest({
    model: 'claude-fable-5-1',
    messages: [{ role: 'user', content: 'hi' }],
    isThinkingEnabled: false
});
assert.strictEqual(reqFableOff.body.thinking, undefined);
console.log("✓ Normalized Anthropic ID OK: claude-fable-5-1 has canDisable=false");

// 3. Test Toast for Temperature Omission with Extended Thinking
lastToastMessage = null;
localStorage.setItem('hy_ai_config', JSON.stringify({
    provider: 'anthropic',
    model: 'claude-3-7-sonnet-20250219',
    api_key: 'sk-ant-test'
}));

window.NeuralProviderClient.sendMessage({
    messages: [{ role: 'user', content: 'hello' }],
    options: { isThinkingEnabled: true, hadTemperature: true }
});

assert.strictEqual(lastToastMessage, "Se ha omitido la temperatura por el modo Extended Thinking.");
console.log("✓ Toast Message for Temperature Omission OK");

// 4. Mock Test for Anthropic Dynamic Capabilities (disabled.supported = true / false)
const dynamicMetaTrue = {
    capabilities: {
        thinking: {
            types: ['adaptive'],
            disabled: { supported: true }
        }
    }
};
const capTrue = window.NeuralThinkingCapabilities.resolveCapability('anthropic', 'claude-custom-x', { dynamicMeta: dynamicMetaTrue });
assert.strictEqual(capTrue.canDisable, true);

const dynamicMetaFalse = {
    capabilities: {
        thinking: {
            types: ['adaptive'],
            disabled: { supported: false }
        }
    }
};
const capFalse = window.NeuralThinkingCapabilities.resolveCapability('anthropic', 'claude-custom-y', { dynamicMeta: dynamicMetaFalse });
assert.strictEqual(capFalse.canDisable, false);

console.log("✓ Anthropic Dynamic Capabilities (disabled.supported) Mock OK");

// 5. Test max_tokens Constraint Math.max(configured, budget + 1024)
const reqMaxLarge = anthropicAdapter.buildRequest({
    model: 'claude-3-7-sonnet-20250219',
    messages: [{ role: 'user', content: 'hi' }],
    isThinkingEnabled: true,
    budgetTokens: 2048,
    options: { max_tokens: 10000 }
});
assert.strictEqual(reqMaxLarge.body.max_tokens, 10000);

const reqMaxSmall = anthropicAdapter.buildRequest({
    model: 'claude-3-7-sonnet-20250219',
    messages: [{ role: 'user', content: 'hi' }],
    isThinkingEnabled: true,
    budgetTokens: 2048,
    options: { max_tokens: 2000 }
});
assert.strictEqual(reqMaxSmall.body.max_tokens, 3072);

console.log("✓ max_tokens Constraint (Math.max) OK");

console.log("=== ALL BLOCK 2 UNIT TESTS PASSED ===");
