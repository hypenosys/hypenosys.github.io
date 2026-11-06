/* HYPENOSYS — disposable Dashboard cache, never authoritative user data. */
(function (root) {
    'use strict';

    const CATEGORIES = ['tasks', 'archive', 'stats', 'budget', 'profiles'];
    // Avoid retaining several multi-megabyte task snapshots in the browser's
    // small shared localStorage quota. GitHub remains the source of truth.
    const MAX_SNAPSHOT_CHARS = 500000;

    function isDashboardCacheKey(key) {
        return /^hy_cache_(tasks|archive|stats|budget|profiles)_.+$/.test(String(key || ''));
    }

    function isQuotaError(error) {
        return Boolean(error && (
            error.name === 'QuotaExceededError' ||
            error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            error.code === 22 || error.code === 1014 ||
            /quota (?:has been )?exceeded|quota.*reached/i.test(String(error.message || ''))
        ));
    }

    function removeDerivedCaches(storage, predicate) {
        const keys = [];
        try {
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (isDashboardCacheKey(key) && predicate(key)) keys.push(key);
            }
            for (const key of keys) storage.removeItem(key);
        } catch (error) {
            console.warn('[DASHBOARD] Could not prune disposable cache:', error);
        }
        return keys.length;
    }

    function persist(workspace, values, providedStorage) {
        let storage;
        try { storage = providedStorage || root.localStorage; }
        catch (error) { return { saved: 0, evicted: 0, limited: true }; }
        if (!storage) return { saved: 0, evicted: 0, limited: true };

        let saved = 0;
        let evicted = 0;
        let limited = false;
        let retriedAfterQuota = false;
        const workspaceKeys = new Set(CATEGORIES.map(name => 'hy_cache_' + name + '_' + workspace));

        for (const name of CATEGORIES) {
            if (!Object.prototype.hasOwnProperty.call(values, name)) continue;
            const key = 'hy_cache_' + name + '_' + workspace;
            let serialized;
            try { serialized = JSON.stringify(values[name]); }
            catch (error) {
                limited = true;
                console.warn('[DASHBOARD] Could not serialize disposable cache:', name, error);
                continue;
            }

            if (typeof serialized !== 'string' || serialized.length > MAX_SNAPSHOT_CHARS) {
                limited = true;
                continue;
            }

            try {
                storage.setItem(key, serialized);
                saved++;
            } catch (error) {
                if (isQuotaError(error) && !retriedAfterQuota) {
                    retriedAfterQuota = true;
                    // Only remove reproducible Dashboard snapshots, NEVER
                    // chats, GitHub tokens, personal workspace data or drafts.
                    evicted += removeDerivedCaches(storage, candidate =>
                        !workspaceKeys.has(candidate));
                    try {
                        storage.setItem(key, serialized);
                        saved++;
                        continue;
                    } catch (retryError) {
                        error = retryError;
                    }
                }
                limited = true;
                console.warn('[DASHBOARD] Cache unavailable, remote data remains usable:', name, error);
            }
        }

        if (limited) {
            // Never restore a mixed-generation cache on the next page load.
            evicted += removeDerivedCaches(storage, key => workspaceKeys.has(key));
        }
        return { saved, evicted, limited };
    }

    root.HypenosysDashboardCache = Object.freeze({
        persist, isQuotaError, isDashboardCacheKey
    });
})(typeof window !== 'undefined' ? window : globalThis);
