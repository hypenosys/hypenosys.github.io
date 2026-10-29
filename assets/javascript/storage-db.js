/**
 * Hypenosys AI Storage DB
 * Robust IndexedDB wrapper for persisting AI generations (images & audio)
 */
window.aiStorage = (function() {
    const DB_NAME = 'HypenosysAI';
    const DB_VERSION = 2;
    let db = null;

    function openDB() {
        return new Promise((resolve, reject) => {
            if (db) return resolve(db);

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const dbInstance = event.target.result;
                if (!dbInstance.objectStoreNames.contains('image_history')) {
                    dbInstance.createObjectStore('image_history', { keyPath: 'id', autoIncrement: true });
                }
                if (!dbInstance.objectStoreNames.contains('music_history')) {
                    dbInstance.createObjectStore('music_history', { keyPath: 'id', autoIncrement: true });
                }
                if (!dbInstance.objectStoreNames.contains('rag_file_chunks')) {
                    const store = dbInstance.createObjectStore('rag_file_chunks', { keyPath: 'id' });
                    store.createIndex('sessionId', 'sessionId', { unique: false });
                    store.createIndex('fileId', 'fileId', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async function saveGeneration(storeName, data) {
        const dbInstance = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = dbInstance.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add({
                ...data,
                timestamp: data.timestamp || Date.now()
            });

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function getPagedGenerations(storeName, page = 0, pageSize = 10) {
        const dbInstance = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = dbInstance.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const results = [];
            let skipped = 0;
            const skipCount = page * pageSize;

            // We use a cursor to iterate backwards (newest first)
            const request = store.openCursor(null, 'prev');

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (!cursor) {
                    resolve(results);
                    return;
                }

                if (skipped < skipCount) {
                    skipped++;
                    cursor.continue();
                    return;
                }

                if (results.length < pageSize) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    async function getTotalCount(storeName) {
        const dbInstance = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = dbInstance.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function clearStore(storeName) {
        const dbInstance = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = dbInstance.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteItem(storeName, id) {
        const dbInstance = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = dbInstance.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function saveRagChunks(chunks) {
        const dbInstance = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = dbInstance.transaction(['rag_file_chunks'], 'readwrite');
            const store = transaction.objectStore('rag_file_chunks');
            chunks.forEach(chunk => {
                store.put(chunk);
            });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function getRagChunksBySession(sessionId) {
        const dbInstance = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = dbInstance.transaction(['rag_file_chunks'], 'readonly');
            const store = transaction.objectStore('rag_file_chunks');
            const index = store.index('sessionId');
            const request = index.getAll(sessionId);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteRagChunksBySession(sessionId) {
        const dbInstance = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = dbInstance.transaction(['rag_file_chunks'], 'readwrite');
            const store = transaction.objectStore('rag_file_chunks');
            const index = store.index('sessionId');
            const request = index.openKeyCursor(IDBKeyRange.only(sessionId));
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    cursor.continue();
                }
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function deleteRagChunksByFile(sessionId, fileId) {
        const dbInstance = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = dbInstance.transaction(['rag_file_chunks'], 'readwrite');
            const store = transaction.objectStore('rag_file_chunks');
            const index = store.index('fileId');
            const request = index.openCursor(IDBKeyRange.only(fileId));
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (cursor.value.sessionId === sessionId) {
                        store.delete(cursor.primaryKey);
                    }
                    cursor.continue();
                }
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    return {
        saveImage: (data) => saveGeneration('image_history', data),
        getImages: (page, pageSize) => getPagedGenerations('image_history', page, pageSize),
        getImageCount: () => getTotalCount('image_history'),
        clearImages: () => clearStore('image_history'),

        saveMusic: (data) => saveGeneration('music_history', data),
        getMusic: (page, pageSize) => getPagedGenerations('music_history', page, pageSize),
        getMusicCount: () => getTotalCount('music_history'),
        clearMusic: () => clearStore('music_history'),

        saveRagChunks,
        getRagChunksBySession,
        deleteRagChunksBySession,
        deleteRagChunksByFile,

        deleteItem
    };
})();
