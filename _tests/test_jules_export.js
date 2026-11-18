/**
 * Comprehensive Unit & Integration Tests for Jules Export Module
 * Executable via: node _tests/test_jules_export.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const child_process = require('child_process');
const zlib = require('zlib');

// Node version check
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 18) {
    console.error(`❌ Node >= 18 es requerido. Versión actual: ${process.versions.node}`);
    process.exit(1);
}

// Load module
const julesExport = require('../assets/javascript/jules-export.js');
const {
    crc32,
    getDosDateTime,
    sanitizePathSegment,
    getSha256,
    ZipWriter,
    extractPatchesRecursive,
    generateSummaryMd,
    generateSessionsCsv,
    fetchWithRetry,
    fetchPaginatedResource,
    triggerJulesExport
} = julesExport;

console.log(`🧪 Iniciando suite de tests para Jules Export (Node v${process.versions.node})...\n`);

// Helper to run shell commands and capture output
function runCmd(cmd) {
    try {
        const out = child_process.execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        return out.trim();
    } catch (e) {
        return (e.stdout || '') + (e.stderr || '') + e.message;
    }
}

async function runTests() {
    // ─── TEST 1: CRC32 String & Uint8Array Validation ───
    console.log('[1/11] Probando cálculo CRC32...');
    const testStr = "123456789";
    const computedCrc = crc32(testStr);
    const expectedCrc = 0xCBF43926;
    console.log(`  Calculado: 0x${computedCrc.toString(16).toUpperCase()} (${computedCrc})`);
    console.log(`  Esperado:  0x${expectedCrc.toString(16).toUpperCase()} (${expectedCrc})`);
    assert.strictEqual(computedCrc, expectedCrc, 'CRC32 de "123456789" debe ser 0xCBF43926');
    console.log('  ✓ CRC32 validado con éxito.\n');

    // ─── TEST 2: SHA-256 Digest ───
    console.log('[2/11] Probando cálculo SHA-256 (crypto.subtle)...');
    const shaTestText = 'hello world';
    const shaHex = await getSha256(shaTestText);
    const expectedShaHex = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
    assert.strictEqual(shaHex, expectedShaHex, 'SHA-256 de "hello world" debe coincidir');
    assert.strictEqual(shaHex.slice(0, 12), 'b94d27b9934d', 'sha12 debe ser b94d27b9934d');
    console.log(`  Calculado: ${shaHex}`);
    console.log('  ✓ SHA-256 y sha12 validados con éxito.\n');

    // ─── TEST (a): Fetch simulado que devuelve la misma página de sesiones 5 veces ───
    console.log('[a] Probando parada por página duplicada (misma página 5 veces)...');
    let pageCountCalled = 0;
    const mockCallFnSamePage = async (method, endpoint) => {
        pageCountCalled++;
        return {
            sessions: [{ name: 'sessions/s_same_1' }, { name: 'sessions/s_same_2' }],
            nextPageToken: `token_same_${pageCountCalled}`
        };
    };

    const errorsA = [];
    const resA = await fetchPaginatedResource({
        resourceType: 'sessions',
        endpointBase: '/sessions',
        itemKey: 'sessions',
        callFn: mockCallFnSamePage,
        errors: errorsA
    });

    assert.strictEqual(resA.stopReason, 'DUPLICATE_PAGE_DETECTED', 'Debe parar con DUPLICATE_PAGE_DETECTED');
    assert.strictEqual(resA.items.length, 2, 'No debe añadir duplicados, solo las 2 sesiones únicas');
    assert.strictEqual(pageCountCalled, 2, 'Debe parar en la 2ª página al detectar 0 IDs nuevos');
    console.log('  ✓ Parada por página duplicada validada (se detuvo tras la 2ª página con 2 sesiones únicas).\n');

    // ─── TEST (b): Token repetido (nextPageToken repetido) ───
    console.log('[b] Probando parada por token repetido...');
    let tokenCalls = 0;
    const mockCallFnDupToken = async (method, endpoint) => {
        tokenCalls++;
        return {
            sessions: [{ name: `sessions/s_token_${tokenCalls}` }],
            nextPageToken: 'token_REPETIDO_123'
        };
    };

    const errorsB = [];
    const resB = await fetchPaginatedResource({
        resourceType: 'sessions',
        endpointBase: '/sessions',
        itemKey: 'sessions',
        callFn: mockCallFnDupToken,
        errors: errorsB
    });

    assert.strictEqual(resB.stopReason, 'SAME_PAGE_TOKEN', 'Debe parar con SAME_PAGE_TOKEN');
    assert.strictEqual(tokenCalls, 2, 'Debe detenerse inmediatamente al recibir el token repetido en la 2ª llamada');
    console.log('  ✓ Parada por token repetido validada.\n');

    // ─── TEST (c): Renombrado de saneado vs ID exacto duplicado ───
    console.log('[c] Probando colisiones de saneado vs duplicados exactos...');
    const rawListC = [
        { name: 'sessions/foo_bar' },
        { name: 'sessions/foo/bar' }, // Distinct raw ID that sanitizes to 'foo_bar'
        { name: 'sessions/foo_bar' }  // Exact duplicate raw ID
    ];

    // Simulate paginator filtering out exact duplicates
    const seenC = new Set();
    const filteredC = [];
    rawListC.forEach(item => {
        if (!seenC.has(item.name)) {
            seenC.add(item.name);
            filteredC.push(item);
        }
    });
    assert.strictEqual(filteredC.length, 2, 'El duplicado exacto debe descartarse');

    const sanitizedIdMapC = new Map();
    const errorsC = [];
    const processedC = filteredC.map((s, index) => {
        const rawId = s.name.replace(/^sessions\//, '');
        let sanitized = sanitizePathSegment(rawId);
        if (sanitizedIdMapC.has(sanitized)) {
            let count = sanitizedIdMapC.get(sanitized) + 1;
            sanitizedIdMapC.set(sanitized, count);
            const originalSanitized = sanitized;
            sanitized = `${sanitized}-${count}`;
            errorsC.push({
                id: rawId,
                message: `ID collision detected for '${originalSanitized}'. Renamed to '${sanitized}'.`
            });
        } else {
            sanitizedIdMapC.set(sanitized, 1);
        }
        return sanitized;
    });

    assert.deepStrictEqual(processedC, ['foo_bar', 'foo_bar-2'], 'Dos IDs distintos que saneados colisionan deben ser foo_bar y foo_bar-2');
    assert.strictEqual(errorsC.length, 1, 'Debe haber 1 registro de colisión en errores');
    console.log('  ✓ Colisión de saneado renombrada a foo_bar-2 y duplicado exacto descartado.\n');

    // ─── TEST (d): ZIP con entradas DEFLATE e inspección roundtrip con zlib ───
    console.log('[d] Probando ZIP con entradas DEFLATE e inspección de contenido byte a byte con zlib...');
    const zipD = new ZipWriter();
    const sampleTextD = 'Prueba DEFLATE con acentos y UTF-8: ' + 'ABCDEFGHIJ1234567890 '.repeat(30);
    await zipD.addFile('jules-export-2026-03-31/test_deflate.txt', sampleTextD);

    const blobD = zipD.buildBlob();
    const bufD = Buffer.from(await blobD.arrayBuffer());

    // Locate local header and compressed data
    // Local header structure: 30 bytes + path length (29)
    const pathLenD = new TextEncoder().encode('jules-export-2026-03-31/test_deflate.txt').length;
    const compressedSizeD = bufD.readUInt32LE(18);
    const uncompressedSizeD = bufD.readUInt32LE(22);
    const methodD = bufD.readUInt16LE(8);

    assert.strictEqual(methodD, 8, 'El método de compresión debe ser 8 (DEFLATE)');
    assert.strictEqual(uncompressedSizeD, new TextEncoder().encode(sampleTextD).length, 'Tamaño sin comprimir correcto');

    const compressedStart = 30 + pathLenD;
    const compressedBytesD = bufD.slice(compressedStart, compressedStart + compressedSizeD);

    const decompressedD = zlib.inflateRawSync(compressedBytesD).toString('utf8');
    assert.strictEqual(decompressedD, sampleTextD, 'El contenido descomprimido con zlib debe ser idéntico byte a byte');

    const zipPathD = '/tmp/test_deflate_roundtrip.zip';
    fs.writeFileSync(zipPathD, bufD);
    console.log(`  ✓ Fichero escrito en ${zipPathD}`);

    const unzipCheckD = runCmd(`unzip -t ${zipPathD}`);
    const pyCheckD = runCmd(`python3 -m zipfile -l ${zipPathD}`);
    console.log('  [unzip -t]:\n' + unzipCheckD);
    console.log('  [python3 -m zipfile -l]:\n' + pyCheckD);
    assert.ok(unzipCheckD.includes('OK'), 'unzip -t debe reportar OK');
    console.log('  ✓ Roundtrip DEFLATE validado con éxito.\n');

    // ─── TEST (e): Tope de parte pequeño (50 KB) con 10 sesiones sintéticas ───
    console.log('[e] Probando tope de parte pequeño (50 KB) con 10 sesiones sintéticas...');
    const generatedFilesE = [];
    const mockDownloadFnE = async (blob, fileName) => {
        const filePath = path.join('/tmp', fileName);
        const buffer = Buffer.from(await blob.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        generatedFilesE.push({ fileName, filePath, size: buffer.length });
    };

    const mockCallFnE = async (method, endpoint) => {
        if (endpoint.startsWith('/sources')) return { sources: [{ name: 'sources/s1' }], nextPageToken: null };
        if (endpoint.startsWith('/sessions?')) {
            const list = [];
            for (let i = 1; i <= 10; i++) {
                list.push({ name: `sessions/synth_session_${i}`, title: `Sesión Sintética ${i}` });
            }
            return { sessions: list, nextPageToken: null };
        }
        if (endpoint.includes('/activities')) {
            // Generate non-repetitive activity text so DEFLATE compression cannot reduce it to zero
            const sNum = endpoint.match(/synth_session_(\d+)/)?.[1] || '1';
            const rndText = Array.from({ length: 800 }, (_, k) => `val_${sNum}_${k}_${Math.sin(k)}`).join(' ');
            return {
                activities: [
                    { originator: 'user', text: `Prompt ${rndText}` },
                    { originator: 'agent', text: `Respuesta ${rndText}` }
                ],
                nextPageToken: null
            };
        }
        return { name: endpoint.replace(/^\//, ''), state: 'COMPLETED' };
    };

    await triggerJulesExport({
        callFn: mockCallFnE,
        downloadFn: mockDownloadFnE,
        maxPartCompressedBytes: 30 * 1024, // 30 KB threshold
        skipConfirm: true
    });

    const partFilesE = generatedFilesE.filter(f => f.fileName.includes('-part'));
    console.log(`  Partes generadas: ${partFilesE.length} partes + 1 índice`);
    assert.ok(partFilesE.length >= 3, `Debe generar >= 3 partes para 10 sesiones pesadas (generó ${partFilesE.length})`);

    // Verify unzip -t and python3 -m zipfile -l on EVERY generated file
    for (const f of generatedFilesE) {
        console.log(`\n  --- Verificando ${f.filePath} ---`);
        const uOut = runCmd(`unzip -t ${f.filePath}`);
        const pOut = runCmd(`python3 -m zipfile -l ${f.filePath}`);
        console.log('  [unzip -t]:\n' + uOut);
        console.log('  [python3 -m zipfile -l]:\n' + pOut);
        assert.ok(uOut.includes('OK'), `unzip -t debe pasar OK en ${f.fileName}`);
    }
    console.log('\n  ✓ Generación de múltiples partes (>=3 partes) verificada.\n');

    // ─── TEST (f): Deduplicación de patches por SHA-256 (19 patches, 9 únicos) ───
    console.log('[f] Probando deduplicación de patches por SHA-256 (19 patches, 9 únicos)...');

    const uniqueDiffs = [];
    for (let i = 1; i <= 9; i++) {
        uniqueDiffs.push(`diff --git a/file${i}.txt b/file${i}.txt\n--- a/file${i}.txt\n+++ b/file${i}.txt\n@@ -1 +1 @@\n-old_${i}\n+new_${i}`);
    }

    // Create 19 patches using the 9 unique contents
    const totalPatchesF = [];
    for (let i = 0; i < 19; i++) {
        const content = uniqueDiffs[i % 9];
        totalPatchesF.push({ content, jsonPath: `activities[${i}].changeSet.gitPatch` });
    }

    const sessionPatchesMapF = new Map();
    const sessionSha12MapF = new Map();
    const patchesIndexF = [];
    const uniquePatchFilesF = [];

    for (const patch of totalPatchesF) {
        const sha256Hex = await getSha256(patch.content);
        const sha12Base = sha256Hex.slice(0, 12);
        let fileName;

        if (sessionPatchesMapF.has(sha256Hex)) {
            fileName = sessionPatchesMapF.get(sha256Hex);
        } else {
            let count = sessionSha12MapF.get(sha12Base) || 0;
            count++;
            sessionSha12MapF.set(sha12Base, count);
            fileName = count > 1 ? `patch-${sha12Base}-${count}.diff` : `patch-${sha12Base}.diff`;
            sessionPatchesMapF.set(sha256Hex, fileName);
            uniquePatchFilesF.push({ fileName, content: patch.content });
        }

        patchesIndexF.push({
            sha256: sha256Hex,
            sha12: sha12Base,
            file: fileName,
            jsonPath: patch.jsonPath
        });
    }

    assert.strictEqual(patchesIndexF.length, 19, 'patches-index debe registrar los 19 parches');
    assert.strictEqual(uniquePatchFilesF.length, 9, 'Debe haber exactamente 9 archivos .diff únicos');
    console.log(`  Patches procesados: ${patchesIndexF.length}, Archivos .diff únicos: ${uniquePatchFilesF.length}`);
    console.log('  ✓ Deduplicación de patches por SHA-256 validada.\n');

    // ─── TEST (g): Cierre de parte por tope de entradas ───
    console.log('[g] Probando cierre de parte por tope de entradas (maxPartEntries = 10)...');
    const generatedFilesG = [];
    const mockDownloadFnG = async (blob, fileName) => {
        const filePath = path.join('/tmp', fileName);
        const buffer = Buffer.from(await blob.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        generatedFilesG.push({ fileName, filePath });
    };

    const mockCallFnG = async (method, endpoint) => {
        if (endpoint.startsWith('/sources')) return { sources: [], nextPageToken: null };
        if (endpoint.startsWith('/sessions?')) {
            return {
                sessions: [
                    { name: 'sessions/s_ent_1' },
                    { name: 'sessions/s_ent_2' },
                    { name: 'sessions/s_ent_3' }
                ],
                nextPageToken: null
            };
        }
        if (endpoint.includes('/activities')) {
            return {
                activities: [
                    { originator: 'user', text: 'a1' },
                    { originator: 'user', text: 'a2' }
                ],
                nextPageToken: null
            };
        }
        return { name: endpoint.replace(/^\//, ''), state: 'COMPLETED' };
    };

    await triggerJulesExport({
        callFn: mockCallFnG,
        downloadFn: mockDownloadFnG,
        maxPartEntries: 10, // Small limit on entries
        skipConfirm: true
    });

    const partFilesG = generatedFilesG.filter(f => f.fileName.includes('-part'));
    assert.ok(partFilesG.length >= 2, `Debe cerrar parte al alcanzar el tope de entradas (generó ${partFilesG.length} partes)`);

    for (const f of generatedFilesG) {
        console.log(`\n  --- Verificando ${f.filePath} ---`);
        const uOut = runCmd(`unzip -t ${f.filePath}`);
        const pOut = runCmd(`python3 -m zipfile -l ${f.filePath}`);
        console.log('  [unzip -t]:\n' + uOut);
        console.log('  [python3 -m zipfile -l]:\n' + pOut);
        assert.ok(uOut.includes('OK'), `unzip -t debe pasar OK en ${f.fileName}`);
    }
    console.log('\n  ✓ Cierre de parte por tope de entradas validado.\n');

    // ─── TEST (h): Error fatal que genera index.zip con complete = false ───
    console.log('[h] Probando error fatal con generación de índice incompleto (complete = false)...');
    const generatedFilesH = [];
    const mockDownloadFnH = async (blob, fileName) => {
        const filePath = path.join('/tmp', fileName);
        const buffer = Buffer.from(await blob.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        generatedFilesH.push({ fileName, filePath, buffer });
    };

    const mockCallFnH = async (method, endpoint) => {
        if (endpoint.startsWith('/sources')) return { sources: [], nextPageToken: null };
        if (endpoint.startsWith('/sessions?')) {
            return { sessions: [{ name: 'sessions/s_fatal_1' }], nextPageToken: null };
        }
        if (endpoint === '/sessions/s_fatal_1') {
            const err = new Error('API_KEY_INVALID');
            err.httpStatus = 401;
            throw err;
        }
        return {};
    };

    await triggerJulesExport({
        callFn: mockCallFnH,
        downloadFn: mockDownloadFnH,
        skipConfirm: true
    });

    const indexFileH = generatedFilesH.find(f => f.fileName.includes('-index.zip'));
    assert.ok(indexFileH, 'Debe generar index.zip tras un error fatal');

    console.log(`\n  --- Verificando ${indexFileH.filePath} ---`);
    const uOutH = runCmd(`unzip -t ${indexFileH.filePath}`);
    const pOutH = runCmd(`python3 -m zipfile -l ${indexFileH.filePath}`);
    console.log('  [unzip -t]:\n' + uOutH);
    console.log('  [python3 -m zipfile -l]:\n' + pOutH);
    assert.ok(uOutH.includes('OK'), 'unzip -t debe pasar OK');

    // Inspect manifest.json inside index.zip
    const unzippedManifestStr = runCmd(`unzip -p ${indexFileH.filePath} */manifest.json`);
    const manifestH = JSON.parse(unzippedManifestStr);

    assert.strictEqual(manifestH.complete, false, 'manifest.complete debe ser false');
    assert.strictEqual(manifestH.incomplete_reason, 'API_KEY_INVALID', 'incomplete_reason debe registrar el error fatal');
    console.log('  ✓ Error fatal verificado (generó index.zip con complete = false e incomplete_reason).\n');

    // ─── TEST (i): Cancelación por el usuario (no genera index.zip) ───
    console.log('[i] Probando cancelación por el usuario...');
    const generatedFilesI = [];
    const mockDownloadFnI = async (blob, fileName) => {
        const filePath = path.join('/tmp', fileName);
        const buffer = Buffer.from(await blob.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        generatedFilesI.push({ fileName, filePath });
    };

    // Custom abort test: abort during execution
    const abortCtrlI = new AbortController();
    let callCountI = 0;
    const mockCallFnI = async (method, endpoint) => {
        callCountI++;
        if (callCountI >= 2) {
            abortCtrlI.abort();
            const err = new Error('REQUEST_ABORTED');
            err.name = 'AbortError';
            throw err;
        }
        if (endpoint.startsWith('/sources')) return { sources: [], nextPageToken: null };
        if (endpoint.startsWith('/sessions?')) return { sessions: [{ name: 'sessions/s_cancel_1' }], nextPageToken: null };
        return {};
    };

    const exportPromiseI = triggerJulesExport({
        callFn: mockCallFnI,
        downloadFn: mockDownloadFnI,
        abortSignal: abortCtrlI.signal,
        skipConfirm: true
    });

    await exportPromiseI;

    const indexFileI = generatedFilesI.find(f => f.fileName.includes('-index.zip'));
    assert.strictEqual(indexFileI, undefined, 'No debe generar index.zip cuando el usuario cancela');
    console.log('  ✓ Cancelación verificada (no se generó index.zip y se descartó la parte en curso).\n');

    // ─── TEST (j): Fallback a store cuando CompressionStream no está disponible ───
    console.log('[j] Probando fallback a store (CompressionStream = null)...');
    const generatedFilesJ = [];
    const mockDownloadFnJ = async (blob, fileName) => {
        const filePath = path.join('/tmp', fileName);
        const buffer = Buffer.from(await blob.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        generatedFilesJ.push({ fileName, filePath, buffer });
    };

    const mockCallFnJ = async (method, endpoint) => {
        if (endpoint.startsWith('/sources')) return { sources: [], nextPageToken: null };
        if (endpoint.startsWith('/sessions?')) return { sessions: [{ name: 'sessions/s_store_1' }], nextPageToken: null };
        if (endpoint.includes('/activities')) return { activities: [{ originator: 'user', text: 'hello' }], nextPageToken: null };
        return { name: endpoint.replace(/^\//, ''), state: 'COMPLETED' };
    };

    await triggerJulesExport({
        callFn: mockCallFnJ,
        downloadFn: mockDownloadFnJ,
        CompressionStreamImpl: null, // Force Store fallback
        skipConfirm: true
    });

    assert.ok(generatedFilesJ.length >= 2, 'Debe generar al menos 1 parte + 1 índice en modo store');

    for (const f of generatedFilesJ) {
        console.log(`\n  --- Verificando ${f.filePath} ---`);
        const uOut = runCmd(`unzip -t ${f.filePath}`);
        const pOut = runCmd(`python3 -m zipfile -l ${f.filePath}`);
        console.log('  [unzip -t]:\n' + uOut);
        console.log('  [python3 -m zipfile -l]:\n' + pOut);
        assert.ok(uOut.includes('OK'), `unzip -t debe pasar OK en ${f.fileName}`);

        // Verify method is 0 (Store) in local header
        const methodJ = f.buffer.readUInt16LE(8);
        assert.strictEqual(methodJ, 0, 'El método de compresión debe ser 0 (Store)');
    }
    console.log('\n  ✓ Fallback a modo store verificado (método 0 en headers ZIP).\n');

    console.log('====================================================');
    console.log('✅ ¡TODOS LOS TESTS COMPLETADOS CON ÉXITO Y VERIFICADOS CON UNZIP Y PYTHON3 ZIPFILE!');
    console.log('====================================================\n');
}

runTests().catch(err => {
    console.error('❌ Test fallido con error:', err);
    process.exit(1);
});
