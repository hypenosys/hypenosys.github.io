import { test, expect } from '@playwright/test';

test.describe('Neural Chat Attachment Chips Tests', () => {

    test('Unit Test: formatFileSize Utility', async ({ page }) => {
        await page.goto('http://localhost:4000/pages/claude-chat.html');

        const formatted = await page.evaluate(() => {
            return {
                zero: window.NeuralChatRAG.formatFileSize(0),
                bytes: window.NeuralChatRAG.formatFileSize(512),
                kb: window.NeuralChatRAG.formatFileSize(2048),
                mb: window.NeuralChatRAG.formatFileSize(1572864)
            };
        });

        expect(formatted.zero).toBe('0 B');
        expect(formatted.bytes).toBe('512 B');
        expect(formatted.kb).toBe('2.0 KB');
        expect(formatted.mb).toBe('1.5 MB');
    });

    test('Chip Removal and IndexedDB Chunk Deletion', async ({ page }) => {
        await page.goto('http://localhost:4000/pages/claude-chat.html');

        const testResult = await page.evaluate(async () => {
            const sessionId = 'test_chip_session_' + Date.now();
            window.currentSessionId = sessionId;

            // Mock embeddings fetch
            window.NeuralChatRAG.fetchEmbeddingVector = async () => [0.1, 0.2, 0.3];
            window.getEmbeddingsConfig = () => ({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'text-embedding-3-small' });

            // Ingest file
            await window.NeuralChatRAG.ingestFile({
                sessionId: sessionId,
                fileId: 'file_test_delete',
                fileName: 'zafiro-test.txt',
                fileSize: 1024,
                fileContent: 'Contenido de prueba Zafiro RAG.'
            });

            // Verify chunks exist
            const initialChunks = await window.aiStorage.getRagChunksBySession(sessionId);
            const countBefore = initialChunks.length;

            // Render chips
            await window.renderRagFileChips(sessionId);
            const chipElementBefore = document.getElementById('rag-chip-file_test_delete');

            // Simulate X click via removeRagChip
            await window.removeRagChip('file_test_delete', 'ready');

            // Verify chunks deleted
            const remainingChunks = await window.aiStorage.getRagChunksBySession(sessionId);
            const chipElementAfter = document.getElementById('rag-chip-file_test_delete');

            return {
                countBefore,
                hadChipBefore: !!chipElementBefore,
                countAfter: remainingChunks.length,
                hasChipAfter: !!chipElementAfter
            };
        });

        expect(testResult.countBefore).toBeGreaterThan(0);
        expect(testResult.hadChipBefore).toBe(true);
        expect(testResult.countAfter).toBe(0);
        expect(testResult.hasChipAfter).toBe(false);
    });

    test('Cancellation during indexing leaves 0 chunks in IndexedDB', async ({ page }) => {
        await page.goto('http://localhost:4000/pages/claude-chat.html');

        const testResult = await page.evaluate(async () => {
            const sessionId = 'test_cancel_session_' + Date.now();
            window.currentSessionId = sessionId;

            // Mock slow fetch that checks abort signal
            window.NeuralChatRAG.fetchEmbeddingVector = async (input, isQ, signal) => {
                await new Promise((res) => setTimeout(res, 500));
                if (signal && signal.aborted) {
                    const err = new Error('Operación cancelada por el usuario.');
                    err.name = 'AbortError';
                    throw err;
                }
                return [0.1, 0.2, 0.3];
            };

            const fileId = 'file_cancel_test';
            const fileContent = 'A '.repeat(500); // multiple chunks

            // Start ingestion non-blocking
            const ingestionPromise = window.handleFileIngestionWithChip({
                sessionId,
                fileId,
                fileName: 'slow-doc.txt',
                fileSize: 2000,
                fileContent
            });

            // Wait brief moment for indexing chip to render
            await new Promise((res) => setTimeout(res, 100));

            // Cancel indexing via removeRagChip
            await window.removeRagChip(fileId, 'indexing');

            // Await ingestion completion
            await ingestionPromise;

            // Verify 0 chunks were saved
            const savedChunks = await window.aiStorage.getRagChunksBySession(sessionId);

            return {
                savedCount: savedChunks.length
            };
        });

        expect(testResult.savedCount).toBe(0);
    });

    test('Failed batch leaves chip in Error state and no chunks saved', async ({ page }) => {
        await page.goto('http://localhost:4000/pages/claude-chat.html');

        const testResult = await page.evaluate(async () => {
            const sessionId = 'test_error_session_' + Date.now();
            window.currentSessionId = sessionId;

            // Mock fetch vector that fails with 404
            window.NeuralChatRAG.fetchEmbeddingVector = async () => {
                const err = new Error('Error 404: Endpoint o modelo de embeddings no encontrado.');
                err.status = 404;
                throw err;
            };

            const fileId = 'file_fail_test';
            await window.handleFileIngestionWithChip({
                sessionId,
                fileId,
                fileName: 'failed-doc.txt',
                fileSize: 500,
                fileContent: 'Texto de prueba'
            });

            const savedChunks = await window.aiStorage.getRagChunksBySession(sessionId);
            const chipElement = document.getElementById(`rag-chip-${fileId}`);
            const isErrorChip = chipElement ? chipElement.classList.contains('error') : false;

            return {
                savedChunksCount: savedChunks.length,
                isErrorChip,
                chipTitle: chipElement ? chipElement.getAttribute('title') : null
            };
        });

        expect(testResult.savedChunksCount).toBe(0);
        expect(testResult.isErrorChip).toBe(true);
        expect(testResult.chipTitle).toContain('Error 404');
    });

    test('Chips rebuild from IndexedDB upon session reload', async ({ page }) => {
        await page.goto('http://localhost:4000/pages/claude-chat.html');

        const sessionId = 'test_rebuild_session_' + Date.now();

        // Seed IndexedDB with chunks
        await page.evaluate(async (sId) => {
            window.currentSessionId = sId;
            await window.aiStorage.saveRagChunks([{
                id: `${sId}_f1_0`,
                sessionId: sId,
                fileId: 'f1',
                fileName: 'zafiro-test.txt',
                fileSize: 1024,
                chunkIndex: 0,
                content: 'Sample',
                vector: [0.1, 0.2],
                modelId: 'text-embedding-3-small',
                createdAt: Date.now()
            }]);
            await window.renderRagFileChips(sId);
        }, sessionId);

        // Reload page
        await page.goto('http://localhost:4000/pages/claude-chat.html');

        // Set active session and render chips
        const chipFound = await page.evaluate(async (sId) => {
            window.currentSessionId = sId;
            await window.renderRagFileChips(sId);
            const chip = document.getElementById('rag-chip-f1');
            return {
                exists: !!chip,
                text: chip ? chip.textContent : ''
            };
        }, sessionId);

        expect(chipFound.exists).toBe(true);
        expect(chipFound.text).toContain('zafiro-test.txt');
    });

});
