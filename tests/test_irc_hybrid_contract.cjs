const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const html = readFileSync('pages/irc-hybrid.html', 'utf8');
const client = readFileSync('assets/javascript/hypenosys-irc.js', 'utf8');

test('the five real IRC operations views and config are rendered', () => {
  for (const view of ['canales', 'bots', 'bridges', 'incidents', 'config']) {
    assert.match(html, new RegExp('data-view="' + view + '"'));
    assert.match(html, new RegExp('data-panel="' + view + '"'));
  }
});
test('real IRC operations use WSS and protocol commands, not mock messages', () => {
  assert.match(client, /new WebSocket\(endpoint\)/);
  assert.match(client, /write\('JOIN '/);
  assert.match(client, /write\('LIST'\)/);
  assert.match(client, /write\('PRIVMSG '/);
  assert.match(client, /if\(command==='PING'\)/);
  assert.match(client, /if\(command==='001'\)/);
  assert.match(client, /if\(command==='322'/);
  assert.match(html, /No hay historial ficticio/);
});
test('operational registry is fetched from same-origin gateway', () => {
  for (const endpoint of ['/api/irc/bots','/api/irc/bridges','/api/irc/incidents']) {
    assert.ok(client.includes(endpoint));
  }
  assert.match(client, /credentials:'same-origin'/);
  assert.match(client, /No se muestran registros ni estados ficticios/);
  assert.doesNotMatch(html, /Mirror healthy|Runner available|PR checks pending/);
});
test('config is local-only and privileged actions are not sent as IRC commands', () => {
  assert.match(html, /Preferencias locales, no configuración de servidor/);
  assert.match(client, /text\.startsWith\('!'\)/);
  assert.match(client, /validWss/);
});
