/**
 * Jules Export Module for Hypenosys Panel
 * Genera un archivo ZIP con el historial completo de Jules (fuentes, sesiones, actividades, patches y resúmenes).
 * Módulo autocontenido en Vanilla JS sin dependencias externas.
 */

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
    } else {
        buf = new Uint8Array(data);
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

// ─── ZipStoreWriter (Store / Uncompressed ZIP Generator) ───
class ZipStoreWriter {
    constructor() {
        this.entries = [];
        this.totalSizeEstimate = 0;
    }

    addFile(path, data) {
        if (this.entries.length >= 65535) {
            throw new Error('ZIP_ENTRY_LIMIT_EXCEEDED: Se ha superado el límite de 65,535 entradas del formato ZIP clásico.');
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

        if (bytes.length > 4294967295) {
            throw new Error(`ZIP_SIZE_LIMIT_EXCEEDED: El archivo ${path} supera el límite de 4 GB del formato ZIP clásico.`);
        }

        const pathBytes = new TextEncoder().encode(path);
        const checksum = crc32(bytes);
        const entry = {
            path,
            pathBytes,
            data: bytes,
            crc32: checksum,
            uncompressedSize: bytes.length,
            dosDateTime: getDosDateTime()
        };

        this.entries.push(entry);
        this.totalSizeEstimate += bytes.length + pathBytes.length + 100;
        if (this.totalSizeEstimate > 4294967295) {
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

            // Local File Header
            const localHeader = new Uint8Array(30 + entry.pathBytes.length);
            const view = new DataView(localHeader.buffer);

            view.setUint32(0, 0x04034b50, true); // Local header signature
            view.setUint16(4, 20, true);         // Version needed to extract (2.0)
            view.setUint16(6, 0x0800, true);     // General purpose bit flag (Bit 11 set for UTF-8)
            view.setUint16(8, 0, true);          // Compression method (0 = Store)
            view.setUint16(10, entry.dosDateTime.time, true);
            view.setUint16(12, entry.dosDateTime.date, true);
            view.setUint32(14, entry.crc32, true);
            view.setUint32(18, entry.uncompressedSize, true); // Compressed size
            view.setUint32(22, entry.uncompressedSize, true); // Uncompressed size
            view.setUint16(26, entry.pathBytes.length, true);
            view.setUint16(28, 0, true);                       // Extra field length

            localHeader.set(entry.pathBytes, 30);

            parts.push(localHeader);
            parts.push(entry.data);

            currentOffset += localHeader.length + entry.data.length;

            // Central Directory Header
            const cdHeader = new Uint8Array(46 + entry.pathBytes.length);
            const cdView = new DataView(cdHeader.buffer);

            cdView.setUint32(0, 0x02014b50, true); // Central directory signature
            cdView.setUint16(4, 20, true);         // Version made by (2.0)
            cdView.setUint16(6, 20, true);         // Version needed (2.0)
            cdView.setUint16(8, 0x0800, true);     // UTF-8 flag
            cdView.setUint16(10, 0, true);         // Compression method (0 = Store)
            cdView.setUint16(12, entry.dosDateTime.time, true);
            cdView.setUint16(14, entry.dosDateTime.date, true);
            cdView.setUint32(16, entry.crc32, true);
            cdView.setUint32(20, entry.uncompressedSize, true);
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

        // End of Central Directory Record (EOCD)
        const eocd = new Uint8Array(22);
        const eocdView = new DataView(eocd.buffer);

        eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
        eocdView.setUint16(4, 0, true);          // Number of this disk
        eocdView.setUint16(6, 0, true);          // Disk where central directory starts
        eocdView.setUint16(8, this.entries.length, true);  // Count of central directory records on this disk
        eocdView.setUint16(10, this.entries.length, true); // Total count of central directory records
        eocdView.setUint32(12, cdSize, true);               // Size of central directory
        eocdView.setUint32(16, cdStartOffset, true);        // Offset of start of central directory
        eocdView.setUint16(20, 0, true);                    // Comment length

        parts.push(eocd);

        return new Blob(parts, { type: 'application/zip' });
    }
}

// ─── Patch Extraction Helper ───
function extractPatchesRecursive(obj, activityIdx, activityId) {
    const patches = [];
    if (!obj || typeof obj !== 'object') return patches;

    function isDiffString(val) {
        if (typeof val !== 'string') return false;
        return val.includes('diff --git') || val.startsWith('--- ') || val.startsWith('@@');
    }

    function traverse(node) {
        if (!node || typeof node !== 'object') return;

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                traverse(node[i]);
            }
            return;
        }

        for (const key of Object.keys(node)) {
            const val = node[key];
            if (/unidiff|patch|diff/i.test(key) && isDiffString(val)) {
                patches.push(val);
            } else if (val && typeof val === 'object') {
                traverse(val);
            }
        }
    }

    try {
        traverse(obj);
    } catch (e) {
        // Defensive: derivations must never break export
    }

    return patches.map((content, idx) => {
        const suffix = idx > 0 ? `-${idx + 1}` : '';
        const name = `patch-${activityIdx}-${sanitizePathSegment(activityId)}${suffix}.diff`;
        return { name, content };
    });
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

// ─── Main Export Orchestrator ───
let isExportRunning = false;
let currentExportAbortController = null;

async function triggerJulesExport() {
    if (isExportRunning) {
        console.warn('[JULES-EXPORT] Export already in progress.');
        return;
    }

    const apiKey = typeof window !== 'undefined' && typeof window.getJulesApiKey === 'function' ? window.getJulesApiKey() : '';
    if (!apiKey) {
        if (typeof alert !== 'undefined') {
            alert('⚠️ No hay API Key de Jules configurada. Por favor, configúrala usando el botón "API Key" del panel.');
        }
        return;
    }

    const confirmed = typeof confirm !== 'undefined' ? confirm(
        'El ZIP resultante puede contener código fuente, conversaciones y salidas de terminal privadas.\n\n' +
        'Asegúrate de guardarlo de forma segura fuera de cualquier repositorio público.\n\n' +
        '¿Deseas iniciar la exportación del historial completo?'
    ) : true;

    if (!confirmed) return;

    isExportRunning = true;
    currentExportAbortController = new AbortController();
    const abortSignal = currentExportAbortController.signal;

    const btn = document.getElementById('hdr-export-btn');
    const textSpan = document.getElementById('hdr-export-text');
    const originalText = textSpan ? textSpan.textContent : 'Exportar';

    function updateProgress(msg) {
        if (textSpan) textSpan.textContent = msg;
    }

    if (btn) btn.disabled = true;

    const zip = new ZipStoreWriter();
    const errors = [];
    const dateStr = new Date().toISOString().split('T')[0];
    const rootDir = `jules-export-${dateStr}`;

    // Read current sessions count displayed on dashboard
    let dashboardCountAtExport = 0;
    try {
        const countEl = document.getElementById('m-total') || document.getElementById('m-active');
        if (countEl && countEl.textContent) {
            const parsed = parseInt(countEl.textContent, 10);
            if (!isNaN(parsed)) dashboardCountAtExport = parsed;
        }
    } catch (e) {
        dashboardCountAtExport = 0;
    }

    try {
        updateProgress('Obteniendo fuentes...');

        // 1. Fetch Sources (paginated)
        let sources = [];
        let sourcesPageToken = null;
        let sourcesNextPageExhausted = true;

        do {
            if (abortSignal.aborted) throw new Error('REQUEST_ABORTED');
            const endpoint = `/sources?pageSize=100${sourcesPageToken ? `&pageToken=${encodeURIComponent(sourcesPageToken)}` : ''}`;
            try {
                const res = await fetchWithRetry(endpoint, {}, abortSignal);
                if (res && res.sources) sources = sources.concat(res.sources);
                sourcesPageToken = res ? res.nextPageToken : null;
            } catch (err) {
                sourcesNextPageExhausted = false;
                errors.push({ id: 'sources', endpoint, code: err.httpStatus || 500, message: err.message || 'Error fetching sources' });
                break;
            }
        } while (sourcesPageToken);

        zip.addFile(`${rootDir}/sources.json`, JSON.stringify(sources, null, 2));

        // 2. Fetch Sessions List (paginated)
        updateProgress('Listando sesiones...');
        let rawSessions = [];
        let sessionsPageToken = null;
        let sessionsNextPageExhausted = true;

        do {
            if (abortSignal.aborted) throw new Error('REQUEST_ABORTED');
            const endpoint = `/sessions?pageSize=100${sessionsPageToken ? `&pageToken=${encodeURIComponent(sessionsPageToken)}` : ''}`;
            try {
                const res = await fetchWithRetry(endpoint, {}, abortSignal);
                if (res && res.sessions) rawSessions = rawSessions.concat(res.sessions);
                sessionsPageToken = res ? res.nextPageToken : null;
            } catch (err) {
                sessionsNextPageExhausted = false;
                errors.push({ id: 'sessions_list', endpoint, code: err.httpStatus || 500, message: err.message || 'Error listing sessions' });
                break;
            }
        } while (sessionsPageToken);

        zip.addFile(`${rootDir}/sessions.json`, JSON.stringify(rawSessions, null, 2));

        // Sanitize Session IDs and track collisions
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
            return { rawSession: s, sanitizedId: sanitized };
        });

        // 3. Process each session details and activities with max 3 parallel workers
        let processedCount = 0;
        let totalActivitiesCount = 0;
        let totalPatchesCount = 0;
        const csvSummaryItems = [];
        const activitiesBreakdownBySession = {};

        await mapConcurrent(processedSessions, 3, async (item, itemIdx) => {
            if (abortSignal.aborted) return;
            const { rawSession, sanitizedId } = item;
            const sName = rawSession.name || `sessions/${sanitizedId}`;

            let detail = rawSession;
            // Fetch fresh session detail
            try {
                const freshDetail = await fetchWithRetry(`/${sName.replace(/^\//, '')}`, {}, abortSignal);
                if (freshDetail && freshDetail.name) detail = freshDetail;
            } catch (err) {
                errors.push({
                    id: sanitizedId,
                    endpoint: `/${sName}`,
                    code: err.httpStatus || 500,
                    message: `Error fetching session detail: ${err.message}`
                });
            }

            // Fetch all activities for this session
            let activities = [];
            let actPageToken = null;
            do {
                if (abortSignal.aborted) break;
                const actEndpoint = `/${sName.replace(/^\//, '')}/activities?pageSize=100${actPageToken ? `&pageToken=${encodeURIComponent(actPageToken)}` : ''}`;
                try {
                    const actRes = await fetchWithRetry(actEndpoint, {}, abortSignal);
                    if (actRes && actRes.activities) activities = activities.concat(actRes.activities);
                    actPageToken = actRes ? actRes.nextPageToken : null;
                } catch (err) {
                    errors.push({
                        id: sanitizedId,
                        endpoint: actEndpoint,
                        code: err.httpStatus || 500,
                        message: `Error fetching activities: ${err.message}`
                    });
                    break;
                }
            } while (actPageToken);

            // Extract patches recursively from activities and detail
            let sessionPatches = [];
            activities.forEach((act, actIdx) => {
                const actPatches = extractPatchesRecursive(act, actIdx + 1, act.name || act.id || `act_${actIdx}`);
                sessionPatches = sessionPatches.concat(actPatches);
            });
            const detailPatches = extractPatchesRecursive(detail, 0, 'detail');
            sessionPatches = sessionPatches.concat(detailPatches);

            // Generate session summary markdown
            const summaryMd = generateSummaryMd(detail, activities, sessionPatches.length);

            // Add files directly to ZIP store and release references
            const sessionFolder = `${rootDir}/sessions/${sanitizedId}`;
            zip.addFile(`${sessionFolder}/session.json`, JSON.stringify(detail, null, 2));
            zip.addFile(`${sessionFolder}/activities.json`, JSON.stringify(activities, null, 2));
            zip.addFile(`${sessionFolder}/summary.md`, summaryMd);

            sessionPatches.forEach(p => {
                zip.addFile(`${sessionFolder}/${p.name}`, p.content);
            });

            // CSV Row Data
            csvSummaryItems.push({
                id: sanitizedId,
                title: detail.title || detail.name || 'Sin Título',
                repo: (detail.sourceContext && detail.sourceContext.source) || 'N/A',
                state: detail.state || 'N/A',
                createTime: detail.createTime || 'N/A',
                updateTime: detail.updateTime || 'N/A',
                prUrl: (detail.sourceContext && detail.sourceContext.pullRequest && detail.sourceContext.pullRequest.url) || '',
                activityCount: activities.length,
                patchCount: sessionPatches.length
            });

            processedCount++;
            totalActivitiesCount += activities.length;
            totalPatchesCount += sessionPatches.length;
            activitiesBreakdownBySession[sanitizedId] = activities.length;

            updateProgress(`Sesiones ${processedCount}/${processedSessions.length} · actividades ${totalActivitiesCount}`);
        }, abortSignal);

        if (abortSignal.aborted) throw new Error('REQUEST_ABORTED');

        // 4. Generate Root Files
        const csvContent = generateSessionsCsv(csvSummaryItems);
        zip.addFile(`${rootDir}/sessions-index.csv`, csvContent);

        const manifest = {
            export_date: new Date().toISOString(),
            exporter_version: "1.0.0",
            sources_count: sources.length,
            sessions_listed: rawSessions.length,
            sessions_processed: processedSessions.length,
            total_activities: totalActivitiesCount,
            total_patches: totalPatchesCount,
            count_in_dashboard_at_export: dashboardCountAtExport,
            nextPageToken_exhausted: {
                sources: sourcesNextPageExhausted,
                sessions: sessionsNextPageExhausted
            },
            activities_per_session: activitiesBreakdownBySession,
            errors_count: errors.length,
            errors: errors,
            note: "Este paquete ha sido generado a través de la API pública de Jules. La API pública puede omitir sesiones antiguas o de proyectos archivados. El export oficial interno de Google Jules es el complemento requerido para ajustes, variables de entorno y ejecuciones del sandbox."
        };

        zip.addFile(`${rootDir}/manifest.json`, JSON.stringify(manifest, null, 2));
        zip.addFile(`${rootDir}/errors.json`, JSON.stringify(errors, null, 2));

        const readmeContent = `# Jules Agent Export — HYPENOSYS

Fecha de Exportación: ${manifest.export_date}
Versión del Exporter: ${manifest.exporter_version}

## Contenido del Paquete

- \`manifest.json\`: Metadatos de la exportación, resúmenes de conteo y errores registrados.
- \`README.md\`: Este archivo de documentación.
- \`sources.json\`: Listado completo de repositorios y fuentes conectadas.
- \`sessions-index.csv\`: Índice en CSV con el resumen de todas las sesiones.
- \`sessions.json\`: Listado en JSON crudo de todas las sesiones accesibles.
- \`errors.json\`: Registro estructurado de errores y colisiones ocurridos durante el proceso.
- \`sessions/<id>/\`: Directorio individual por cada sesión exportada conteniendo:
  - \`session.json\`: Detalle en JSON crudo de la sesión.
  - \`activities.json\`: Historial completo de actividades en JSON crudo.
  - \`summary.md\`: Resumen ejecutivo formateado en Markdown.
  - \`patch-*.diff\`: Archivos de parche Unidiff extraídos de la sesión.

## Limitaciones e Información de la API

Este paquete ha sido generado consumiendo la API pública de Jules.
Tener en cuenta que:
- Variables de entorno, secretos y configuraciones avanzadas no forman parte de este export.
- Memorias internas y scripts de setup del sandbox no están expuestos vía la API pública.
- Si requieres un respaldo exhaustivo de la infraestructura interna de Jules antes de su apagado, debes solicitar el export oficial interno.
`;
        zip.addFile(`${rootDir}/README.md`, readmeContent);

        // 5. Build ZIP Blob and Trigger Download
        updateProgress('Generando archivo ZIP...');
        const blob = zip.buildBlob();
        const blobUrl = URL.createObjectURL(blob);

        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = blobUrl;
        downloadAnchor.download = `${rootDir}.zip`;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);

        setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
        }, 10000);

        if (typeof alert !== 'undefined') {
            alert(
                `✅ Exportación completada con éxito.\n\n` +
                `📦 Resumen del respaldo:\n` +
                `- Fuentes conectadas: ${sources.length}\n` +
                `- Sesiones procesadas: ${processedSessions.length}\n` +
                `- Total de actividades: ${totalActivitiesCount}\n` +
                `- Patches extraídos: ${totalPatchesCount}\n` +
                `- Errores parciales: ${errors.length}`
            );
        }

    } catch (err) {
        if (err.message === 'REQUEST_ABORTED' || (abortSignal && abortSignal.aborted)) {
            console.log('[JULES-EXPORT] Exportación cancelada por el usuario.');
            if (typeof alert !== 'undefined') alert('🚫 Exportación cancelada. Se ha descartado la descarga.');
        } else {
            console.error('[JULES-EXPORT] Error crítico durante la exportación:', err);
            if (typeof alert !== 'undefined') alert(`⚠️ Error en la exportación: ${err.message}`);
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
        ZipStoreWriter,
        extractPatchesRecursive,
        generateSummaryMd,
        generateSessionsCsv,
        fetchWithRetry,
        mapConcurrent,
        triggerJulesExport
    };
}
