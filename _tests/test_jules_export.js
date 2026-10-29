/**
 * Unit & Integration Tests for Jules Export Module
 * Executable via: node _tests/test_jules_export.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Load real module assets/javascript/jules-export.js
const julesExport = require('../assets/javascript/jules-export.js');
const {
    crc32,
    ZipStoreWriter,
    getDosDateTime,
    sanitizePathSegment,
    extractPatchesRecursive,
    generateSummaryMd,
    generateSessionsCsv,
    fetchWithRetry,
    mapConcurrent
} = julesExport;

console.log('🧪 Iniciando suite de tests para Jules Export...');

async function runTests() {
    // ─── TEST 1: CRC32 String Validation ───
    console.log('\n[1/5] Probando cálculo CRC32...');
    const testStr = "123456789";
    const computedCrc = crc32(testStr);
    const expectedCrc = 0xCBF43926; // 3419484838
    console.log(`  Calculado: 0x${computedCrc.toString(16).toUpperCase()} (${computedCrc})`);
    console.log(`  Esperado:  0x${expectedCrc.toString(16).toUpperCase()} (${expectedCrc})`);
    assert.strictEqual(computedCrc, expectedCrc, 'CRC32 de "123456789" debe ser 0xCBF43926');
    console.log('  ✓ CRC32 validado con éxito.');

    // ─── TEST 2: ZipStoreWriter & /tmp/test.zip Generation ───
    console.log('\n[2/5] Probando escritor ZIP y escritura en /tmp/test.zip...');
    const zip = new ZipStoreWriter();

    // Entry 1: UTF-8 name with accents
    zip.addFile('jules-export-2026-10-29/sesión_español.txt', '¡Hola Mundo! Exportación completa con acentos y caracteres UTF-8.');
    // Entry 2: Empty entry
    zip.addFile('jules-export-2026-10-29/empty.txt', '');
    // Entry 3: Normal entry
    zip.addFile('jules-export-2026-10-29/data.json', JSON.stringify({ test: true, count: 42 }, null, 2));

    const blob = zip.buildBlob();
    assert.ok(blob, 'buildBlob debe retornar un objeto Blob');

    const arrayBuffer = await blob.arrayBuffer();
    const finalBuffer = Buffer.from(arrayBuffer);

    const zipPath = '/tmp/test.zip';
    fs.writeFileSync(zipPath, finalBuffer);
    console.log(`  ✓ ZIP escrito en ${zipPath} (${finalBuffer.length} bytes).`);
    assert.ok(fs.existsSync(zipPath), 'El archivo /tmp/test.zip debe existir.');
    assert.ok(finalBuffer.length > 100, 'El archivo ZIP debe contener bytes significativos.');

    // ─── TEST 3: Recursive Patch Extraction ───
    console.log('\n[3/5] Probando extracción recursiva de patches...');

    // Case A: Nested inside changeSet object
    const act1 = {
        name: 'activities/act_101',
        changeSet: {
            gitPatch: 'diff --git a/main.js b/main.js\n--- a/main.js\n+++ b/main.js\n@@ -1,2 +1,3 @@\n+console.log("hello");'
        }
    };
    const patches1 = extractPatchesRecursive(act1, 1, 'act_101');
    assert.strictEqual(patches1.length, 1, 'Debe extraer 1 patch de act1');
    assert.strictEqual(patches1[0].name, 'patch-1-act_101.diff');

    // Case B: Nested in array of objects inside activity
    const act2 = {
        name: 'activities/act_102',
        artifacts: [
            { id: 1, type: 'note' },
            { id: 2, unidiff: '--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-a\n+b' }
        ]
    };
    const patches2 = extractPatchesRecursive(act2, 2, 'act_102');
    assert.strictEqual(patches2.length, 1, 'Debe extraer 1 patch de act2');

    // Case C: Deeply nested diff string
    const act3 = {
        name: 'activities/act_103',
        data: {
            deep: {
                level: {
                    diffText: '@@ -10,5 +10,6 @@\n-old line\n+new line'
                }
            }
        }
    };
    const patches3 = extractPatchesRecursive(act3, 3, 'act_103');
    assert.strictEqual(patches3.length, 1, 'Debe extraer 1 patch de act3');

    // Case D: Missing fields or null object (defensive)
    const emptyPatches = extractPatchesRecursive(null, 4, 'act_104');
    assert.deepStrictEqual(emptyPatches, [], 'Objeto nulo debe devolver [] sin lanzar excepción.');

    const noDiffObj = { name: 'activities/act_105', text: 'Simples comentarios sin patches' };
    const noDiffPatches = extractPatchesRecursive(noDiffObj, 5, 'act_105');
    assert.deepStrictEqual(noDiffPatches, [], 'Objeto sin diffs debe devolver []');

    console.log('  ✓ Extracción de patches en 3 niveles de anidación + tolerancias defensivas validada.');

    // ─── TEST 4: Pagination Loop, 429 Retries & Error Resilience ───
    console.log('\n[4/5] Probando bucle de paginación, reintentos 429 y resiliencia ante errores...');

    // Mock fetch implementation
    let attempt429Count = 0;
    const mockCallFn = async (method, endpoint) => {
        // Page 1 of sessions
        if (endpoint === '/sessions?pageSize=100') {
            return {
                sessions: [{ name: 'sessions/s1' }, { name: 'sessions/s2' }],
                nextPageToken: 'token_p2'
            };
        }
        // Page 2 of sessions
        if (endpoint === '/sessions?pageSize=100&pageToken=token_p2') {
            return {
                sessions: [{ name: 'sessions/s3' }],
                nextPageToken: 'token_p3'
            };
        }
        // Page 3 of sessions
        if (endpoint === '/sessions?pageSize=100&pageToken=token_p3') {
            return {
                sessions: [{ name: 'sessions/s4' }],
                nextPageToken: null
            };
        }

        // Endpoint for testing 429 retry
        if (endpoint === '/sessions/s1/activities?pageSize=100') {
            attempt429Count++;
            if (attempt429Count === 1) {
                const err = new Error('RATE_LIMIT');
                err.httpStatus = 429;
                err.retryAfterMs = 50; // fast retry for test
                throw err;
            }
            return { activities: [{ originator: 'user', text: 'Hola' }], nextPageToken: null };
        }

        // Endpoint for permanent failure
        if (endpoint === '/sessions/s2/activities?pageSize=100') {
            const err = new Error('SERVER_ERROR');
            err.httpStatus = 500;
            throw err;
        }

        return {};
    };

    // Test Pagination across 3 pages
    let allSessions = [];
    let pageToken = null;
    do {
        const url = `/sessions?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const res = await fetchWithRetry(url, { callFn: mockCallFn });
        allSessions = allSessions.concat(res.sessions || []);
        pageToken = res.nextPageToken || null;
    } while (pageToken);

    assert.strictEqual(allSessions.length, 4, 'Paginación de 3 páginas debe acumular 4 sesiones en total.');
    console.log('  ✓ Paginación de 3 páginas completada con éxito (4 sesiones).');

    // Test 429 Retry Recovery
    const s1Act = await fetchWithRetry('/sessions/s1/activities?pageSize=100', { callFn: mockCallFn });
    assert.strictEqual(attempt429Count, 2, 'El endpoint 429 debió reintentarse 1 vez.');
    assert.strictEqual(s1Act.activities.length, 1, 'Actividad obtenida tras la recuperación del 429.');
    console.log('  ✓ Reintento ante HTTP 429 validado correctamente con recuperación exitosa.');

    // Test Permanent Error Handling (Non-abort)
    let s2Failed = false;
    try {
        await fetchWithRetry('/sessions/s2/activities?pageSize=100', { callFn: mockCallFn });
    } catch (e) {
        s2Failed = true;
        assert.strictEqual(e.httpStatus, 500, 'Error permanente debe propagar status 500');
    }
    assert.ok(s2Failed, 'La sesión s2 falló como se esperaba sin detener la ejecución de otras partes.');
    console.log('  ✓ Fallo permanente en sesión capturado individualmente sin abortar.');

    // ─── TEST 5: CSV and Summary Generators ───
    console.log('\n[5/5] Probando generadores de CSV y Summary Markdown...');
    const mockSession = {
        name: 'sessions/s100',
        title: 'Fix Bug in Dashboard',
        state: 'COMPLETED',
        createTime: '2026-10-29T10:00:00Z',
        updateTime: '2026-10-29T10:30:00Z',
        prompt: 'Por favor arregla el bug X',
        sourceContext: {
            source: 'sources/github/hypenosys/web',
            pullRequest: { url: 'https://github.com/hypenosys/web/pull/12' }
        }
    };
    const mockActivities = [
        { originator: 'user', text: 'Prompt inicial' },
        { originator: 'agent', text: 'Ejecutando parche' }
    ];

    const md = generateSummaryMd(mockSession, mockActivities, 1);
    assert.ok(md.includes('# Resumen de Sesión: Fix Bug in Dashboard'), 'MD debe contener el título');
    assert.ok(md.includes('https://github.com/hypenosys/web/pull/12'), 'MD debe incluir URL de PR');

    const csvItem = {
        id: 's100',
        title: mockSession.title,
        repo: 'sources/github/hypenosys/web',
        state: 'COMPLETED',
        createTime: mockSession.createTime,
        updateTime: mockSession.updateTime,
        prUrl: 'https://github.com/hypenosys/web/pull/12',
        activityCount: 2,
        patchCount: 1
    };
    const csv = generateSessionsCsv([csvItem]);
    assert.ok(csv.includes('"s100"'), 'CSV debe contener ID escapado');
    assert.ok(csv.includes('"Fix Bug in Dashboard"'), 'CSV debe contener título');

    console.log('  ✓ Generadores de summary.md y sessions-index.csv validados.');

    console.log('\n✅ ¡Todos los tests de Node completados con éxito!');
}

runTests().catch(err => {
    console.error('❌ Test fallido:', err);
    process.exit(1);
});
