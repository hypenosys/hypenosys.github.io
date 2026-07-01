/**
 * HYPENOSYS DOCS INDEX
 * Manages IndexedDB persistence, search indexing, and SHA-based invalidation.
 */
window.DocsIndex = (function() {
    const DB_NAME = 'HypenosysDocsDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'docs_index';
    const META_STORE = 'docs_meta';

    let db = null;

    /**
     * Open Database
     */
    async function openDB() {
        if (db) return db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'path' });
                }
                if (!database.objectStoreNames.contains(META_STORE)) {
                    database.createObjectStore(META_STORE, { keyPath: 'id' });
                }
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Check if index is valid for a given SHA
     */
    async function isIndexValid(currentSha) {
        try {
            await openDB();
            return new Promise((resolve) => {
                const tx = db.transaction(META_STORE, 'readonly');
                const store = tx.objectStore(META_STORE);
                const request = store.get('last_sha');
                request.onsuccess = () => {
                    const result = request.result;
                    resolve(result && result.value === currentSha);
                };
                request.onerror = () => resolve(false);
            });
        } catch (e) {
            return false;
        }
    }

    /**
     * Save SHA to metadata
     */
    async function saveSha(sha) {
        await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(META_STORE, 'readwrite');
            const store = tx.objectStore(META_STORE);
            const request = store.put({ id: 'last_sha', value: sha, timestamp: Date.now() });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear Index
     */
    async function clearIndex() {
        await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite');
            tx.objectStore(STORE_NAME).clear();
            tx.objectStore(META_STORE).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Index a single document
     */
    async function indexDoc(doc) {
        await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(doc);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Bulk Indexing
     */
    async function bulkIndex(docs) {
        await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            docs.forEach(doc => store.put(doc));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Get all indexed documents
     */
    async function getAllDocs() {
        await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Search documents
     */
    async function search(query, limit = 10) {
        const docs = await getAllDocs();
        if (!query) return docs.slice(0, limit);

        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

        const results = docs.map(doc => {
            let score = 0;
            const content = (doc.content || '').toLowerCase();
            const title = (doc.title || doc.path.split('/').pop() || '').toLowerCase();
            const path = doc.path.toLowerCase();
            const tags = (doc.tags || []).join(' ').toLowerCase();

            terms.forEach(term => {
                if (title.includes(term)) score += 10;
                if (path.includes(term)) score += 5;
                if (tags.includes(term)) score += 8;
                if (content.includes(term)) {
                    const occurrences = content.split(term).length - 1;
                    score += Math.min(occurrences, 5);
                }
            });

            return { ...doc, score };
        });

        return results
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Rebuild Index (Main entry point)
     */
    async function rebuildIndex(onProgress) {
        try {
            const currentSha = await window.HypenosysDocsClient.getLatestCommitSha();
            const isValid = await isIndexValid(currentSha);

            if (isValid) {
                console.log('[DocsIndex] Cache is valid. Skipping rebuild.');
                return await getAllDocs();
            }

            console.log('[DocsIndex] Rebuilding index for SHA:', currentSha);
            if (onProgress) onProgress('Fetching tree...');

            const tree = await window.HypenosysDocsClient.fetchFullTree();
            const mdFiles = tree.filter(f => f.path.endsWith('.md') && f.type === 'blob');

            await clearIndex();

            const total = mdFiles.length;
            const batchSize = 5; // To avoid rate limit / concurrency issues
            let processed = 0;

            for (let i = 0; i < mdFiles.length; i += batchSize) {
                const batch = mdFiles.slice(i, i + batchSize);
                const indexedBatch = await Promise.all(batch.map(async (file) => {
                    try {
                        const content = await window.HypenosysDocsClient.fetchRawFile(file.path);
                        const doc = {
                            path: file.path,
                            sha: file.sha,
                            content: content,
                            title: file.path.split('/').pop().replace('.md', ''),
                            tags: extractTags(content),
                            headings: extractHeadings(content),
                            indexed_at: Date.now()
                        };
                        processed++;
                        if (onProgress) onProgress(`Indexing ${processed}/${total}...`);
                        return doc;
                    } catch (e) {
                        console.warn(`Failed to index ${file.path}:`, e);
                        return null;
                    }
                }));

                await bulkIndex(indexedBatch.filter(Boolean));
                // Small delay to be polite to the API
                await new Promise(r => setTimeout(r, 100));
            }

            await saveSha(currentSha);
            return await getAllDocs();
        } catch (error) {
            console.error('[DocsIndex] Rebuild failed:', error);
            throw error;
        }
    }

    function extractTags(md) {
        const tags = new Set();
        // Extract from frontmatter logic simplified for indexing
        const fmRule = /^---\n([\s\S]*?)\n---/;
        const fmMatch = fmRule.exec(md);
        if (fmMatch) {
            const yaml = fmMatch[1];
            yaml.split('\n').forEach(line => {
                if (line.startsWith('tags:')) {
                    const tagPart = line.replace('tags:', '').trim();
                    tagPart.split(/[\s,\[\]]+/).filter(Boolean).forEach(t => tags.add(t.replace('#', '')));
                }
            });
        }
        // Inline tags #tag
        const inlineTags = md.match(/#([\w/]+)/g);
        if (inlineTags) {
            inlineTags.forEach(t => tags.add(t.substring(1)));
        }
        return Array.from(tags);
    }

    function extractHeadings(md) {
        const headings = [];
        const lines = md.split('\n');
        lines.forEach(line => {
            const match = line.match(/^(#{1,6})\s+(.*)$/);
            if (match) {
                headings.push({
                    level: match[1].length,
                    text: match[2].trim()
                });
            }
        });
        return headings;
    }

    return {
        rebuildIndex,
        search,
        getAllDocs,
        clearIndex
    };
})();
