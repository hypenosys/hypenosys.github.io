'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../assets/javascript/dashboard-cache.js'), 'utf8');

function storageFixture(capacity = Infinity) {
    const values = new Map();
    const storage = {
        get length() { return values.size; },
        key(index) { return [...values.keys()][index] || null; },
        getItem(key) { return values.get(key) ?? null; },
        removeItem(key) { values.delete(key); },
        setItem(key, value) {
            const tentative = new Map(values);
            tentative.set(key, String(value));
            const size = [...tentative].reduce((total, [k, v]) => total + k.length + v.length, 0);
            if (size > capacity) {
                const error = new Error('The quota has been exceeded.');
                error.name = 'QuotaExceededError';
                throw error;
            }
            values.set(key, String(value));
        }
    };
    return { storage, values };
}

const context = { console };
context.window = context;
vm.runInNewContext(source, context, { filename: 'dashboard-cache.js' });
const cache = context.HypenosysDashboardCache;
const sample = { tasks: [{ id: 900019, estado: 'BLOCKED' }], archive: [],
    stats: { ok: true }, budget: { funds: 0 }, profiles: { members: {} } };

{
    const { storage } = storageFixture();
    const result = cache.persist('hais', sample, storage);
    assert.equal(result.limited, false, 'normal sync should cache without issues');
    assert.equal(result.saved, 5);
    assert.equal(JSON.parse(storage.getItem('hy_cache_tasks_hais'))[0].id, 900019);
}

{
    const { storage } = storageFixture(490);
    storage.setItem('hy_cache_archive_old-workspace', 'X'.repeat(250));
    storage.setItem('gh_access_token', 'secret-placeholder');
    storage.setItem('claude_chat_sessions', '[{"messages":"keep"}]');
    const result = cache.persist('hais', sample, storage);
    assert.equal(result.limited, false, 'quota recovery may remove only disposable workspace caches');
    assert.ok(result.evicted >= 1);
    assert.equal(storage.getItem('hy_cache_archive_old-workspace'), null);
    assert.equal(storage.getItem('gh_access_token'), 'secret-placeholder');
    assert.equal(storage.getItem('claude_chat_sessions'), '[{"messages":"keep"}]');
    assert.equal(JSON.parse(storage.getItem('hy_cache_tasks_hais'))[0].id, 900019);
}

{
    const { storage } = storageFixture(150);
    storage.setItem('hypenosys_personal_kanban_tasks_alice', 'P'.repeat(65));
    storage.setItem('claude_chat_sessions', 'C'.repeat(24));
    const result = cache.persist('hais', sample, storage);
    assert.equal(result.limited, true, 'persistent user data wins over disposable cache');
    assert.equal(storage.getItem('hypenosys_personal_kanban_tasks_alice'), 'P'.repeat(65));
    assert.equal(storage.getItem('claude_chat_sessions'), 'C'.repeat(24));
    assert.equal(storage.getItem('hy_cache_tasks_hais'), null,
        'never restore a partial mixed-generation Dashboard snapshot');
}

{
    const { storage } = storageFixture();
    storage.setItem('hy_cache_tasks_hais', '[{"id":123}]');
    const result = cache.persist('hais', { tasks: [{ payload: 'X'.repeat(510000) }] }, storage);
    assert.equal(result.limited, true, 'oversized snapshots should not fill localStorage');
    assert.equal(storage.getItem('hy_cache_tasks_hais'), null, 'old oversized snapshots are disposable');
}

{
    const { storage } = storageFixture();
    storage.setItem = () => { throw Object.assign(new Error('Blocked'), { name: 'SecurityError' }); };
    const result = cache.persist('hais', sample, storage);
    assert.equal(result.limited, true, 'blocked storage must not throw into the Dashboard refresh');
}

assert.equal(cache.isDashboardCacheKey('hy_cache_tasks_hais'), true);
assert.equal(cache.isDashboardCacheKey('claude_chat_sessions'), false);
assert.equal(cache.isDashboardCacheKey('hypenosys_personal_kanban_tasks_alice'), false);
assert.equal(cache.isQuotaError(new Error('The quota has been exceeded.')), true);

// Guard the UI integration: a recoverable cache failure must not sit in the
// outer GitHub-sync catch, preventing render and causing an error toast.
const dashboard = fs.readFileSync(path.join(__dirname, '../assets/javascript/dashboard-data.js'), 'utf8');
assert.match(dashboard, /HypenosysDashboardCache\?\.persist\(ws,/);
assert.doesNotMatch(dashboard, /localStorage\.setItem\(`hy_cache_tasks_/);
assert.match(dashboard, /renderDashboard\(\);\s*const tsEl/);

console.log('Dashboard quota-safe cache tests: PASS');
