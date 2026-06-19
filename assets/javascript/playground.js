/**
 * HYPENOSYS PLAYGROUND — Core Logic
 * Entorno de pruebas aislado.
 */

(function() {
    console.log('🧪 [SANDBOX] Inicializando Hypenosys Playground...');

    // --- 1. AISLAMIENTO DE DATOS (CRÍTICO) ---
    const sandboxDb = {
        tasks: JSON.parse(localStorage.getItem('sandbox_tasks') || '[]'),
        save(key, data) {
            localStorage.setItem(`sandbox_${key}`, JSON.stringify(data));
            console.log('[SANDBOX] Guardado local:', key, data);
            updateDebugPanel();
        },
        reset() {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sandbox_')) {
                    localStorage.removeItem(key);
                }
            });
            console.warn('[SANDBOX] Reset completo.');
            window.location.reload();
        }
    };
    window.sandboxDb = sandboxDb;

    // --- 2. SEGURIDAD: INTERCEPTOR DE FETCH ---
    const originalFetch = window.fetch;
    window.fetch = function(url, ...args) {
        const urlStr = typeof url === 'string' ? url : url.url;
        if (urlStr && urlStr.includes('api.github.com') && urlStr.includes('/contents/')) {
            console.warn('[SANDBOX BLOQUEADO] Intento de escritura real interceptado:', urlStr);
            logToDebug('⛔ BLOQUEADO: Escritura real a GitHub interceptada');

            const indicator = document.getElementById('sandbox-indicator');
            if (indicator) {
                indicator.innerHTML = '<span class="status-dot status-blocked"></span> <span class="small">🔴 Detectado intento de escritura real (bloqueado)</span>';
            }

            return Promise.resolve(new Response(JSON.stringify({ sandbox: true, message: "Blocked by sandbox interceptor" }), { status: 200 }));
        }
        return originalFetch(url, ...args);
    };

    // --- 3. PANEL DE DEBUG GLOBAL ---
    const debugContainer = document.getElementById('debug-logs');
    function logToDebug(message) {
        if (!debugContainer) return;
        const entry = document.createElement('div');
        entry.className = 'mb-1';
        entry.innerHTML = `<span class="text-muted">[${new Date().toLocaleTimeString()}]</span> ${message}`;
        debugContainer.appendChild(entry);
        debugContainer.scrollTop = debugContainer.scrollHeight;
    }
    window.sandboxLog = logToDebug;

    function updateDebugPanel() {
        const keysSpan = document.getElementById('sandbox-keys');
        if (keysSpan) {
            const sandboxKeys = Object.keys(localStorage).filter(k => k.startsWith('sandbox_'));
            keysSpan.textContent = JSON.stringify(sandboxKeys);
        }
    }

    // --- 4. MÓDULO: CHART.JS SANDBOX ---
    let sandboxChartInstance = null;
    function initChartSandbox() {
        const ctx = document.getElementById('sandboxChart');
        if (!ctx) return;

        sandboxChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4'],
                datasets: [{
                    label: 'Velocidad de Prueba',
                    data: [12, 19, 3, 5],
                    backgroundColor: 'rgba(189, 147, 249, 0.5)',
                    borderColor: '#bd93f9',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
                    x: { grid: { display: false } }
                }
            }
        });

        const slider = document.getElementById('chart-slider');
        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            sandboxChartInstance.data.datasets[0].data[0] = val / 2;
            sandboxChartInstance.data.datasets[0].data[1] = val / 3;
            sandboxChartInstance.data.datasets[0].data[2] = val / 5;
            sandboxChartInstance.data.datasets[0].data[3] = val / 4;
            sandboxChartInstance.update();
            logToDebug(`📊 Gráfico actualizado: ${val}`);
        });
    }

    // --- 5. MÓDULO: MOCK JULES PANEL ---
    function initMockJules() {
        const input = document.getElementById('mock-jules-input');
        const sendBtn = document.getElementById('mock-jules-send');
        const chat = document.getElementById('mock-jules-chat');
        const diff = document.getElementById('mock-diff-viewer');

        if (!sendBtn) return;

        const addMsg = (text, type = 'user') => {
            const div = document.createElement('div');
            div.className = type === 'user' ? 'text-white mb-2' : 'text-info mb-2';
            div.innerHTML = `<strong>${type === 'user' ? 'Tú' : 'Jules'}:</strong> ${text}`;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        };

        sendBtn.onclick = () => {
            const prompt = input.value.trim();
            if (!prompt) return;

            addMsg(prompt, 'user');
            input.value = '';
            logToDebug(`🤖 Prompt enviado a Jules Mock: "${prompt}"`);

            setTimeout(() => {
                addMsg('Analizando el repositorio...', 'bot');
                setTimeout(() => {
                    addMsg('He detectado una mejora posible en playground.js. Mostrando diff...', 'bot');
                    diff.style.display = 'block';
                    logToDebug('🤖 Jules Mock generó un diff ficticio.');
                }, 1000);
            }, 800);
        };
    }

    // --- 6. MÓDULO: UI COMPONENT VIEWER ---
    function initUIViewer() {
        const container = document.getElementById('avatar-preview-container');
        if (!container || !window.HypenosysUI) return;

        const mockUser = { login: 'SandboxUser', avatar_url: 'https://github.com/github.png' };
        container.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                ${window.HypenosysUI.renderAvatar(mockUser)}
                <span class="small font-weight-bold">Componente Avatar Renderizado</span>
            </div>
        `;
    }

    // --- 7. MÓDULO: AUTH FLOW TESTER ---
    function initAuthTester() {
        const statusVal = document.getElementById('auth-status-val');
        const log = document.getElementById('auth-debug-log');

        const updateAuthLog = (msg) => {
            log.innerHTML += `<div>> ${msg}</div>`;
            logToDebug(`🔐 Auth Sim: ${msg}`);
        };

        document.getElementById('sim-login-success')?.addEventListener('click', () => {
            statusVal.textContent = 'AUTHENTICATED (MOCK)';
            statusVal.className = 'text-success font-weight-bold font-mono';
            updateAuthLog('Login exitoso simulado para: SandboxDev');
        });

        document.getElementById('sim-login-fail')?.addEventListener('click', () => {
            statusVal.textContent = 'ERROR: ACL_DENIED (MOCK)';
            statusVal.className = 'text-danger font-weight-bold font-mono';
            updateAuthLog('Error 403: Usuario no en lista blanca.');
        });

        document.getElementById('sim-token-expire')?.addEventListener('click', () => {
            statusVal.textContent = 'EXPIRED (MOCK)';
            statusVal.className = 'text-warning font-weight-bold font-mono';
            updateAuthLog('Sesión invalidada por expiración de token.');
        });
    }

    // --- INICIALIZACIÓN ---
    document.addEventListener('DOMContentLoaded', () => {
        initChartSandbox();
        initMockJules();
        initUIViewer();
        initAuthTester();
        updateDebugPanel();

        document.getElementById('reset-sandbox')?.addEventListener('click', () => {
            if (confirm('¿Estás seguro de resetear el sandbox? Se borrarán todas las tareas de prueba.')) {
                sandboxDb.reset();
            }
        });
    });

})();
