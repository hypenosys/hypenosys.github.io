const assert = require('assert');

// Mock localStorage
class LocalStorageMock {
    constructor() {
        this.store = {};
    }
    getItem(key) {
        return this.store[key] || null;
    }
    setItem(key, value) {
        this.store[key] = String(value);
    }
    removeItem(key) {
        delete this.store[key];
    }
    clear() {
        this.store = {};
    }
}

global.localStorage = new LocalStorageMock();
global.window = global;

// Load ai-config.js logic
require('../assets/javascript/ai-config.js');

console.log('--- RUNNING API CONFIG TESTS ---');

// 1. Test PROVIDER_DEFAULTS
assert.strictEqual(window.PROVIDER_DEFAULTS.nvidia_nim.baseUrl, 'https://integrate.api.nvidia.com/v1');
assert.strictEqual(window.PROVIDER_DEFAULTS.ollama.baseUrl, 'http://localhost:11434/v1');
assert.strictEqual(window.PROVIDER_DEFAULTS.anthropic.baseUrl, 'https://api.anthropic.com/v1');
assert.strictEqual(window.PROVIDER_DEFAULTS.gemini.baseUrl, 'https://generativelanguage.googleapis.com');
console.log('✓ PROVIDER_DEFAULTS check passed');

// 2. Test isLocalUrl
assert.strictEqual(window.isLocalUrl('http://localhost:11434/v1'), true);
assert.strictEqual(window.isLocalUrl('http://127.0.0.1:11434'), true);
assert.strictEqual(window.isLocalUrl('http://192.168.1.50:8000'), true);
assert.strictEqual(window.isLocalUrl('http://10.0.0.1/v1'), true);
assert.strictEqual(window.isLocalUrl('http://172.16.0.1/v1'), true);
assert.strictEqual(window.isLocalUrl('https://integrate.api.nvidia.com/v1'), false);
assert.strictEqual(window.isLocalUrl('https://api.openai.com/v1'), false);
console.log('✓ isLocalUrl check passed');

// 3. Test classifyModel
assert.strictEqual(window.classifyModel('nomic-embed-text'), 'embedding');
assert.strictEqual(window.classifyModel('bge-large-en-v1.5'), 'embedding');
assert.strictEqual(window.classifyModel('text-embedding-3-small'), 'embedding');
assert.strictEqual(window.classifyModel('nv-embed-qa-4'), 'embedding');
assert.strictEqual(window.classifyModel('bge-reranker-large'), 'rerank');
assert.strictEqual(window.classifyModel('nvidia/nemotron-3-super-120b-a12b'), 'chat');
assert.strictEqual(window.classifyModel('llama3:latest'), 'chat');
assert.strictEqual(window.classifyModel('ollama-model', { capabilities: ['embedding'] }), 'embedding');
console.log('✓ classifyModel check passed');

// 4. Test getEmbeddingsConfig with same_as_main fallback
localStorage.setItem('hy_ai_config', JSON.stringify({
    provider: 'nvidia_nim',
    base_url: 'https://integrate.api.nvidia.com/v1',
    api_key: 'nvapi-123',
    embedding_model: 'nv-embed-qa-4'
}));

let embedCfg = window.getEmbeddingsConfig();
assert.strictEqual(embedCfg.provider, 'nvidia_nim');
assert.strictEqual(embedCfg.baseUrl, 'https://integrate.api.nvidia.com/v1');
assert.strictEqual(embedCfg.apiKey, 'nvapi-123');
assert.strictEqual(embedCfg.model, 'nv-embed-qa-4');
console.log('✓ getEmbeddingsConfig (same_as_main fallback) check passed');

// 5. Test getEmbeddingsConfig with decoupled embeddings config
localStorage.setItem('hy_ai_config', JSON.stringify({
    provider: 'nvidia_nim',
    base_url: 'https://integrate.api.nvidia.com/v1',
    api_key: 'nvapi-123',
    embed_provider: 'ollama',
    embed_base_url: 'http://localhost:11434/v1',
    embed_api_key: '',
    embedding_model: 'nomic-embed-text'
}));

embedCfg = window.getEmbeddingsConfig();
assert.strictEqual(embedCfg.provider, 'ollama');
assert.strictEqual(embedCfg.baseUrl, 'http://localhost:11434/v1');
assert.strictEqual(embedCfg.apiKey, '');
assert.strictEqual(embedCfg.model, 'nomic-embed-text');
console.log('✓ getEmbeddingsConfig (decoupled) check passed');

console.log('ALL API CONFIG UNIT TESTS PASSED SUCCESSFULLY!');
