// Cloudflare Pages BYOK relay contract tests. No external network or real credentials.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadRoute(filename, functionName, fakeFetch) {
  const source = fs.readFileSync(path.join(__dirname, '../functions/api/ai/anthropic', filename), 'utf8');
  const context = { URL, Headers, Response, Request, TextEncoder, fetch: fakeFetch };
  vm.createContext(context);
  vm.runInContext(source.replace('export async function ', 'async function ') + '\nthis.route = ' + functionName + ';', context);
  return context.route;
}

const ORIGIN = 'https://dev.hypenosys.com';
const KEY = 'sk-ant-example-not-real';
const authHeaders = { Authorization: 'Bearer ' + KEY, Origin: ORIGIN };

async function run() {
  const discoveryCalls = [];
  const discover = loadRoute('models.js', 'onRequestGet', async (url, opts) => {
    discoveryCalls.push({ url: String(url), opts });
    return new Response(JSON.stringify({ data: [{ id: 'claude-test' }], has_more: false }), {
      headers: { 'content-type': 'application/json', 'request-id': 'req_test' }
    });
  });

  const noKey = await discover({ request: new Request(ORIGIN + '/api/ai/anthropic/models') });
  assert.equal(noKey.status, 401);
  const forbidden = await discover({ request: new Request(ORIGIN + '/api/ai/anthropic/models', {
    headers: { ...authHeaders, Origin: 'https://untrusted.example' }
  }) });
  assert.equal(forbidden.status, 403);
  assert.equal(discoveryCalls.length, 0);

  const models = await discover({ request: new Request(ORIGIN + '/api/ai/anthropic/models?limit=100&after_id=cursor', {
    headers: { ...authHeaders, 'anthropic-workspace-id': 'wrkspc_12345678' }
  }) });
  assert.equal(models.status, 200);
  assert.equal(models.headers.get('cache-control'), 'no-store');
  assert.equal(models.headers.get('request-id'), 'req_test');
  assert.equal((await models.json()).data[0].id, 'claude-test');
  assert.equal(discoveryCalls.length, 1);
  assert.equal(new URL(discoveryCalls[0].url).origin, 'https://api.anthropic.com');
  assert.equal(new URL(discoveryCalls[0].url).pathname, '/v1/models');
  assert.equal(new URL(discoveryCalls[0].url).searchParams.get('after_id'), 'cursor');
  assert.equal(discoveryCalls[0].opts.headers.get('authorization'), 'Bearer ' + KEY);
  assert.equal(discoveryCalls[0].opts.headers.get('anthropic-workspace-id'), 'wrkspc_12345678');

  const messageCalls = [];
  const streamFixture = 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"HOLA"}}\n\n';
  const send = loadRoute('messages.js', 'onRequestPost', async (url, opts) => {
    messageCalls.push({ url: String(url), opts });
    return new Response(streamFixture, { headers: { 'content-type': 'text/event-stream' } });
  });

  const payload = { model: 'claude-test', max_tokens: 32, stream: true, messages: [{ role: 'user', content: 'Hola' }] };
  const messages = await send({ request: new Request(ORIGIN + '/api/ai/anthropic/messages', {
    method: 'POST', headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }) });
  assert.equal(messages.status, 200);
  assert.match(messages.headers.get('content-type'), /text\/event-stream/);
  assert.equal(await messages.text(), streamFixture);
  assert.equal(messageCalls.length, 1);
  assert.equal(messageCalls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(messageCalls[0].opts.headers.get('authorization'), 'Bearer ' + KEY);
  assert.equal(JSON.parse(messageCalls[0].opts.body).model, 'claude-test');

  const malformed = await send({ request: new Request(ORIGIN + '/api/ai/anthropic/messages', {
    method: 'POST', headers: { ...authHeaders, 'content-type': 'application/json' }, body: '{}'
  }) });
  assert.equal(malformed.status, 400);
  assert.equal(messageCalls.length, 1);

  const upstreamFailure = loadRoute('models.js', 'onRequestGet', async () => { throw Error('Network unavailable'); });
  const failed = await upstreamFailure({ request: new Request(ORIGIN + '/api/ai/anthropic/models', {
    headers: authHeaders
  }) });
  assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), /sk-ant-example-not-real/);

  console.log('Cloudflare Anthropic models/messages relay contract tests passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
