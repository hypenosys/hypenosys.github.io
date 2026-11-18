/**
 * Test unitario para la resolución dinámica y validación de la URL Base de Jules API.
 * Ejecutable mediante: node _tests/test_jules_base.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('[TEST] Iniciando verificación de Jules API Base URL...');

// Mock localStorage
class MockLocalStorage {
    constructor() {
        this.store = {};
        this.throwOnGet = false;
    }
    getItem(key) {
        if (this.throwOnGet) throw new Error('SecurityError: localStorage is disabled');
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

const mockStorage = new MockLocalStorage();

let lastFetchCall = null;
let invalidateCalled = false;

// CustomEvent stub and Window Event Target
class MockCustomEvent {
    constructor(type, eventInitDict = {}) {
        this.type = type;
        this.detail = eventInitDict.detail || null;
    }
}

let dispatchedEvents = [];

// Setup VM sandbox environment with real CustomEvent stub
const sandbox = {
    console: console,
    localStorage: mockStorage,
    CustomEvent: MockCustomEvent,
    window: {
        dispatchEvent: (evt) => {
            dispatchedEvents.push(evt);
            return true;
        },
        invalidateJulesRequests: () => {
            invalidateCalled = true;
        }
    },
    document: {
        listeners: [],
        addEventListener: function(type, fn, useCapture) {
            this.listeners.push({ type, fn, useCapture });
        },
        dispatchEvent: () => {},
        getElementById: () => null
    },
    URL: globalThis.URL,
    AbortController: globalThis.AbortController,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    fetch: async (url, options) => {
        lastFetchCall = { url, options };
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ sources: [] })
        };
    }
};

sandbox.window.window = sandbox.window;
sandbox.window.localStorage = mockStorage;
sandbox.window.CustomEvent = MockCustomEvent;

vm.createContext(sandbox);

// Load jules-api.js into sandbox
const julesApiCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/jules-api.js'), 'utf8');
vm.runInContext(julesApiCode, sandbox);

const {
    validateJulesApiBase,
    getJulesBase,
    saveJulesApiBase,
    removeJulesApiBase,
    applyJulesApiBaseFromModal,
    julesApiCall,
    JulesAPI
} = sandbox.window;

// 1. Pruebas de validateJulesApiBase
console.log('\n[1] Probando validateJulesApiBase()...');

assert.strictEqual(
    validateJulesApiBase('https://api.example.test/v1alpha'),
    'https://api.example.test/v1alpha',
    'Debe aceptar URL https limpia'
);

assert.strictEqual(
    validateJulesApiBase('https://api.example.test/v1alpha/'),
    'https://api.example.test/v1alpha',
    'Debe eliminar barras finales (normalización automática)'
);

assert.strictEqual(
    validateJulesApiBase('https://api.example.test/v1alpha///'),
    'https://api.example.test/v1alpha',
    'Debe eliminar múltiples barras finales'
);

assert.strictEqual(
    validateJulesApiBase('http://api.example.test/v1alpha'),
    null,
    'Debe rechazar URLs HTTP'
);

assert.strictEqual(
    validateJulesApiBase('https://user:pass@api.example.test/v1alpha'),
    null,
    'Debe rechazar URLs con credenciales'
);

assert.strictEqual(
    validateJulesApiBase('not-a-url'),
    null,
    'Debe rechazar cadenas de URL no válidas'
);

assert.strictEqual(
    validateJulesApiBase(''),
    null,
    'Debe rechazar cadenas vacías'
);

assert.strictEqual(
    validateJulesApiBase(null),
    null,
    'Debe rechazar valores null'
);

console.log('✓ validateJulesApiBase() superó todas las aserciones.');

// 2. Pruebas de getJulesBase, CustomEvent y localStorage
console.log('\n[2] Probando getJulesBase(), CustomEvent y persistencia en localStorage...');

mockStorage.clear();
dispatchedEvents = [];

assert.strictEqual(
    getJulesBase(),
    'https://jules.googleapis.com/v1alpha',
    'Sin jules_api_base debe devolver la URL por defecto de Google'
);

saveJulesApiBase('https://proxy.example.test/v1alpha');
assert.strictEqual(
    getJulesBase(),
    'https://proxy.example.test/v1alpha',
    'Debe devolver la URL personalizada guardada'
);

assert.strictEqual(
    mockStorage.getItem('jules_api_base'),
    'https://proxy.example.test/v1alpha',
    'localStorage debe contener la URL guardada'
);

assert.strictEqual(dispatchedEvents.length, 1, 'Debe haber emitido 1 evento CustomEvent al guardar la base');
assert.strictEqual(dispatchedEvents[0].type, 'julesApiBaseChanged');
assert.strictEqual(dispatchedEvents[0].detail.base, 'https://proxy.example.test/v1alpha');

removeJulesApiBase();
assert.strictEqual(
    getJulesBase(),
    'https://jules.googleapis.com/v1alpha',
    'Tras removeJulesApiBase debe volver a la URL por defecto'
);

// Probar resistencia ante excepciones en localStorage.getItem
mockStorage.throwOnGet = true;
assert.strictEqual(
    getJulesBase(),
    'https://jules.googleapis.com/v1alpha',
    'Si localStorage lanza una excepción, debe devolver la URL por defecto de Google'
);
mockStorage.throwOnGet = false;

console.log('✓ getJulesBase() y disparo de CustomEvent superaron todas las aserciones.');

// 3. Pruebas de applyJulesApiBaseFromModal
console.log('\n[3] Probando applyJulesApiBaseFromModal()...');

mockStorage.clear();

// 3.a) URL Vacía cuando NO había base personalizada previa -> changed = false, NO vacía cachés
sandbox.window.julesSessionsCache = ['session-initial'];
mockStorage.setItem('jules_sessions_cache', JSON.stringify(['session-initial']));
invalidateCalled = false;

const resEmptyNoCustom = applyJulesApiBaseFromModal('');
assert.strictEqual(resEmptyNoCustom.changed, false, 'No debió reportar cambio si antes no había base personalizada');
assert.strictEqual(sandbox.window.julesSessionsCache.length, 1, 'Caché no debió vaciarse si no había base personalizada previa');
assert.strictEqual(invalidateCalled, false, 'invalidateJulesRequests no debió llamarse');

// 3.b) URL Inválida -> debe lanzar error y NO modificar storage ni cachés
assert.throws(() => {
    applyJulesApiBaseFromModal('http://invalid-http.example.test');
}, /URL de la API Jules inválida/, 'URL HTTP debe lanzar excepción');

assert.strictEqual(mockStorage.getItem('jules_api_base'), null, 'Storage no debió cambiar');
assert.strictEqual(sandbox.window.julesSessionsCache.length, 1, 'Caché no debió vaciarse');
assert.strictEqual(invalidateCalled, false, 'invalidateJulesRequests no debió ser llamado');

// 3.c) URL Válida -> guarda, vacía cachés y llama invalidateJulesRequests
const res1 = applyJulesApiBaseFromModal('https://custom-1.example.test/v1alpha');
assert.strictEqual(res1.changed, true, 'Debe reportar que cambió la base');
assert.strictEqual(res1.base, 'https://custom-1.example.test/v1alpha');
assert.strictEqual(mockStorage.getItem('jules_api_base'), 'https://custom-1.example.test/v1alpha');
assert.strictEqual(sandbox.window.julesSessionsCache.length, 0, 'julesSessionsCache debe haberse vaciado');
assert.strictEqual(mockStorage.getItem('jules_sessions_cache'), null, 'jules_sessions_cache debe removerse de storage');
assert.strictEqual(mockStorage.getItem('hy_jules_repo_cache'), null, 'hy_jules_repo_cache debe removerse de storage');
assert.strictEqual(invalidateCalled, true, 'invalidateJulesRequests debió ser invocado');

// 3.d) Misma URL sin cambios -> changed = false, NO vacía cachés
sandbox.window.julesSessionsCache = ['session-fresh'];
mockStorage.setItem('jules_sessions_cache', JSON.stringify(['session-fresh']));
invalidateCalled = false;

const res2 = applyJulesApiBaseFromModal('https://custom-1.example.test/v1alpha');
assert.strictEqual(res2.changed, false, 'No debió reportar cambio');
assert.strictEqual(sandbox.window.julesSessionsCache.length, 1, 'Caché no debió vaciarse al no haber cambio');
assert.strictEqual(invalidateCalled, false, 'invalidateJulesRequests no debió ser llamado');

// 3.e) URL Vacía cuando SÍ había base personalizada previa -> elimina jules_api_base y vacía cachés
const res3 = applyJulesApiBaseFromModal('');
assert.strictEqual(res3.changed, true, 'Debe reportar cambio al volver a Google desde una base personalizada');
assert.strictEqual(res3.base, 'https://jules.googleapis.com/v1alpha');
assert.strictEqual(mockStorage.getItem('jules_api_base'), null, 'jules_api_base debe removerse');

console.log('✓ applyJulesApiBaseFromModal() superó todas las aserciones.');

// 4. Pruebas de captura de click en modal con claves inválidas, URL inválida, URL válida y URL vacía
console.log('\n[4] Probando listener de clic en fase de captura...');

const captureListenerObj = sandbox.document.listeners.find(l => l.type === 'click' && l.useCapture === true);
assert.ok(captureListenerObj, 'Debe haber registrado un listener de click en fase de captura');

mockStorage.clear();
saveJulesApiBase('https://existing.example.test/v1alpha');

let prevented = false;
let stopped = false;
let toastMsg = null;
let mockBadgeClasses = new Set(['d-none']);

sandbox.window.hypeToast = (msg) => { toastMsg = msg; };
sandbox.document.getElementById = (id) => {
    if (id === 'jules-panel-api-key-input') return { value: sandbox._testKeyVal || '' };
    if (id === 'jules-panel-api-url-input') return { value: sandbox._testUrlVal || '' };
    if (id === 'jules-custom-url-badge') return {
        classList: {
            remove: (cls) => mockBadgeClasses.delete(cls),
            add: (cls) => mockBadgeClasses.add(cls),
            contains: (cls) => mockBadgeClasses.has(cls)
        }
    };
    return null;
};

const mockEventObj = () => ({
    target: { closest: selector => selector === '#btn-save-jules-api-key' ? true : null },
    preventDefault: () => { prevented = true; },
    stopImmediatePropagation: () => { stopped = true; }
});

// 4.a) Clave vacía -> el listener debe retornar inmediatamente sin modificar la base guardada
sandbox._testKeyVal = '';
sandbox._testUrlVal = 'https://new-custom.example.test/v1alpha';
prevented = false; stopped = false;

captureListenerObj.fn(mockEventObj());
assert.strictEqual(mockStorage.getItem('jules_api_base'), 'https://existing.example.test/v1alpha', 'No debió cambiar la base con clave vacía');
assert.strictEqual(prevented, false, 'No debió prevenir el evento para permitir que auth.js maneje la clave vacía');

// 4.b) Clave de proveedor IA (sk-...) -> no debe modificar la base guardada
sandbox._testKeyVal = 'sk-123456';
sandbox._testUrlVal = 'https://new-custom.example.test/v1alpha';

captureListenerObj.fn(mockEventObj());
assert.strictEqual(mockStorage.getItem('jules_api_base'), 'https://existing.example.test/v1alpha', 'No debió cambiar la base con clave de proveedor IA');

// 4.c) Clave válida + URL inválida -> preventDefault y stopImmediatePropagation llamados, storage sin cambios, toast invocado
sandbox._testKeyVal = 'valid-key-123';
sandbox._testUrlVal = 'http://invalid-http.example.test';
prevented = false; stopped = false; toastMsg = null;

captureListenerObj.fn(mockEventObj());
assert.strictEqual(prevented, true, 'Debe llamar a preventDefault() con URL inválida');
assert.strictEqual(stopped, true, 'Debe llamar a stopImmediatePropagation() con URL inválida');
assert.strictEqual(mockStorage.getItem('jules_api_base'), 'https://existing.example.test/v1alpha', 'Storage no debió cambiar');
assert.ok(toastMsg && toastMsg.includes('URL de la API Jules inválida'), 'Debe haber invocado el toast de error');

// 4.d) Clave válida + URL válida -> base guardada, badge sin d-none
sandbox._testKeyVal = 'valid-key-123';
sandbox._testUrlVal = 'https://new-custom.example.test/v1alpha';
prevented = false; stopped = false; mockBadgeClasses.add('d-none');

captureListenerObj.fn(mockEventObj());
assert.strictEqual(prevented, false, 'No debió prevenir el evento con URL válida');
assert.strictEqual(mockStorage.getItem('jules_api_base'), 'https://new-custom.example.test/v1alpha', 'Base debe haberse guardado');
assert.strictEqual(mockBadgeClasses.has('d-none'), false, 'Badge debe no tener d-none');

// 4.e) Clave válida + URL vacía con base previa -> base eliminada, badge con d-none
sandbox._testKeyVal = 'valid-key-123';
sandbox._testUrlVal = '';
prevented = false; stopped = false; mockBadgeClasses.clear();

captureListenerObj.fn(mockEventObj());
assert.strictEqual(mockStorage.getItem('jules_api_base'), null, 'Base debe haberse eliminado');
assert.strictEqual(mockBadgeClasses.has('d-none'), true, 'Badge debe tener d-none');

console.log('✓ Listener en fase de captura superó todas las aserciones (clave vacía/contaminada/inválida/válida/vacía).');

// 5. Pruebas de fetch simulado con julesApiCall
console.log('\n[5] Probando llamadas julesApiCall() con fetch simulado...');

mockStorage.clear();
saveJulesApiBase('https://custom-api.example.test/v1alpha');
lastFetchCall = null;

(async () => {
    await julesApiCall('GET', '/sources?pageSize=1', null, 'test-key-abc');
    assert.ok(lastFetchCall, 'Debe haber realizado una llamada a fetch');
    assert.strictEqual(
        lastFetchCall.url,
        'https://custom-api.example.test/v1alpha/sources?pageSize=1',
        'fetch debe llamarse con la base URL personalizada de example.test y el endpoint'
    );
    assert.strictEqual(
        lastFetchCall.options.headers['x-goog-api-key'],
        'test-key-abc',
        'fetch debe incluir la cabecera x-goog-api-key'
    );

    // Sin base guardada (removeJulesApiBase) -> debe usar Google
    removeJulesApiBase();
    lastFetchCall = null;
    await julesApiCall('GET', '/sources?pageSize=1', null, 'test-key-abc');
    assert.strictEqual(
        lastFetchCall.url,
        'https://jules.googleapis.com/v1alpha/sources?pageSize=1',
        'Sin base guardada debe usar la URL por defecto de Google'
    );

    // Con base inválida guardada en localStorage (p. ej. http://...) -> debe usar Google
    mockStorage.setItem('jules_api_base', 'http://invalid-http.example.test');
    lastFetchCall = null;
    await julesApiCall('GET', '/sources?pageSize=1', null, 'test-key-abc');
    assert.strictEqual(
        lastFetchCall.url,
        'https://jules.googleapis.com/v1alpha/sources?pageSize=1',
        'Con base inválida guardada en localStorage debe usar la URL por defecto de Google'
    );

    console.log('✓ julesApiCall() con fetch simulado superó todas las aserciones.');

    // 6. Pruebas de la clase JulesAPI y su getter baseUrl
    console.log('\n[6] Probando clase JulesAPI y getter baseUrl...');

    mockStorage.clear();
    const julesInst = sandbox.window.julesApi;
    assert.strictEqual(
        julesInst.baseUrl,
        'https://jules.googleapis.com/v1alpha',
        'julesApi.baseUrl debe ser por defecto de Google'
    );

    saveJulesApiBase('https://custom-api.example.test/v1');
    assert.strictEqual(
        julesInst.baseUrl,
        'https://custom-api.example.test/v1',
        'julesApi.baseUrl debe reflejar dinámicamente el cambio en localStorage'
    );

    // Verificar instanciación sin TypeError
    assert.doesNotThrow(() => {
        const freshInst = new sandbox.window.julesApi.constructor();
        assert.strictEqual(freshInst.baseUrl, 'https://custom-api.example.test/v1');
    }, 'Instanciar new JulesAPI() no debe lanzar TypeError con el getter de baseUrl');

    console.log('✓ JulesAPI superó todas las aserciones.');

    // 7. Test anti-fugas de seguridad en archivos de código tocados por la feature
    console.log('\n[7] Ejecutando escaneo anti-fugas en todos los archivos tocados por la feature...');

    const touchedFiles = [
        'assets/javascript/jules-api.js',
        'assets/javascript/jules-activities.js',
        'assets/javascript/auth.js',
        'pages/command-center.html',
        '_includes/api_config_modal.html',
        '_tests/test_jules_base.js'
    ];

    // Cargar denylist desde variable de entorno opcional LEAK_DENYLIST (separada por comas)
    const envDenylist = (process.env.LEAK_DENYLIST || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const forbiddenPatterns = [
        { name: 'Cualquier IPv4 explícita', regex: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g },
        { name: 'Host Localhost / Loopback', regex: /\bhttps?:\/\/(localhost|127\.0\.0\.1)\b/g },
        { name: 'UUIDv4', regex: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g },
        { name: 'Dominio .internal / .lan', regex: /\b[a-zA-Z0-9-]+\.(internal|lan)\b/g }
    ];

    let leaksFound = 0;

    for (const fileRelPath of touchedFiles) {
        const fullPath = path.join(__dirname, '..', fileRelPath);
        assert.ok(fs.existsSync(fullPath), `El archivo requerido ${fileRelPath} debe existir en el repositorio.`);
        let content = fs.readFileSync(fullPath, 'utf8');

        // Excepción de placeholders preexistentes y definiciones de patrones en el archivo de test
        if (fileRelPath === '_includes/api_config_modal.html' || fileRelPath === 'pages/command-center.html') {
            content = content.replace(/192\.168\.1\.0\/24/g, '[placeholder-ollama-ignorado]')
                             .replace(/http:\/\/localhost:11434/g, '[placeholder-ollama-ignorado]');
        }
        if (fileRelPath === '_tests/test_jules_base.js') {
            content = content.replace(/forbiddenPatterns\s*=\s*\[[\s\S]*?\];/g, '[forbidden-patterns-ignorado]');
        }

        // Check pattern rules
        for (const pattern of forbiddenPatterns) {
            const matches = content.match(pattern.regex);
            if (matches) {
                console.error(`❌ Fuga detectada en ${fileRelPath}: patrón '${pattern.name}' -> ${matches.join(', ')}`);
                leaksFound++;
            }
        }

        // Check custom LEAK_DENYLIST entries
        for (const denyItem of envDenylist) {
            if (content.includes(denyItem)) {
                console.error(`❌ Fuga detectada en ${fileRelPath}: elemento de LEAK_DENYLIST -> '${denyItem}'`);
                leaksFound++;
            }
        }
    }

    assert.strictEqual(leaksFound, 0, 'No se debe encontrar ninguna IP privada, UUID, dominio interno o término de LEAK_DENYLIST en los archivos modificados.');

    console.log('✓ Escaneo anti-fugas completado sin hallazgos.');

    console.log('\n====================================================');
    console.log('✅ ALL JULES BASE URL TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
})();
