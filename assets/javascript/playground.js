/**
 * HYPENOSYS PLAYGROUND — Integrated Sandbox Logic
 * Aislado, seguro y persistente en localStorage.
 */

(function() {
    console.log("🧪 [SANDBOX] Inicializando entorno de pruebas...");

    // --- 1. CONFIGURACIÓN Y MOCKS ---

    const sandboxDb = {
        getTasks() {
            return JSON.parse(localStorage.getItem('sandbox_tasks') || '[]');
        },
        saveTasks(tasks) {
            localStorage.setItem('sandbox_tasks', JSON.stringify(tasks));
            this.log(`Tareas sincronizadas (${tasks.length} total)`);
            if (window.renderSandboxKanban) window.renderSandboxKanban();
            updateCharts();
            updateDebugInfo();
        },
        log(msg, type = 'info') {
            const container = document.getElementById('sandboxLogs');
            if (!container) return;
            const entry = document.createElement('div');
            const time = new Date().toLocaleTimeString();
            entry.innerHTML = `<span class="text-comment">[${time}]</span> ${msg}`;
            container.appendChild(entry);
            container.scrollTop = container.scrollHeight;
        }
    };
    window.sandboxDb = sandboxDb;

    // Interceptor de Fetch para bloquear escrituras reales a GitHub
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        const urlStr = url.toString();
        if (urlStr.includes('api.github.com') && options && (options.method === 'PUT' || options.method === 'POST' || options.method === 'PATCH' || options.method === 'DELETE')) {
            console.warn('⛔ [SANDBOX] Bloqueada petición de escritura real:', urlStr);
            sandboxDb.log(`⚠️ INTENTO DE ESCRITURA REAL BLOQUEADO: ${options.method} ${urlStr}`, 'warning');

            // Simular respuesta exitosa de GitHub para que la lógica siga funcionando si es necesario
            return Promise.resolve(new Response(JSON.stringify({
                content: { name: 'sandbox-mock', sha: '00000000000000' },
                commit: { message: 'Mocked by sandbox' }
            }), { status: 200 }));
        }
        return originalFetch(url, options);
    };

    // --- 2. GENERAL OPS ---

    window.resetSandbox = function() {
        if (confirm('¿Estás seguro de que quieres borrar todos los datos del sandbox?')) {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sandbox_')) localStorage.removeItem(key);
            });
            sandboxDb.log("Sandbox reseteado.");
            window.location.reload();
        }
    };

    // --- 3. LÓGICA DE CHARTS ---

    let barChart, pieChart;

    function initCharts() {
        const barCtx = document.getElementById('sandboxTasksChart');
        const pieCtx = document.getElementById('sandboxPieChart');

        if (!barCtx || !pieCtx) return;

        barChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['Todo', 'In Progress', 'Done'],
                datasets: [{
                    label: 'Tareas por estado',
                    data: [0, 0, 0],
                    backgroundColor: ['#6272a4', '#f1fa8c', '#50fa7b'],
                    borderColor: '#282a36',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: '#343746' }, ticks: { color: '#6272a4' } },
                    x: { ticks: { color: '#f8f8f2' } }
                }
            }
        });

        pieChart = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: ['Todo', 'In Progress', 'Done'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#6272a4', '#f1fa8c', '#50fa7b'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });

        updateCharts();
    }

    function updateCharts() {
        if (!barChart || !pieChart) return;

        const tasks = sandboxDb.getTasks();
        const counts = { 'Todo': 0, 'In Progress': 0, 'Done': 0 };
        tasks.forEach(t => { if(counts[t.status] !== undefined) counts[t.status]++; });

        const data = [counts['Todo'], counts['In Progress'], counts['Done']];

        barChart.data.datasets[0].data = data;
        barChart.update();

        pieChart.data.datasets[0].data = data;
        pieChart.update();
    }

    // --- 4. SIMULADOR DE JULES ---

    window.simulateJules = function() {
        const input = document.getElementById('jules-mock-input');
        const prompt = input.value.trim();
        if (!prompt) return;

        const consoleEl = document.getElementById('jules-mock-console');
        const logContainer = document.getElementById('jules-log-container');

        consoleEl.style.display = 'block';
        logContainer.innerHTML = '';
        input.value = '';

        const steps = [
            `> INITIATING JULES CORE...`,
            `> ANALYZING PROMPT: "${prompt}"`,
            `> SCANNING REPOSITORY...`,
            `> LOCATING SOURCE FILES...`,
            `> EXECUTING PLAN STEP 1: Researching logic.`,
            `> EXECUTING PLAN STEP 2: Applying patches.`,
            `> VERIFYING CHANGES...`,
            `> DONE. Tarea completada con éxito (SIMULADO).`
        ];

        let i = 0;
        function logNext() {
            if (i < steps.length) {
                const line = document.createElement('div');
                line.className = 'mb-1';
                line.textContent = steps[i];
                logContainer.appendChild(line);
                consoleEl.scrollTop = consoleEl.scrollHeight;
                i++;
                setTimeout(logNext, 500 + Math.random() * 500);
            } else {
                // Show diff viewer at the end
                const diffEl = document.getElementById('jules-mock-diff');
                if (diffEl) diffEl.style.display = 'block';
            }
        }
        logNext();
        sandboxDb.log(`🤖 Jules: Lanzada simulación para "${prompt.substring(0,20)}..."`);
    };

    // --- 5. AUTH TESTER ---

    window.simulateAuth = function(type) {
        const statusText = document.getElementById('auth-status-text');
        const statusDetail = document.getElementById('auth-status-detail');
        const indicator = document.getElementById('auth-status-indicator');

        const states = {
            'success': { text: 'AUTHENTICATED', detail: 'Token válido: ghp_sandbox_... (Simulation)', color: 'text-success', icon: 'fa-check-circle' },
            'fail': { text: 'AUTH_FAILED', detail: 'Error 401: Invalid Credentials (Simulation)', color: 'text-danger', icon: 'fa-times-circle' },
            'expire': { text: 'TOKEN_EXPIRED', detail: 'Session expired (Simulation)', color: 'text-warning', icon: 'fa-hourglass-end' }
        };

        const state = states[type];
        statusText.textContent = state.text;
        statusText.className = `font-weight-bold ${state.color}`;
        statusDetail.textContent = state.detail;
        indicator.innerHTML = `<i class="fas ${state.icon} ${state.color}"></i>`;

        sandboxDb.log(`🔐 Auth Tester: Simulado estado ${state.text}`);
    };

    // --- 6. UI VIEWER ---

    function initUIViewer() {
        if (window.HypenosysUI) {
            const av1 = document.getElementById('avatar-preview-1');
            const av2 = document.getElementById('avatar-preview-2');
            if (av1) av1.innerHTML = window.HypenosysUI.renderAvatar({
                login: 'Jules',
                avatar_url: 'https://github.com/github.png'
            });
            if (av2) av2.innerHTML = window.HypenosysUI.renderAvatar({
                login: 'Anonymous'
            });
        }

        if (window.timeAgo) {
            const nowEl = document.getElementById('time-now');
            const pastEl = document.getElementById('time-past');
            const futureEl = document.getElementById('time-future');

            if (nowEl) nowEl.innerText = window.timeAgo(new Date().toISOString());

            const fiveMinAgo = new Date();
            fiveMinAgo.setMinutes(fiveMinAgo.getMinutes() - 5);
            if (pastEl) pastEl.innerText = window.timeAgo(fiveMinAgo.toISOString());

            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            if (futureEl) futureEl.innerText = window.timeAgo(tomorrow.toISOString());
        }
    }

    // --- 7. DEBUG Y UTILIDADES ---

    function updateDebugInfo() {
        const countEl = document.getElementById('ls-keys-count');
        if (countEl) {
            const count = Object.keys(localStorage).filter(k => k.startsWith('sandbox_')).length;
            countEl.textContent = count;
        }
    }

    // --- INICIALIZACIÓN ---

    document.addEventListener('DOMContentLoaded', () => {
        if (window.renderSandboxKanban) window.renderSandboxKanban();
        initCharts();
        initUIViewer();
        updateDebugInfo();

        // Manejar Tabs para refrescar charts si es necesario
        $('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
            if (e.target.id === 'charts-tab') {
                updateCharts();
            }
        });
    });

})();
