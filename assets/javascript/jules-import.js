/**
 * Jules Local Archive — offline, read-only import of ZIPs created by jules-export.js.
 *
 * Privacy contract:
 * - Import stays IN MEMORY in the current browser tab. No network calls and no
 *   decrypted storage; the original encrypted/offline backups remain with the user.
 * - Imported sessions are NEVER mixed with julesSessionsCache, Neural or Task Ops.
 * - Imported data is untrusted. All rendering uses textContent (never innerHTML).
 * - File ownership cannot be authenticated from exported ZIPs: user must supply
 *   a source-account label, and the selected Hypenosys workspace is displayed.
 */
(function (root) {
  'use strict';

  const MAX_ARCHIVES = 100;
  const MAX_ENTRIES = 60000;
  const MAX_CENTRAL_BYTES = 20 * 1024 * 1024;
  const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
  const MAX_SELECTED_BYTES = 300 * 1024 * 1024;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const crcTable = (() => {
    const out = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      out[i] = c >>> 0;
    }
    return out;
  })();
  function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
  }

  function ensureSafePath(path) {
    if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0') ||
        path.split('/').some(p => p === '.' || p === '..' || p === '')) {
      throw new Error('Ruta ZIP insegura o inválida.');
    }
    return path;
  }

  // Read only the central directory, without copying the entire archive to RAM.
  async function openZip(file) {
    if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < 22)
      throw new Error('Selecciona un ZIP válido.');
    const tailStart = Math.max(0, file.size - 65557);
    const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
    const t = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let pos = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (t.getUint32(i, true) === 0x06054b50 && i + 22 + t.getUint16(i + 20, true) === tail.length) {
        pos = i;
        break;
      }
    }
    if (pos < 0) throw new Error('ZIP sin directorio central íntegro.');
    if (t.getUint16(pos + 4, true) || t.getUint16(pos + 6, true))
      throw new Error('ZIP multidisco no admitido.');
    const count = t.getUint16(pos + 10, true);
    const bytes = t.getUint32(pos + 12, true);
    const offset = t.getUint32(pos + 16, true);
    if (count === 0xffff || bytes === 0xffffffff || offset === 0xffffffff)
      throw new Error('ZIP64 no admitido.');
    if (count > MAX_ENTRIES || bytes > MAX_CENTRAL_BYTES ||
        offset + bytes > tailStart + pos || offset + bytes > file.size)
      throw new Error('Directorio ZIP inválido o demasiado grande.');
    const data = new Uint8Array(await file.slice(offset, offset + bytes).arrayBuffer());
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const entries = new Map();
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > data.length || view.getUint32(cursor, true) !== 0x02014b50)
        throw new Error('Directorio central corrupto.');
      const flags = view.getUint16(cursor + 8, true);
      const method = view.getUint16(cursor + 10, true);
      const expectedCrc = view.getUint32(cursor + 16, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const uncompressedSize = view.getUint32(cursor + 24, true);
      const nameLen = view.getUint16(cursor + 28, true);
      const extraLen = view.getUint16(cursor + 30, true);
      const commentLen = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const end = cursor + 46 + nameLen + extraLen + commentLen;
      if (end > data.length || flags & 1 || ![0, 8].includes(method) ||
          [compressedSize, uncompressedSize, localOffset].includes(0xffffffff))
        throw new Error('ZIP cifrado, incompatible o corrupto.');
      const name = ensureSafePath(decoder.decode(data.subarray(cursor + 46, cursor + 46 + nameLen)));
      if (entries.has(name)) throw new Error('ZIP contiene rutas duplicadas.');
      entries.set(name, { name, method, compressedSize, uncompressedSize, expectedCrc, localOffset });
      cursor = end;
    }
    if (cursor !== data.length) throw new Error('Directorio ZIP contiene datos inesperados.');
    return { file, entries };
  }

  async function readEntry(zip, name, maxBytes = MAX_ENTRY_BYTES) {
    const entry = zip.entries.get(name);
    if (!entry) throw new Error('Falta archivo requerido: ' + name);
    if (entry.uncompressedSize > maxBytes || entry.uncompressedSize > MAX_ENTRY_BYTES)
      throw new Error('Archivo ZIP demasiado grande: ' + name);
    const local = new DataView(await zip.file.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer());
    if (local.byteLength < 30 || local.getUint32(0, true) !== 0x04034b50 ||
        local.getUint16(8, true) !== entry.method)
      throw new Error('Cabecera ZIP local inválida: ' + name);
    const begin = entry.localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    const end = begin + entry.compressedSize;
    if (end > zip.file.size) throw new Error('Contenido ZIP truncado.');
    const compressed = zip.file.slice(begin, end);
    let bytes;
    if (entry.method === 0) {
      bytes = new Uint8Array(await compressed.arrayBuffer());
    } else {
      if (typeof DecompressionStream === 'undefined')
        throw new Error('El navegador no admite DEFLATE-RAW; usa una versión actualizada.');
      try {
        const stream = compressed.stream().pipeThrough(new DecompressionStream('deflate-raw'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (err) {
        throw new Error('Falló la descompresión de ' + name + ': ' + String(err.message || err));
      }
    }
    if (bytes.length !== entry.uncompressedSize || bytes.length > maxBytes || crc32(bytes) !== entry.expectedCrc)
      throw new Error('Tamaño/CRC incorrectos: ' + name);
    return bytes;
  }

  async function readJson(zip, name, maxBytes = 24 * 1024 * 1024) {
    let parsed;
    try { parsed = JSON.parse(decoder.decode(await readEntry(zip, name, maxBytes))); }
    catch (err) { throw new Error('JSON inválido en ' + name + ': ' + err.message); }
    return parsed;
  }

  function parseCsv(text) {
    const result = [];
    let cells = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && c === ',') {
        cells.push(field); field = '';
      } else if (!quoted && (c === '\n' || c === '\r')) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        cells.push(field); field = '';
        result.push(cells); cells = [];
      } else { field += c; }
    }
    if (quoted) throw new Error('Índice CSV incompleto.');
    if (field || cells.length) { cells.push(field); result.push(cells); }
    const [headers, ...rows] = result;
    if (!headers || !headers.includes('id')) throw new Error('Índice CSV sin IDs.');
    return rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] || ''])));
  }

  async function inspectArchive(files, account, workspace) {
    if (!Array.isArray(files) || !files.length || files.length > MAX_ARCHIVES)
      throw new Error('Selecciona el índice ZIP y todas sus partes.');
    if (!account || !account.trim() || account.length > 60)
      throw new Error('Indica una etiqueta de cuenta (sin claves ni secretos).');
    if (!workspace || !/^[\w-]+$/.test(workspace))
      throw new Error('Selecciona un workspace válido.');
    const fileMap = new Map();
    for (const file of files) {
      if (!/^jules-export-\d{4}-\d{2}-\d{2}-(?:index|part\d{2})\.zip$/i.test(file.name))
        throw new Error('Nombre de ZIP no reconocido: ' + file.name);
      if (fileMap.has(file.name)) throw new Error('Nombre ZIP duplicado: ' + file.name);
      fileMap.set(file.name, file);
    }
    const indices = [...fileMap.keys()].filter(name => name.endsWith('-index.zip'));
    if (indices.length !== 1) throw new Error('Selecciona un solo ZIP de índice por importación.');
    const indexZip = await openZip(fileMap.get(indices[0]));
    const rootDir = indices[0].replace(/-index\.zip$/, '');
    const manifest = await readJson(indexZip, rootDir + '/manifest.json', 12 * 1024 * 1024);
    if (!manifest || !Array.isArray(manifest.parts))
      throw new Error('El manifiesto no contiene las partes esperadas.');
    const notices = [];
    if (manifest.complete !== true) notices.push('El manifiesto marca la exportación como incompleta.');
    if (manifest.errors_count > 0 || (Array.isArray(manifest.errors) && manifest.errors.length))
      notices.push('El exportador registró errores parciales.');
    const reasons = Object.values(manifest.pagination_stop_reason || {}).concat(
      Object.values(manifest.activities_stop_reason || {}));
    if (reasons.some(x => x !== 'COMPLETED'))
      notices.push('Hubo paginación/actividades detenidas antes de completarse.');
    const requiredFiles = manifest.parts.map(p => p.file);
    if (new Set(requiredFiles).size !== requiredFiles.length)
      throw new Error('Manifiesto con partes duplicadas.');
    if (requiredFiles.some(name => !fileMap.has(name)))
      throw new Error('Faltan partes ZIP: ' + requiredFiles.filter(name => !fileMap.has(name)).join(', '));
    if (fileMap.size !== requiredFiles.length + 1)
      throw new Error('Hay ZIP de otra exportación: selecciona solo un índice y sus partes.');
    const parts = new Map();
    let inspectedBytes = 0;
    for (const fileName of requiredFiles) {
      if (!fileName.startsWith(rootDir + '-part')) throw new Error('Parte de otra exportación.');
      const zip = await openZip(fileMap.get(fileName));
      parts.set(fileName, zip);
      inspectedBytes += zip.entries.size * 200;
      if (inspectedBytes > MAX_SELECTED_BYTES)
        throw new Error('Índice demasiado grande.');
    }
    const csvName = rootDir + '/sessions-index.csv';
    const indexRows = indexZip.entries.has(csvName)
      ? parseCsv(decoder.decode(await readEntry(indexZip, csvName, 24 * 1024 * 1024))) : [];
    const details = new Map(indexRows.map(row => [row.id, row]));
    const sessions = [];
    const seen = new Set();
    for (const item of manifest.parts) {
      if (!Array.isArray(item.sessions)) throw new Error('Parte sin índice de sesiones.');
      const zip = parts.get(item.file);
      for (const rawId of item.sessions) {
        const id = String(rawId);
        if (!id || id.includes('/') || id.includes('\\') || id === '.' || id === '..' || seen.has(id))
          throw new Error('ID duplicado o inválido en el manifiesto.');
        seen.add(id);
        const prefix = rootDir + '/sessions/' + id + '/';
        if (!zip.entries.has(prefix + 'session.json') || !zip.entries.has(prefix + 'activities.json'))
          throw new Error('Faltan registros de la sesión ' + id);
        sessions.push({ id, prefix, zip, meta: details.get(id) || {} });
      }
    }
    if (Number(manifest.sessions_processed) !== sessions.length ||
        (indexRows.length && indexRows.length !== sessions.length))
      notices.push('Los recuentos de sesiones y partes no coinciden.');
    if (!sessions.length) notices.push('No hay sesiones en esta exportación.');
    return {
      account: account.trim(), workspace, rootDir, manifest, sessions,
      notices, loadedAt: new Date().toISOString()
    };
  }

  let activeArchive = null;
  let viewGeneration = 0;
  const byId = id => typeof document !== 'undefined' ? document.getElementById(id) : null;
  const write = (id, value) => { const el = byId(id); if (el) el.textContent = String(value); };

  function renderList(filter = '') {
    const list = byId('jules-archive-sessions');
    if (!list || !activeArchive) return;
    list.replaceChildren();
    const needle = filter.trim().toLowerCase();
    const matches = activeArchive.sessions.filter(s =>
      [s.id, s.meta.title, s.meta.repo, s.meta.state].join(' ').toLowerCase().includes(needle));
    for (const s of matches.slice(0, 150)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'jules-archive-item';
      button.textContent = (s.meta.title || s.id) + ' · ' + (s.meta.state || 'Sin estado');
      button.title = s.id;
      button.addEventListener('click', () => { void previewSession(s); });
      list.appendChild(button);
    }
    write('jules-archive-count', matches.length + ' sesiones' +
      (matches.length > 150 ? ' · mostrando 150; filtra para ver el resto' : ''));
  }

  async function previewSession(s) {
    const generation = ++viewGeneration;
    write('jules-archive-detail', 'Cargando y validando ' + s.id + '...');
    try {
      const session = await readJson(s.zip, s.prefix + 'session.json');
      const activities = await readJson(s.zip, s.prefix + 'activities.json');
      if (!Array.isArray(activities)) throw new Error('Las actividades deben ser un array.');
      if (generation !== viewGeneration) return;
      const output = {
        account: activeArchive.account,
        organization: activeArchive.workspace,
        source: 'jules-export-local',
        read_only: true,
        session,
        activities
      };
      const text = JSON.stringify(output, null, 2);
      const MAX_PREVIEW = 220000;
      write('jules-archive-detail', text.length > MAX_PREVIEW
        ? text.slice(0, MAX_PREVIEW) + '\n\n[Vista truncada: conserva el ZIP original para el historial íntegro.]'
        : text);
      const patches = byId('jules-archive-patches');
      if (patches) {
        patches.replaceChildren();
        const name = s.prefix + 'patches-index.json';
        if (s.zip.entries.has(name)) {
          const index = await readJson(s.zip, name, 10 * 1024 * 1024);
          if (!Array.isArray(index)) throw new Error('Índice de parches inválido.');
          const names = [...new Set(index.map(p => p.file).filter(Boolean))];
          for (const file of names.slice(0, 100)) {
            if (file.includes('/') || file.includes('\\') || !file.endsWith('.diff')) continue;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'jules-archive-item';
            btn.textContent = 'Ver parche: ' + file;
            btn.addEventListener('click', async () => {
              try {
                const diff = decoder.decode(await readEntry(s.zip, s.prefix + file, 2 * 1024 * 1024));
                write('jules-archive-detail', diff.slice(0, MAX_PREVIEW));
              } catch (err) { write('jules-archive-status', err.message); }
            });
            patches.appendChild(btn);
          }
        }
      }
    } catch (err) {
      if (generation === viewGeneration) write('jules-archive-detail', 'No se puede leer sesión: ' + err.message);
    }
  }

  function openDialog() {
    const dlg = byId('jules-archive-dialog');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    write('jules-archive-workspace', root.githubApi?.getActiveWorkspace?.() || 'hypenosys');
    dlg.showModal();
    if (activeArchive) renderList(byId('jules-archive-filter')?.value || '');
  }

  async function importFromUi() {
    const button = byId('jules-archive-load');
    const input = byId('jules-archive-files');
    const account = byId('jules-archive-account')?.value || '';
    const workspace = root.githubApi?.getActiveWorkspace?.() || 'hypenosys';
    if (button) button.disabled = true;
    write('jules-archive-status', 'Verificando ZIP y manifiesto localmente…');
    try {
      const archive = await inspectArchive(Array.from(input?.files || []), account, workspace);
      activeArchive = archive;
      viewGeneration++;
      write('jules-archive-status', 'Archivo cargado en esta pestaña. No se ha enviado al servidor.');
      write('jules-archive-summary', 'Cuenta: ' + archive.account +
        ' · organización: ' + archive.workspace + ' · ' + archive.sessions.length +
        ' sesiones · exportación: ' + (archive.manifest.export_date || 'sin fecha') +
        (archive.notices.length ? '\n⚠ Respaldo posiblemente parcial: ' + archive.notices.join(' ') :
         '\nRegistros indexados; verifica también los ZIP originales y sus backups.'));
      write('jules-archive-detail', 'Selecciona una sesión para leer sus registros y actividades.');
      const patches = byId('jules-archive-patches');
      if (patches) patches.replaceChildren();
      renderList(byId('jules-archive-filter')?.value || '');
    } catch (err) {
      write('jules-archive-status', 'No se importó: ' + err.message);
    } finally {
      if (button) button.disabled = false;
      if (input) input.value = '';
    }
  }

  function init() {
    const button = byId('hdr-import-btn');
    if (button) button.addEventListener('click', openDialog);
    byId('jules-archive-load')?.addEventListener('click', () => { void importFromUi(); });
    byId('jules-archive-filter')?.addEventListener('input', ev => renderList(ev.target.value));
    byId('jules-archive-close')?.addEventListener('click', () => byId('jules-archive-dialog')?.close());
    byId('jules-archive-dialog')?.addEventListener('close', () => { /* private data stays in-memory until tab closes */ });
  }

  const api = { open: openDialog, openZip, readEntry, readJson, parseCsv, inspectArchive, init,
    getCurrent: () => activeArchive && ({
      account: activeArchive.account, workspace: activeArchive.workspace,
      count: activeArchive.sessions.length, notices: [...activeArchive.notices]
    })
  };
  root.JulesArchiveImporter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
