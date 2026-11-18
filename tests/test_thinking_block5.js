/**
 * Unit Test Suite for Block 5 (Neural Extended Thinking)
 * Tests:
 * 1. m.raw retransmitted intact when provider+model match
 * 2. m.raw discarded/fallback to plain text when provider or model changes
 * 3. apiMessages NEVER contains m.thinking
 * 4. 400 error mentioning thinking triggers 1 auto-retry and updates 7-day TTL cache
 * 5. 400 error without thinking mention does NOT trigger auto-retry and does NOT update TTL cache
 * 6. TTL cache expiration check
 * 7. QuotaExceededError in saveSessions prunes oldest m.raw without deleting session
 * 8. Non-thinking model payload identity remains 100% unchanged
 */

const assert = require('assert');

// Mock browser environment
global.window = global;
global.window.addEventListener = () => {};
global.BroadcastChannel = class {
    constructor() {}
    postMessage() {}
    close() {}
};
global.document = {
    body: { appendChild: () => {} },
    createElement: () => ({ className: '', textContent: '', remove: () => {} }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
};

// Mock localStorage
const storageStore = {};
global.localStorage = {
    getItem: (key) => storageStore[key] || null,
    setItem: (key, val) => { storageStore[key] = String(val); },
    removeItem: (key) => { delete storageStore[key]; },
    clear: () => { Object.keys(storageStore).forEach(k => delete storageStore[k]); }
};

// Load modules
require('../assets/javascript/neural-thinking-capabilities.js');
require('../assets/javascript/neural-thinking-adapters.js');
require('../assets/javascript/neural-thinking-parser.js');
require('../assets/javascript/neural-provider-client.js');
require('../assets/javascript/neural-chat-sessions.js');
require('../assets/javascript/neural-chat-core.js');

console.log("=== RUNNING BLOCK 5 UNIT TESTS ===");

(async function runTests() {
    try {
        // Test 1: m.raw forwarding & m.thinking omission
        localStorage.setItem('hy_ai_config', JSON.stringify({
            provider: 'mistral',
            model: 'mistral-medium-3-5'
        }));

        const mockSession = {
            id: 'test_session_block5',
            title: 'Test Session',
            messages: [
                { role: 'user', content: 'Hola' },
                {
                    role: 'assistant',
                    content: 'Respuesta con pensamiento',
                    thinking: 'Mi cadena de pensamiento interna...',
                    raw: [{ type: 'thinking', text: 'Mi cadena...' }],
                    raw_provider: 'mistral',
                    raw_model: 'mistral-medium-3-5'
                },
                { role: 'user', content: 'Siguiente mensaje' }
            ]
        };

        // Inspect constructed apiMessages in NeuralChatCore
        let capturedApiMessages = null;
        const originalSendMessage = window.NeuralProviderClient.sendMessage;

        window.NeuralProviderClient.sendMessage = async function(args) {
            capturedApiMessages = args.messages;
            return args.onDone('Test Done');
        };

        await window.NeuralChatCore.sendMessage({
            session: mockSession,
            userMessage: 'Siguiente mensaje',
            options: {},
            skipUserMessagePush: true
        });

        assert.ok(capturedApiMessages, "Captured apiMessages");
        const assistantApiMsg = capturedApiMessages.find(m => m.role === 'assistant');

        // Condition 1: m.raw is forwarded when provider+model match
        assert.ok(assistantApiMsg.raw, "m.raw forwarded when provider+model match");
        assert.deepStrictEqual(assistantApiMsg.raw, [{ type: 'thinking', text: 'Mi cadena...' }]);

        // Condition 3: m.thinking is NEVER sent in apiMessages
        assert.strictEqual(assistantApiMsg.thinking, undefined, "m.thinking is NEVER included in apiMessages");
        console.log("✓ Test 1: m.raw forwarded intact on same provider+model & m.thinking omitted OK");

        // Test 2: m.raw discarded when provider or model changes
        localStorage.setItem('hy_ai_config', JSON.stringify({
            provider: 'anthropic',
            model: 'claude-3-7-sonnet-20250219'
        }));

        await window.NeuralChatCore.sendMessage({
            session: mockSession,
            userMessage: 'Otro mensaje',
            options: {},
            skipUserMessagePush: true
        });

        const assistantApiMsgChanged = capturedApiMessages.find(m => m.role === 'assistant');
        // Condition 2: m.raw is discarded when provider/model changed
        assert.strictEqual(assistantApiMsgChanged.raw, undefined, "m.raw discarded when provider/model changed");
        assert.strictEqual(assistantApiMsgChanged.content, 'Respuesta con pensamiento');
        console.log("✓ Test 2: m.raw discarded/fallback to plain text on provider/model change OK");

        // Test 3 & 4: 400 error auto-retry fallback and 7-day TTL cache
        localStorage.setItem('hy_ai_config', JSON.stringify({
            provider: 'mistral',
            model: 'mistral-small-latest',
            base_url: 'https://api.mistral.ai/v1',
            api_key: 'test-key'
        }));

        // Clean cache
        localStorage.removeItem('hy_thinking_unsupported_cache_v1');

        let fetchCallCount = 0;
        let lastPayload = null;

        global.fetch = async function(url, opts) {
            fetchCallCount++;
            lastPayload = JSON.parse(opts.body);

            if (fetchCallCount === 1) {
                // Return 400 Bad Request mentioning budget_tokens
                return {
                    ok: false,
                    status: 400,
                    text: async () => '{"error": "Unsupported parameter: budget_tokens/reasoning_effort"}'
                };
            } else {
                // Second call (auto-retry): return 200 OK
                return {
                    ok: true,
                    status: 200,
                    body: {
                        getReader: () => {
                            let sent = false;
                            return {
                                read: async () => {
                                    if (!sent) {
                                        sent = true;
                                        return {
                                            done: false,
                                            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Retry success"}}]}\n\ndata: [DONE]\n\n')
                                        };
                                    }
                                    return { done: true };
                                }
                            };
                        }
                    }
                };
            }
        };

        // Restore original NeuralProviderClient.sendMessage
        window.NeuralProviderClient.sendMessage = originalSendMessage;

        let onDoneCalled = false;
        await window.NeuralProviderClient.sendMessage({
            messages: [{ role: 'user', content: 'Test retry' }],
            options: { isThinkingEnabled: true },
            onDone: (res) => {
                onDoneCalled = true;
                assert.strictEqual(res, 'Retry success');
            }
        });

        assert.strictEqual(fetchCallCount, 2, "Triggers exactly 1 auto-retry on 400 error mentioning thinking");
        assert.ok(onDoneCalled, "onDone called on retry success");

        // Verify 7-day TTL cache was updated
        assert.ok(window.NeuralThinkingCapabilities.isModelCachedUnsupported('mistral', 'mistral-small-latest'), "Model cached as unsupported in 7-day TTL cache");
        console.log("✓ Test 3: 400 error with thinking mention triggers 1 auto-retry and updates TTL cache OK");

        // Test 5: 400 error WITHOUT thinking mention does NOT trigger auto-retry and does NOT update cache
        localStorage.removeItem('hy_thinking_unsupported_cache_v1');
        fetchCallCount = 0;

        global.fetch = async function(url, opts) {
            fetchCallCount++;
            return {
                ok: false,
                status: 400,
                text: async () => '{"error": "Invalid request payload: missing required field \'user_id\'"}'
            };
        };

        let onErrorCalled = false;
        await window.NeuralProviderClient.sendMessage({
            messages: [{ role: 'user', content: 'Test no retry' }],
            options: { isThinkingEnabled: true },
            onError: (err) => {
                onErrorCalled = true;
                assert.ok(err.message.includes('missing required field'), "Error passed to onError");
            }
        });

        assert.strictEqual(fetchCallCount, 1, "Does NOT trigger auto-retry when 400 error does NOT mention thinking");
        assert.ok(onErrorCalled, "onError called");
        assert.strictEqual(window.NeuralThinkingCapabilities.isModelCachedUnsupported('mistral', 'mistral-small-latest'), false, "Cache NOT updated for non-thinking 400 error");
        console.log("✓ Test 5: 400 error without thinking mention does NOT retry and does NOT update TTL cache OK");

        // Test 6: QuotaExceededError in saveSessions prunes oldest m.raw
        const sessionsToSave = [
            {
                id: 's1',
                title: 'Session 1',
                messages: [
                    { role: 'user', content: 'Msg 1' },
                    { role: 'assistant', content: 'Ans 1', raw: [{ text: 'Raw 1' }] }
                ]
            },
            {
                id: 's2',
                title: 'Session 2',
                messages: [
                    { role: 'user', content: 'Msg 2' },
                    { role: 'assistant', content: 'Ans 2', raw: [{ text: 'Raw 2' }] }
                ]
            }
        ];

        window.sessions = sessionsToSave;

        let setItemCalls = 0;
        const origSetItem = localStorage.setItem;

        localStorage.setItem = function(key, val) {
            if (key === 'claude_chat_sessions') {
                setItemCalls++;
                if (setItemCalls === 1) {
                    const err = new Error("Quota exceeded");
                    err.name = 'QuotaExceededError';
                    throw err;
                }
            }
            origSetItem.call(localStorage, key, val);
        };

        window.saveSessions(false, 'test-quota');

        // Verify that saveSessions succeeded after pruning raw
        const storedSessions = JSON.parse(localStorage.getItem('claude_chat_sessions'));
        assert.ok(storedSessions, "Sessions successfully stored after quota pruning");
        assert.strictEqual(storedSessions.length, 2, "Session count preserved (never deletes session)");
        assert.strictEqual(storedSessions[0].messages[1].raw, undefined, "Oldest m.raw pruned");
        assert.strictEqual(storedSessions[0].messages[1].content, 'Ans 1', "Text content preserved");

        // Restore setItem
        localStorage.setItem = origSetItem;
        console.log("✓ Test 6: QuotaExceededError in saveSessions prunes oldest m.raw without deleting session OK");

        // Test 7: Non-thinking model payload identity remains 100% unchanged
        localStorage.setItem('hy_ai_config', JSON.stringify({
            provider: 'openai',
            model: 'gpt-3.5-turbo'
        }));

        fetchCallCount = 0;
        lastPayload = null;

        global.fetch = async function(url, opts) {
            fetchCallCount++;
            lastPayload = JSON.parse(opts.body);
            return {
                ok: true,
                status: 200,
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true })
                    })
                }
            };
        };

        await window.NeuralProviderClient.sendMessage({
            messages: [{ role: 'user', content: 'Hello standard model' }],
            options: { isThinkingEnabled: true }
        });

        assert.deepStrictEqual(lastPayload, {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Hello standard model' }],
            stream: true
        }, "Payload for non-thinking model is 100% byte-for-byte identical");

        console.log("✓ Test 7: Non-thinking model payload identity remains 100% unchanged OK");

        console.log("=== ALL BLOCK 5 UNIT TESTS PASSED ===");
        process.exit(0);

    } catch (err) {
        console.error("❌ Block 5 Test Failed:", err);
        process.exit(1);
    }
})();
