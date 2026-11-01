// Regression tests for the Claude BYOK flow in the static Neural Chat.
// No real API key or network request is used here; run live smoke from API Config.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { TextEncoder, TextDecoder } = require('node:util');

const scripts = [
    'neural-thinking-capabilities.js',
    'neural-thinking-adapters.js',
    'neural-thinking-parser.js',
    'neural-provider-client.js'
];

function clientWithFetch(fetch) {
    const context = {
        console, fetch, URL, TextDecoder,
        location: { protocol: 'https:' },
        localStorage: {
            getItem(name) {
                return name === 'hy_ai_config'
                    ? JSON.stringify({
                        provider: 'anthropic',
                        model: 'claude-test-model',
                        base_url: 'https://api.anthropic.com/v1',
                        api_key: 'TEST-KEY'
                    })
                    : null;
            },
            setItem() {}
        }
    };
    context.window = context;
    vm.createContext(context);
    for (const file of scripts) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/javascript', file), 'utf8'), context, { filename: file });
    }
    return context.NeuralProviderClient;
}

function streamingResponse(texts) {
    const encoder = new TextEncoder();
    let n = 0;
    return {
        ok: true,
        status: 200,
        body: {
            getReader() {
                return {
                    async read() {
                        return n < texts.length
                            ? { done: false, value: encoder.encode(texts[n++]) }
                            : { done: true };
                    }
                };
            }
        }
    };
}

async function run() {
    const calls = [];
    const client = clientWithFetch(async (url, options) => {
        calls.push({ url, options });
        return streamingResponse([
            'event: message_start\ndata: {"type":"message_start"}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_',
            'delta","delta":{"type":"text_delta","text":"HO"}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"LA"}}\n\n',
            'event: message_stop\ndata: {"type":"message_stop"}\n\n'
        ]);
    });
    let completed = '';
    let failure = null;
    await client.sendMessage({
        messages: [{ role: 'user', content: 'hola' }],
        systemPrompt: 'Instrucciones de prueba',
        options: { isThinkingEnabled: false },
        onDone: value => { completed = value; },
        onError: error => { failure = error; }
    });
    assert.equal(failure, null);
    assert.equal(completed, 'HOLA');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/ai/anthropic/messages');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer TEST-KEY');
    assert.equal(calls[0].options.headers['anthropic-version'], '2026-10-21');
    assert.equal(calls[0].options.headers['x-api-key'], undefined);
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.stream, true);
    assert.equal(payload.system, 'Instrucciones de prueba');
    assert.equal(payload.thinking, undefined);
    assert.equal(payload.messages[0].role, 'user');
    assert.equal(payload.messages[0].content, 'hola');
    assert.equal(payload.max_tokens, 4096);

    // 401 is an authentication problem, not a CORS diagnosis.
    const badClient = clientWithFetch(async () => ({
        ok: false, status: 401, text: async () => '{"type":"authentication_error"}'
    }));
    let authError = '';
    await badClient.sendMessage({
        messages: [{ role: 'user', content: 'test' }], options: {},
        onError: error => { authError = error.message; }
    });
    assert.match(authError, /401/);
    assert.doesNotMatch(authError, /CORS|TEST-KEY/);

    // Only actual fetch/network failures should produce the CORS diagnostic.
    const networkClient = clientWithFetch(async () => { throw new TypeError('Failed to fetch'); });
    let networkError = '';
    await networkClient.sendMessage({
        messages: [{ role: 'user', content: 'test' }], options: {},
        onError: error => { networkError = error.message; }
    });
    assert.match(networkError, /CORS/);
    assert.doesNotMatch(networkError, /TEST-KEY/);

    const errorClient = clientWithFetch(async () => streamingResponse([
        'event: error\ndata: {"type":"error","error":{"type":"overloaded_error"}}\n\n'
    ]));
    let streamError = '';
    await errorClient.sendMessage({
        messages: [{ role: 'user', content: 'test' }], options: {},
        onError: error => { streamError = error.message; }
    });
    assert.match(streamError, /overloaded_error/);
    assert.doesNotMatch(streamError, /CORS/);
    console.log('Claude BYOK/native Messages/streaming tests passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
