'use strict';
const assert = require('node:assert/strict');
const { Blob } = require('node:buffer');
const { openZip, readJson, inspectArchive, parseCsv } = require('../assets/javascript/jules-import.js');

// Zero-dependency ZIP fixture generator, using the same classic ZIP layout as Jules Export.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipFile(name, values, corruptName = '') {
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const [path, value] of Object.entries(values)) {
    const nameBytes = Buffer.from(path, 'utf8');
    const data = Buffer.from(value, 'utf8');
    const crc = (crc32(data) ^ (path === corruptName ? 1 : 0)) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(values).length, 8);
  eocd.writeUInt16LE(Object.keys(values).length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  const blob = new Blob([...localParts, centralBytes, eocd]);
  return { name, size: blob.size, slice: (...args) => blob.slice(...args) };
}

const root = 'jules-export-2026-11-06';
const partName = root + '-part01.zip';
function fixture({ errors = 0, missingPart = false, corrupt = false, traversal = false } = {}) {
  const manifest = {
    complete: true,
    parts: [{ file: partName, sessions: ['s1'] }],
    sessions_processed: 1,
    errors_count: errors,
    pagination_stop_reason: { sources: 'COMPLETED', sessions: 'COMPLETED' },
    activities_stop_reason: {}
  };
  const index = zipFile(root + '-index.zip', {
    [root + '/manifest.json']: JSON.stringify(manifest),
    [root + '/sessions-index.csv']: 'id,title,repo,state\n"s1","Test, with commas","hypenosys/HAIS","COMPLETED"\n'
  });
  const details = {
    [root + '/sessions/s1/session.json']: '{"name":"sessions/s1","title":"Test"}',
    [root + '/sessions/s1/activities.json']: '[{"originator":"AGENT"}]',
    [root + '/sessions/s1/patches-index.json']: '[]'
  };
  if (traversal) details[root + '/sessions/../escape.txt'] = 'bad';
  const part = zipFile(partName, details, corrupt ? root + '/sessions/s1/session.json' : '');
  return missingPart ? [index] : [index, part];
}

(async () => {
  const archive = await inspectArchive(fixture(), 'Axel', 'hypenosys');
  assert.equal(archive.workspace, 'hypenosys');
  assert.equal(archive.account, 'Axel');
  assert.equal(archive.sessions.length, 1);
  assert.equal(archive.sessions[0].meta.title, 'Test, with commas');
  assert.deepEqual(archive.notices, []);
  const session = await readJson(archive.sessions[0].zip, archive.sessions[0].prefix + 'session.json');
  assert.equal(session.name, 'sessions/s1');
  assert.equal((await readJson(archive.sessions[0].zip, archive.sessions[0].prefix + 'activities.json')).length, 1);
  assert.deepEqual(parseCsv('id,title\n"a","Hello, world"\n')[0], { id: 'a', title: 'Hello, world' });

  await assert.rejects(inspectArchive(fixture({ missingPart: true }), 'Axel', 'hypenosys'),
    /Faltan partes ZIP/);
  const files = fixture();
  await assert.rejects(inspectArchive([...files, files[0]], 'Axel', 'hypenosys'), /duplicado/);
  await assert.rejects(inspectArchive(fixture({ traversal: true }), 'Axel', 'hypenosys'), /Ruta ZIP insegura/);
  const partial = await inspectArchive(fixture({ errors: 1 }), 'Axel', 'hypenosys');
  assert.match(partial.notices.join(' '), /errores parciales/);
  const corruptArchive = await inspectArchive(fixture({ corrupt: true }), 'Axel', 'hypenosys');
  await assert.rejects(readJson(corruptArchive.sessions[0].zip, corruptArchive.sessions[0].prefix + 'session.json'), /CRC/);

  await assert.rejects(inspectArchive(fixture(), '', 'hypenosys'), /etiqueta de cuenta/);
  await assert.rejects(inspectArchive(fixture(), 'Axel', '../hypenosys'), /workspace válido/);
  console.log('Jules ZIP import: parsed, validated, isolated and rejected unsafe/corrupt input');
})().catch(err => { console.error(err); process.exitCode = 1; });
