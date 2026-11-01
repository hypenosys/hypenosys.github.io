const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/javascript/ai-config.js'), 'utf8');

function makeContext(fetch) {
    const context = { fetch, URL, console, window: {}, localStorage: { getItem: () => null } };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(source, context);
    return context;
}

async function main() {
    const calls = [];
    const ctx = makeContext(async (url, options) => {
        calls.push({ url: new URL(url), options });
        const page = calls.length;
        return {
            ok: true,
            json: async () => page === 1
                ? { data: [{ id: 'claude-sonnet-4-6' }], has_more: true, last_id: 'claude-sonnet-4-6' }
                : { data: [{ id: 'claude-opus-4-6' }], has_more: false, last_id: 'claude-opus-4-6' }
        };
    });
    const models = await ctx.discoverModels({
        provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1/', apiKey: 'TEST-KEY'
    });
    assert.deepEqual(Array.from(models, m => m.id), ['claude-sonnet-4-6', 'claude-opus-4-6']);
    assert.ok(models.every(m => m.kind === 'chat'));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url.pathname, '/v1/models');
    assert.equal(calls[0].url.searchParams.get('limit'), '100');
    assert.equal(calls[1].url.searchParams.get('after_id'), 'claude-sonnet-4-6');
    assert.equal(calls[0].options.headers['x-api-key'], 'TEST-KEY');
    assert.equal(calls[0].options.headers['anthropic-version'], '2023-06-01');
    assert.equal(calls[0].options.headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.equal(calls[0].options.headers.Authorization, undefined);

    const bad = makeContext(async () => ({ ok: false, status: 401 }));
    await assert.rejects(() => bad.discoverModels({
        provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'BAD-SECRET'
    }), err => err.message.includes('401') && !err.message.includes('BAD-SECRET'));
    await assert.rejects(() => bad.discoverModels({
        provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: ''
    }), /API Key de Anthropic/);

    const malformed = makeContext(async () => ({ ok: true, json: async () => ({ invalid: true }) }));
    await assert.rejects(() => malformed.discoverModels({
        provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'TEST'
    }), /Respuesta inválida/);

    let genericCalls = 0;
    const generic = makeContext(async (url, opts) => {
        genericCalls++;
        assert.equal(opts.headers.Authorization, 'Bearer TEST');
        return { ok: true, json: async () => ({ data: [{ id: 'gpt-5' }] }) };
    });
    const genericModels = await generic.discoverModels({
        provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'TEST'
    });
    assert.equal(genericModels[0].id, 'gpt-5');
    assert.equal(genericCalls, 1);
    console.log('Anthropic model discovery tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
