/**
 * Jules Export Module for Hypenosys Panel
 * Genera un archivo ZIP (o conjunto de partes ZIP) con el historial completo de Jules
 * (fuentes, sesiones, actividades, patches y resúmenes).
 * Módulo autocontenido en Vanilla JS sin dependencias externas.
 *
 * Referencias a diagnósticos del código previo:
 * - Guarda de paginación con Set de ids vistos y nextPageToken repetido (líneas previas 388, 406, 483).
 * - ZipWriter libera bytes uncomprimidos en memoria conservando únicamente bytes comprimidos (líneas previas 63-107).
 * - Deduplicación de patches derivados por SHA-256 en lugar de guardado doble acumulativo (líneas previas 498-508).
 * - Soporte de compresión DEFLATE (ZIP método 8) mediante CompressionStream('deflate-raw') con fallback a Store (método 0).
 */

// ─── Simple Mutex / AsyncLock Helper ───
class AsyncLock {
    constructor() {
        this.promise = Promise.resolve();
    }
    async run(fn) {
        const next = this.promise.then(() => fn());
        this.promise = next.catch(() => {});
        return next;
    }
}

// ─── CRC32 Implementation ───
const CRC32_TABLE = (function() {
    let c;
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
    }
    return table;
})();

function crc32(data) {
    let buf;
    if (typeof data === 'string') {
        buf = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
        buf = data;
    } else if (data instanceof ArrayBuffer) {
        buf = new Uint8Array(data);
    } else {
        buf = new Uint8Array(0);
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── DOS Date/Time Helper ───
function getDosDateTime(dateObj) {
    const d = dateObj || new Date();
    const year = d.getFullYear();
    const dosYear = year >= 1980 ? year - 1980 : 0;
    const dosMonth = d.getMonth() + 1;
    const dosDay = d.getDate();
    const dosHours = d.getHours();
    const dosMinutes = d.getMinutes();
    const dosSeconds = Math.floor(d.getSeconds() / 2);

    const time = (dosHours << 11) | (dosMinutes << 5) | dosSeconds;
    const date = (dosYear << 9) | (dosMonth << 5) | dosDay;
    return { time, date };
}

// ─── Path Sanitization Helper ───
function sanitizePathSegment(segment) {
    if (!segment || typeof segment !== 'string') return 'unnamed';
    return segment.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ─── SHA-256 Digest Helper ───
async function getSha256(data, cryptoImpl) {
    const cryptoObj = cryptoImpl !== undefined
        ? cryptoImpl
        : ((typeof globalThis !== 'undefined' && globalThis.crypto) || (typeof window !== 'undefined' && window.crypto) || null);

    let subtle = cryptoObj ? cryptoObj.subtle : null;

    if (!subtle && typeof require === 'function') {
        try {
            const reqCrypto = require('crypto');
            if (reqCrypto && reqCrypto.webcrypto) subtle = reqCrypto.webcrypto.subtle;
        } catch (e) {
            // Defensive check
        }
    }

    if (!subtle) {
        throw new Error('CRYPTO_SUBTLE_UNAVAILABLE: crypto.subtle no está disponible para calcular SHA-256.');
    }

    let bytes;
    if (typeof data === 'string') {
        bytes = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
        bytes = data;
    } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
    } else {
        bytes = new Uint8Array(0);
    }

    const hashBuffer = await subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── ZipWriter (DEFLATE / Store ZIP Generator) ───
class ZipWriter {
    constructor(options = {}) {
        this.entries = [];
        this.totalCompressedSizeEstimate = 0;
        this.CompressionStreamImpl = options.CompressionStreamImpl !== undefined
            ? options.CompressionStreamImpl
            : (typeof globalThis !== 'undefined' && globalThis.CompressionStream ? globalThis.CompressionStream : null);
    }

    async addFile(path, data) {
        if (this.entries.length >= 60000) {
            throw new Error('ZIP_ENTRY_LIMIT_EXCEEDED: Se ha superado el límite de 60.000 entradas por archivo ZIP.');
        }

        let bytes;
        if (typeof data === 'string') {
            bytes = new TextEncoder().encode(data);
        } else if (data instanceof Uint8Array) {
            bytes = data;
        } else if (data instanceof ArrayBuffer) {
            bytes = new Uint8Array(data);
        } else {
            bytes = new Uint8Array(0);
        }

        const uncompressedSize = bytes.length;
        if (uncompressedSize > 4294967295) {
            throw new Error(`ZIP_SIZE_LIMIT_EXCEEDED: El archivo ${path} supera el límite de 4 GB del formato ZIP clásico.`);
        }

        const pathBytes = new TextEncoder().encode(path);
        const checksum = crc32(bytes);
        let compressedBytes = null;
        let method = 0; // Store

        if (this.CompressionStreamImpl) {
            try {
                const cs = new this.CompressionStreamImpl('deflate-raw');
                const writer = cs.writable.getWriter();
                writer.write(bytes);
                writer.close();
                const reader = cs.readable.getReader();
                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }
                let totalLen = 0;
                for (let i = 0; i < chunks.length; i++) totalLen += chunks[i].length;
                compressedBytes = new Uint8Array(totalLen);
                let offset = 0;
                for (let i = 0; i < chunks.length; i++) {
                    compressedBytes.set(chunks[i], offset);
                    offset += chunks[i].length;
                }
                method = 8; // Deflate
            } catch (e) {
                compressedBytes = null;
            }
        }

        if (!compressedBytes) {
            compressedBytes = bytes;
            method = 0; // Store fallback
        }

        const entry = {
            path,
            pathBytes,
            data: compressedBytes, // Store only compressed bytes to free memory
            crc32: checksum,
            uncompressedSize: uncompressedSize,
            compressedSize: compressedBytes.length,
            method: method,
            dosDateTime: getDosDateTime()
        };

        this.entries.push(entry);
        this.totalCompressedSizeEstimate += compressedBytes.length + pathBytes.length + 100;

        if (this.totalCompressedSizeEstimate > 4294967295) {
            throw new Error('ZIP_TOTAL_SIZE_EXCEEDED: El archivo ZIP total superaría el límite de 4 GB.');
        }
    }

    buildBlob() {
        const parts = [];
        const centralDirectoryParts = [];
        let currentOffset = 0;

        for (let i = 0; i < this.entries.length; i++) {
            const entry = this.entries[i];
            const localHeaderOffset = currentOffset;

            // Local File Header (30 bytes + path length)
            const localHeader = new Uint8Array(30 + entry.pathBytes.length);
            const view = new DataView(localHeader.buffer);

            view.setUint32(0, 0x04034b50, true); // Local header signature
            view.setUint16(4, 20, true);         // Version needed (2.0)
            view.setUint16(6, 0x0800, true);     // General purpose bit flag (UTF-8)
            view.setUint16(8, entry.method, true);// Compression method (8 = Deflate, 0 = Store)
            view.setUint16(10, entry.dosDateTime.time, true);
            view.setUint16(12, entry.dosDateTime.date, true);
            view.setUint32(14, entry.crc32, true);
            view.setUint32(18, entry.compressedSize, true);
            view.setUint32(22, entry.uncompressedSize, true);
            view.setUint16(26, entry.pathBytes.length, true);
            view.setUint16(28, 0, true);         // Extra field length

            localHeader.set(entry.pathBytes, 30);

            parts.push(localHeader);
            parts.push(entry.data);

            currentOffset += localHeader.length + entry.data.length;

            // Central Directory Header (46 bytes + path length)
            const cdHeader = new Uint8Array(46 + entry.pathBytes.length);
            const cdView = new DataView(cdHeader.buffer);

            cdView.setUint32(0, 0x02014b50, true); // Central directory signature
            cdView.setUint16(4, 20, true);         // Version made by
            cdView.setUint16(6, 20, true);         // Version needed
            cdView.setUint16(8, 0x0800, true);     // UTF-8 flag
            cdView.setUint16(10, entry.method, true);// Compression method
            cdView.setUint16(12, entry.dosDateTime.time, true);
            cdView.setUint16(14, entry.dosDateTime.date, true);
            cdView.setUint32(16, entry.crc32, true);
            cdView.setUint32(20, entry.compressedSize, true);
            cdView.setUint32(24, entry.uncompressedSize, true);
            cdView.setUint16(28, entry.pathBytes.length, true);
            cdView.setUint16(30, 0, true);         // Extra field length
            cdView.setUint16(32, 0, true);         // File comment length
            cdView.setUint16(34, 0, true);         // Disk number start
            cdView.setUint16(36, 0, true);         // Internal file attributes
            cdView.setUint32(38, 0, true);         // External file attributes
            cdView.setUint32(42, localHeaderOffset, true); // Relative offset of local header

            cdHeader.set(entry.pathBytes, 46);
            centralDirectoryParts.push(cdHeader);
        }

        const cdStartOffset = currentOffset;
        let cdSize = 0;
        for (let i = 0; i < centralDirectoryParts.length; i++) {
            parts.push(centralDirectoryParts[i]);
            cdSize += centralDirectoryParts[i].length;
        }

        // End of Central Directory Record (22 bytes)
        const eocd = new Uint8Array(22);
        const eocdView = new DataView(eocd.buffer);

        eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
        eocdView.setUint16(4, 0, true);          // Disk number
        eocdView.setUint16(6, 0, true);          // Disk start
        eocdView.setUint16(8, this.entries.length, true);  // Disk CD count
        eocdView.setUint16(10, this.entries.length, true); // Total CD count
        eocdView.setUint32(12, cdSize, true);               // Size of CD
        eocdView.setUint32(16, cdStartOffset, true);        // Offset of CD start
        eocdView.setUint16(20, 0, true);                    // Comment length

        parts.push(eocd);

        return new Blob(parts, { type: 'application/zip' });
    }
}

// ─── ZipStoreWriter Alias for Backwards Compatibility ───
const ZipStoreWriter = ZipWriter;

// ─── Patch Extraction Helper ───
function extractPatchesRecursive(obj, jsonPathPrefix = '') {
    const patches = [];
    if (!obj || typeof obj !== 'object') return patches;

    function isDiffString(val) {
        if (typeof val !== 'string') return false;
        return val.includes('diff --git') || val.startsWith('--- ') || val.startsWith('@@');
    }

    function traverse(node, currentPath) {
        if (!node || typeof node !== 'object') return;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                traverse(node[i], `${currentPath}[${i}]`);
            }
            return;
        }

        for (const key of Object.keys(node)) {
            const val = node[key];
            const propPath = currentPath ? `${currentPath}.${key}` : key;
            if (/unidiff|patch|diff/i.test(key) && isDiffString(val)) {
                patches.push({ content: val, jsonPath: propPath });
            } else if (val && typeof val === 'object') {
                traverse(val, propPath);
            }
        }
    }

    try {
        traverse(obj, jsonPathPrefix);
    } catch (e) {
        // Defensive: derivations must never break export
    }

    return patches;
}

// ─── Summary Markdown Generator ───
function generateSummaryMd(session, activities, patchesCount) {
    try {
        const title = session.title || session.name || 'Sin Título';
        const id = session.name ? session.name.replace(/^sessions\//, '') : 'desconocido';
        const repo = (session.sourceContext && session.sourceContext.source) || 'N/A';
        const state = session.state || 'DESCONOCIDO';
        const created = session.createTime || 'N/A';
        const updated = session.updateTime || 'N/A';
        const prompt = session.prompt || 'Sin prompt inicial';
        const prUrl = (session.sourceContext && session.sourceContext.pullRequest && session.sourceContext.pullRequest.url) || null;

        const activityKinds = {};
        if (Array.isArray(activities)) {
            activities.forEach(a => {
                const kind = a.originator || a.type || 'desconocido';
                activityKinds[kind] = (activityKinds[kind] || 0) + 1;
            });
        }

        let breakdownText = '';
        for (const [k, v] of Object.entries(activityKinds)) {
            breakdownText += `- **${k}**: ${v}\n`;
        }
        if (!breakdownText) breakdownText = '- Ninguna registrada\n';

        return `# Resumen de Sesión: ${title}

- **ID**: \`${id}\`
- **Estado**: \`${state}\`
- **Repositorio**: \`${repo}\`
- **Fecha Creación**: ${created}
- **Última Actualización**: ${updated}
${prUrl ? `- **Pull Request**: [${prUrl}](${prUrl})\n` : ''}- **Total Actividades**: ${activities ? activities.length : 0}
- **Patches Extraídos**: ${patchesCount}

## Desglose de Actividades por Tipo
${breakdownText}
## Prompt Inicial
\`\`\`
${prompt}
\`\`\`
`;
    } catch (e) {
        return `# Resumen de Sesión\n\n- Error al generar resumen: ${e.message}\n`;
    }
}

// ─── Root CSV Index Generator ───
function generateSessionsCsv(sessionsList) {
    const headers = ['id', 'title', 'repo', 'state', 'createTime', 'updateTime', 'prUrl', 'activityCount', 'patchCount'];
    function escapeCsv(val) {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    }

    const rows = [headers.join(',')];
    if (Array.isArray(sessionsList)) {
        sessionsList.forEach(s => {
            const row = [
                escapeCsv(s.id),
                escapeCsv(s.title),
                escapeCsv(s.repo),
                escapeCsv(s.state),
                escapeCsv(s.createTime),
                escapeCsv(s.updateTime),
                escapeCsv(s.prUrl),
                escapeCsv(s.activityCount),
                escapeCsv(s.patchCount)
            ];
            rows.push(row.join(','));
        });
    }
    return rows.join('\n');
}

// ─── Direct API Call with Retry and Backoff ───
async function fetchWithRetry(endpoint, options = {}, abortSignal = null) {
    const maxRetries = 4;
    const backoffs = [1000, 2000, 4000, 8000];
    const callFn = options.callFn || (typeof window !== 'undefined' && window.julesApiCall);

    if (typeof callFn !== 'function') {
        throw new Error('API_CALL_FN_UNAVAILABLE');
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (abortSignal && abortSignal.aborted) {
            const err = new Error('REQUEST_ABORTED');
            err.name = 'AbortError';
            throw err;
        }

        try {
            return await callFn('GET', endpoint, null, null, { signal: abortSignal });
        } catch (err) {
            const isAbort = err.name === 'AbortError' || err.message === 'REQUEST_ABORTED';
            if (isAbort) throw err;

            const isUnauthorized = err.message === 'API_KEY_INVALID' || err.httpStatus === 401 || err.httpStatus === 403;
            if (isUnauthorized) throw err;

            const is429 = err.message === 'RATE_LIMIT' || err.httpStatus === 429;
            const is5xx = err.httpStatus >= 500 && err.httpStatus < 600;
            const isTimeout = err.message === 'TIMEOUT';
            const isNetworkErr = err instanceof TypeError || /network/i.test(err.message);

            const isRetryable = is429 || is5xx || isTimeout || isNetworkErr;
            if (!isRetryable || attempt === maxRetries) {
                throw err;
            }

            let delayMs = backoffs[attempt] || 8000;
            if (is429 && err.retryAfterMs) {
                delayMs = err.retryAfterMs;
            }

            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

// ─── Paginated Fetch Helper with Set Guards & Stop Reason ───
async function fetchPaginatedResource({
    resourceType,
    endpointBase,
    itemKey,
    callFn,
    errors,
    abortSignal
}) {
    const seenIds = new Set();
    const seenTokens = new Set();
    let pageToken = null;
    let items = [];
    let stopReason = 'COMPLETED';
    let duplicatesDiscarded = 0;
    let pageCount = 0;

    do {
        if (abortSignal && abortSignal.aborted) {
            const err = new Error('REQUEST_ABORTED');
            err.name = 'AbortError';
            throw err;
        }

        pageCount++;
        if (pageCount > 200) {
            stopReason = 'MAX_PAGES_REACHED';
            errors.push({
                id: resourceType,
                endpoint: endpointBase,
                code: 400,
                message: `Límite duro de 200 páginas alcanzado para ${resourceType}.`
            });
            break;
        }

        const separator = endpointBase.includes('?') ? '&' : '?';
        const url = `${endpointBase}${separator}pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        let res;
        try {
            res = await fetchWithRetry(url, { callFn }, abortSignal);
        } catch (err) {
            stopReason = 'ERROR';
            errors.push({
                id: resourceType,
                endpoint: url,
                code: err.httpStatus || 500,
                message: err.message || `Error al obtener ${resourceType}`
            });
            break;
        }

        const nextPageToken = res ? res.nextPageToken : null;
        const rawList = (res && res[itemKey]) ? res[itemKey] : [];

        if (nextPageToken) {
            if (seenTokens.has(nextPageToken)) {
                stopReason = 'SAME_PAGE_TOKEN';
                errors.push({
                    id: resourceType,
                    endpoint: url,
                    code: 400,
                    message: `pageToken repetido '${nextPageToken}' detectado en página ${pageCount} de ${resourceType}.`
                });
                break;
            }
            seenTokens.add(nextPageToken);
        }

        let newItemsInPage = 0;
        let pageDuplicates = 0;

        for (let i = 0; i < rawList.length; i++) {
            const item = rawList[i];
            const id = item ? (item.name || item.id) : null;
            if (id && seenIds.has(id)) {
                pageDuplicates++;
                duplicatesDiscarded++;
            } else {
                if (id) seenIds.add(id);
                items.push(item);
                newItemsInPage++;
            }
        }

        if (rawList.length > 0 && newItemsInPage === 0) {
            stopReason = 'DUPLICATE_PAGE_DETECTED';
            errors.push({
                id: resourceType,
                endpoint: url,
                code: 400,
                message: `Página ${pageCount} de ${resourceType} no aportó ningún ID nuevo (${pageDuplicates} duplicados descartados).`
            });
            break;
        }

        pageToken = nextPageToken;
    } while (pageToken);

    return {
        items,
        stopReason,
        duplicatesDiscarded,
        uniqueCount: seenIds.size
    };
}

// ─── Parallel Concurrency Pool ───
async function mapConcurrent(items, concurrency, fn, abortSignal) {
    const results = [];
    let index = 0;

    async function worker() {
        while (index < items.length) {
            if (abortSignal && abortSignal.aborted) break;
            const currentIndex = index++;
            results[currentIndex] = await fn(items[currentIndex], currentIndex);
        }
    }

    const workers = [];
    const count = Math.min(concurrency, items.length);
    for (let i = 0; i < count; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}

// ─── Default Download Handler ───
async function defaultDownloadFn(blob, fileName) {
    if (typeof document === 'undefined') return;
    const blobUrl = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = blobUrl;
    downloadAnchor.download = fileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);

    setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
    }, 60000);
}

// ─── Main Export Orchestrator ───
let isExportRunning = false;
let currentExportAbortController = null;

async function triggerJulesExport(options = {}) {
    if (isExportRunning) {
        console.warn('[JULES-EXPORT] Export already in progress.');
        return;
    }

    const callFn = options.callFn || (typeof window !== 'undefined' && window.julesApiCall);
    const downloadFn = options.downloadFn || defaultDownloadFn;
    const cryptoImpl = options.cryptoImpl;
    const CompressionStreamImpl = options.CompressionStreamImpl !== undefined
        ? options.CompressionStreamImpl
        : (typeof globalThis !== 'undefined' && globalThis.CompressionStream ? globalThis.CompressionStream : null);

    const hasCompressionStream = !!CompressionStreamImpl;
    const maxPartCompressedBytes = options.maxPartCompressedBytes !== undefined
        ? options.maxPartCompressedBytes
        : (hasCompressionStream ? 400 * 1024 * 1024 : 300 * 1024 * 1024);
    const maxPartEntries = options.maxPartEntries !== undefined ? options.maxPartEntries : 60000;

    const apiKey = typeof window !== 'undefined' && typeof window.getJulesApiKey === 'function' ? window.getJulesApiKey() : 'key_present';
    if (!apiKey) {
        if (typeof alert !== 'undefined') {
            alert('⚠️ No hay API Key de Jules configurada. Por favor, configúrala usando el botón "API Key" del panel.');
        }
        return;
    }

    if (options.skipConfirm !== true) {
        const confirmMsg =
            'El ZIP resultante puede contener código fuente, conversaciones y salidas de terminal privadas.\n\n' +
            'Asegúrate de guardarlo de forma segura fuera de cualquier repositorio público.\n\n' +
            'Se descargarán varios ficheros ZIP; permite las descargas múltiples en el navegador.\n\n' +
            '¿Deseas iniciar la exportación del historial completo?';

        const confirmed = typeof confirm !== 'undefined' ? confirm(confirmMsg) : true;
        if (!confirmed) return;
    }

    if (!hasCompressionStream && typeof alert !== 'undefined' && options.skipConfirm !== true) {
        alert('⚠️ CompressionStream no está disponible en este navegador. Se usará el método de almacenamiento "store" y las partes se limitarán a 300 MB.');
    }

    isExportRunning = true;
    currentExportAbortController = options.abortController || new AbortController();
    const abortSignal = options.abortSignal || currentExportAbortController.signal;

    const btn = typeof document !== 'undefined' ? document.getElementById('hdr-export-btn') : null;
    const textSpan = typeof document !== 'undefined' ? document.getElementById('hdr-export-text') : null;
    const originalText = textSpan ? textSpan.textContent : 'Exportar';

    function updateProgress(msg) {
        if (textSpan) textSpan.textContent = msg;
    }

    if (btn) btn.disabled = true;

    const dateStr = new Date().toISOString().split('T')[0];
    const rootDir = `jules-export-${dateStr}`;
    const errors = [];

    // Dashboard count at export
    let dashboardCountAtExport = 0;
    try {
        if (typeof document !== 'undefined') {
            const countEl = document.getElementById('m-total') || document.getElementById('m-active');
            if (countEl && countEl.textContent) {
                const parsed = parseInt(countEl.textContent, 10);
                if (!isNaN(parsed)) dashboardCountAtExport = parsed;
            }
        }
    } catch (e) {
        dashboardCountAtExport = 0;
    }

    // State for parts and execution
    let partIndex = 1;
    let currentPartWriter = new ZipWriter({ CompressionStreamImpl });
    let currentPartSessions = [];
    const partsManifest = [];
    const sessionsByPart = {};
    let downloadedPartsCount = 0;

    let isFatalError = false;
    let fatalErrorMessage = '';

    const zipLock = new AsyncLock();

    async function closeAndDownloadCurrentPart() {
        if (currentPartSessions.length === 0 && currentPartWriter.entries.length === 0) return;

        if (partIndex > 99) {
            throw new Error('MAX_PARTS_EXCEEDED: Se ha superado el número máximo de 99 partes.');
        }

        const partNumStr = String(partIndex).padStart(2, '0');
        const partFileName = `jules-export-${dateStr}-part${partNumStr}.zip`;

        // Add parts/partNN-sessions.json (compact)
        const partSessionsJson = JSON.stringify({
            part: `part${partNumStr}`,
            sessions: currentPartSessions,
            sessions_count: currentPartSessions.length
        });
        await currentPartWriter.addFile(`${rootDir}/parts/part${partNumStr}-sessions.json`, partSessionsJson);

        const blob = currentPartWriter.buildBlob();
        const compressedBytes = blob.size;
        const entriesCount = currentPartWriter.entries.length;

        partsManifest.push({
            file: partFileName,
            sessions: [...currentPartSessions],
            entries: entriesCount,
            compressed_bytes: compressedBytes
        });
        sessionsByPart[`part${partNumStr}`] = [...currentPartSessions];

        await downloadFn(blob, partFileName);
        downloadedPartsCount++;

        partIndex++;
        currentPartWriter = new ZipWriter({ CompressionStreamImpl });
        currentPartSessions = [];

        // Pause 1 second between downloads
        await new Promise(r => setTimeout(r, 1000));
    }

    try {
        updateProgress('Obteniendo fuentes...');

        // 1. Fetch Sources
        const sourcesResult = await fetchPaginatedResource({
            resourceType: 'sources',
            endpointBase: '/sources',
            itemKey: 'sources',
            callFn,
            errors,
            abortSignal
        });
        const sources = sourcesResult.items;

        // 2. Fetch Sessions List
        updateProgress('Listando sesiones...');
        const sessionsResult = await fetchPaginatedResource({
            resourceType: 'sessions',
            endpointBase: '/sessions',
            itemKey: 'sessions',
            callFn,
            errors,
            abortSignal
        });
        const rawSessions = sessionsResult.items;

        let totalDuplicatesDiscarded = sourcesResult.duplicatesDiscarded + sessionsResult.duplicatesDiscarded;

        // Sanitize Session IDs and track collisions for DISTINCT raw IDs
        const sanitizedIdMap = new Map();
        const processedSessions = rawSessions.map((s, index) => {
            const rawId = s.name ? s.name.replace(/^sessions\//, '') : `session_${index}`;
            let sanitized = sanitizePathSegment(rawId);
            if (sanitizedIdMap.has(sanitized)) {
                let count = sanitizedIdMap.get(sanitized) + 1;
                sanitizedIdMap.set(sanitized, count);
                const originalSanitized = sanitized;
                sanitized = `${sanitized}-${count}`;
                errors.push({
                    id: rawId,
                    endpoint: s.name || '',
                    code: 200,
                    message: `ID collision detected for '${originalSanitized}'. Renamed to '${sanitized}'.`
                });
            } else {
                sanitizedIdMap.set(sanitized, 1);
            }
            return { rawSession: s, sanitizedId: sanitized, rawId: rawId };
        });

        // 3. Process sessions details and activities
        let processedCount = 0;
        let totalActivitiesCount = 0;
        let totalPatchesCount = 0;
        const csvSummaryItems = [];
        const activitiesBreakdownBySession = {};
        const activitiesStopReasonMap = {};

        await mapConcurrent(processedSessions, 3, async (item) => {
            if (abortSignal.aborted) return;
            const { rawSession, sanitizedId } = item;
            const sName = rawSession.name || `sessions/${sanitizedId}`;

            let detail = rawSession;
            // Fetch fresh session detail
            try {
                const freshDetail = await fetchWithRetry(`/${sName.replace(/^\//, '')}`, { callFn }, abortSignal);
                if (freshDetail && freshDetail.name) detail = freshDetail;
            } catch (err) {
                const isUnauthorized = err.message === 'API_KEY_INVALID' || err.httpStatus === 401 || err.httpStatus === 403;
                if (isUnauthorized) throw err; // Fatal error

                errors.push({
                    id: sanitizedId,
                    endpoint: `/${sName}`,
                    code: err.httpStatus || 500,
                    message: `Error fetching session detail: ${err.message}`
                });
            }

            // Fetch activities with pagination guards
            const actEndpoint = `/${sName.replace(/^\//, '')}/activities`;
            const actResult = await fetchPaginatedResource({
                resourceType: `activities_${sanitizedId}`,
                endpointBase: actEndpoint,
                itemKey: 'activities',
                callFn,
                errors,
                abortSignal
            });

            const activities = actResult.items;

            if (actResult.stopReason !== 'COMPLETED') {
                activitiesStopReasonMap[sanitizedId] = actResult.stopReason;
            }

            // Extract patches recursively from activities and detail
            const allExtractedPatches = [];
            activities.forEach((act, actIdx) => {
                const patches = extractPatchesRecursive(act, `activities[${actIdx}]`);
                allExtractedPatches.push(...patches);
            });
            const detailPatches = extractPatchesRecursive(detail, 'detail');
            allExtractedPatches.push(...detailPatches);

            // SHA-256 Deduplication of patches per session
            const sessionPatchesMap = new Map(); // sha256 -> fileName
            const sessionSha12Map = new Map();   // sha12 -> count
            const patchesIndex = [];
            const uniquePatchFiles = [];

            for (const patch of allExtractedPatches) {
                const sha256Hex = await getSha256(patch.content, cryptoImpl);
                const sha12Base = sha256Hex.slice(0, 12);
                let fileName;

                if (sessionPatchesMap.has(sha256Hex)) {
                    fileName = sessionPatchesMap.get(sha256Hex);
                } else {
                    let count = sessionSha12Map.get(sha12Base) || 0;
                    count++;
                    sessionSha12Map.set(sha12Base, count);
                    fileName = count > 1 ? `patch-${sha12Base}-${count}.diff` : `patch-${sha12Base}.diff`;
                    sessionPatchesMap.set(sha256Hex, fileName);
                    uniquePatchFiles.push({ fileName, content: patch.content });
                }

                patchesIndex.push({
                    sha256: sha256Hex,
                    sha12: sha12Base,
                    file: fileName,
                    jsonPath: patch.jsonPath
                });
            }

            // Session Summary MD
            const summaryMd = generateSummaryMd(detail, activities, uniquePatchFiles.length);

            // Session files collection
            const sessionFolder = `${rootDir}/sessions/${sanitizedId}`;
            const sessionFiles = [
                { path: `${sessionFolder}/session.json`, data: JSON.stringify(detail, null, 2) }, // indented
                { path: `${sessionFolder}/activities.json`, data: JSON.stringify(activities) }, // compact
                { path: `${sessionFolder}/summary.md`, data: summaryMd },
                { path: `${sessionFolder}/patches-index.json`, data: JSON.stringify(patchesIndex, null, 2) } // indented
            ];

            uniquePatchFiles.forEach(pf => {
                sessionFiles.push({ path: `${sessionFolder}/${pf.fileName}`, data: pf.content });
            });

            // Calculate size estimate for part threshold
            let sessionBytesEstimate = 0;
            for (const sf of sessionFiles) {
                if (typeof sf.data === 'string') sessionBytesEstimate += sf.data.length * 2;
                else if (sf.data instanceof Uint8Array) sessionBytesEstimate += sf.data.length;
            }

            // Thread-safe ZIP writer append and part boundary check
            await zipLock.run(async () => {
                totalDuplicatesDiscarded += actResult.duplicatesDiscarded;

                if (currentPartSessions.length > 0 &&
                    (currentPartWriter.totalCompressedSizeEstimate + sessionBytesEstimate > maxPartCompressedBytes ||
                     currentPartWriter.entries.length + sessionFiles.length > maxPartEntries)) {
                    await closeAndDownloadCurrentPart();
                }

                for (const sf of sessionFiles) {
                    await currentPartWriter.addFile(sf.path, sf.data);
                }
                currentPartSessions.push(sanitizedId);

                if (currentPartWriter.totalCompressedSizeEstimate >= maxPartCompressedBytes ||
                    currentPartWriter.entries.length >= maxPartEntries) {
                    await closeAndDownloadCurrentPart();
                }

                // CSV Summary Row
                csvSummaryItems.push({
                    id: sanitizedId,
                    title: detail.title || detail.name || 'Sin Título',
                    repo: (detail.sourceContext && detail.sourceContext.source) || 'N/A',
                    state: detail.state || 'N/A',
                    createTime: detail.createTime || 'N/A',
                    updateTime: detail.updateTime || 'N/A',
                    prUrl: (detail.sourceContext && detail.sourceContext.pullRequest && detail.sourceContext.pullRequest.url) || '',
                    activityCount: activities.length,
                    patchCount: uniquePatchFiles.length
                });

                processedCount++;
                totalActivitiesCount += activities.length;
                totalPatchesCount += uniquePatchFiles.length;
                activitiesBreakdownBySession[sanitizedId] = activities.length;

                const partNumStr = String(partIndex).padStart(2, '0');
                const retainedMb = (currentPartWriter.totalCompressedSizeEstimate / (1024 * 1024)).toFixed(1);
                updateProgress(`Sesiones ${processedCount}/${processedSessions.length} · actividades ${totalActivitiesCount} · parte ${partNumStr} · ${retainedMb} MB retenidos`);
            });
        }, abortSignal);

        if (abortSignal.aborted) throw new Error('REQUEST_ABORTED');

        // Close last part if it contains remaining sessions
        await zipLock.run(async () => {
            if (currentPartSessions.length > 0) {
                await closeAndDownloadCurrentPart();
            }
        });

        // Generate Root Index ZIP
        updateProgress('Generando archivo de índice...');
        const rootIndexWriter = new ZipWriter({ CompressionStreamImpl });

        const csvContent = generateSessionsCsv(csvSummaryItems);
        await rootIndexWriter.addFile(`${rootDir}/sessions-index.csv`, csvContent);

        const manifest = {
            export_date: new Date().toISOString(),
            exporter_version: "2.0.0",
            complete: true,
            incomplete_reason: null,
            sources_count: sources.length,
            sources_unique: sourcesResult.uniqueCount,
            sessions_listed: rawSessions.length,
            sessions_unique: sessionsResult.uniqueCount,
            duplicates_discarded: totalDuplicatesDiscarded,
            sessions_processed: processedSessions.length,
            total_activities: totalActivitiesCount,
            total_patches: totalPatchesCount,
            count_in_dashboard_at_export: dashboardCountAtExport,
            pagination_stop_reason: {
                sources: sourcesResult.stopReason,
                sessions: sessionsResult.stopReason
            },
            activities_stop_reason: activitiesStopReasonMap,
            parts: partsManifest,
            sessions_by_part: sessionsByPart,
            activities_per_session: activitiesBreakdownBySession,
            errors_count: errors.length,
            errors: errors,
            note: "Este paquete ha sido generado a través de la API pública de Jules. La API pública puede omitir sesiones antiguas o de proyectos archivados."
        };

        await rootIndexWriter.addFile(`${rootDir}/manifest.json`, JSON.stringify(manifest, null, 2)); // indented
        await rootIndexWriter.addFile(`${rootDir}/errors.json`, JSON.stringify(errors, null, 2));     // indented
        await rootIndexWriter.addFile(`${rootDir}/sources.json`, JSON.stringify(sources, null, 2));   // indented
        await rootIndexWriter.addFile(`${rootDir}/sessions.json`, JSON.stringify(rawSessions));      // compact

        const readmeContent = `# Jules Agent Export — HYPENOSYS

Fecha de Exportación: ${manifest.export_date}
Versión del Exporter: ${manifest.exporter_version}

## Contenido del Paquete de Índice

- \`manifest.json\`: Metadatos de la exportación, resúmenes de conteo, estado de partes y errores registrados.
- \`README.md\`: Este archivo de documentación.
- \`sources.json\`: Listado completo de repositorios y fuentes conectadas.
- \`sessions-index.csv\`: Índice en CSV con el resumen de todas las sesiones.
- \`sessions.json\`: Listado en JSON crudo de todas las sesiones accesibles.
- \`errors.json\`: Registro estructurado de errores y colisiones ocurridos durante el proceso.

## Partes Descargadas
${partsManifest.map(p => `- \`${p.file}\`: ${p.sessions.length} sesiones, ${p.entries} archivos, ${p.compressed_bytes} bytes`).join('\n')}
`;
        await rootIndexWriter.addFile(`${rootDir}/README.md`, readmeContent);

        const indexBlob = rootIndexWriter.buildBlob();
        await downloadFn(indexBlob, `${rootDir}-index.zip`);

        if (typeof alert !== 'undefined' && options.skipConfirm !== true) {
            alert(
                `✅ Exportación completada con éxito.\n\n` +
                `📦 Resumen del respaldo:\n` +
                `- Fuentes conectadas: ${sources.length}\n` +
                `- Sesiones procesadas: ${processedSessions.length}\n` +
                `- Total de actividades: ${totalActivitiesCount}\n` +
                `- Patches extraídos: ${totalPatchesCount}\n` +
                `- Partes generadas: ${partsManifest.length}\n` +
                `- Errores parciales: ${errors.length}`
            );
        }

    } catch (err) {
        const isAbort = err.message === 'REQUEST_ABORTED' || (abortSignal && abortSignal.aborted) || err.name === 'AbortError';

        if (isAbort) {
            console.log('[JULES-EXPORT] Exportación cancelada por el usuario.');
            const cancelMsg = `Exportación cancelada: ${downloadedPartsCount} partes descargadas, sin índice. Cada parte incluye parts/partNN-sessions.json con su listado.`;
            if (typeof alert !== 'undefined' && options.skipConfirm !== true) {
                alert(`🚫 ${cancelMsg}`);
            }
        } else {
            console.error('[JULES-EXPORT] Error crítico durante la exportación:', err);
            isFatalError = true;
            fatalErrorMessage = err.message || 'Error desconocido';

            // On fatal error: close & download active part if it has sessions, then generate index with complete=false
            try {
                await zipLock.run(async () => {
                    if (currentPartSessions.length > 0) {
                        await closeAndDownloadCurrentPart();
                    }
                });

                const rootIndexWriter = new ZipWriter({ CompressionStreamImpl });
                const manifest = {
                    export_date: new Date().toISOString(),
                    exporter_version: "2.0.0",
                    complete: false,
                    incomplete_reason: fatalErrorMessage,
                    parts: partsManifest,
                    sessions_by_part: sessionsByPart,
                    errors_count: errors.length,
                    errors: errors
                };

                await rootIndexWriter.addFile(`${rootDir}/manifest.json`, JSON.stringify(manifest, null, 2));
                await rootIndexWriter.addFile(`${rootDir}/errors.json`, JSON.stringify(errors, null, 2));
                const indexBlob = rootIndexWriter.buildBlob();
                await downloadFn(indexBlob, `${rootDir}-index.zip`);
            } catch (e) {
                console.error('[JULES-EXPORT] Error al generar índice incompleto:', e);
            }

            if (typeof alert !== 'undefined' && options.skipConfirm !== true) {
                alert(`⚠️ Error en la exportación: ${fatalErrorMessage}`);
            }
        }
    } finally {
        isExportRunning = false;
        currentExportAbortController = null;
        if (btn) btn.disabled = false;
        if (textSpan) textSpan.textContent = originalText;
    }
}

// ─── Top-Level Synchronous Binding ───
if (typeof window !== 'undefined') {
    window.triggerJulesExport = triggerJulesExport;
}

// ─── CommonJS Export for Testing ───
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        crc32,
        getDosDateTime,
        sanitizePathSegment,
        getSha256,
        ZipWriter,
        ZipStoreWriter,
        extractPatchesRecursive,
        generateSummaryMd,
        generateSessionsCsv,
        fetchWithRetry,
        fetchPaginatedResource,
        mapConcurrent,
        triggerJulesExport
    };
}
