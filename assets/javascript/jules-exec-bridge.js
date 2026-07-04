/**
 * JULES EXEC BRIDGE
 * Integrated Python Code Runner for Hypenosys Neural Chat.
 * Sandboxed execution via n8n Docker runner.
 */
window.JulesExecBridge = (function() {

    // --- INITIALIZATION ---
    function init() {
        if (!window.marked) {
            console.warn("[ExecBridge] marked.js not found, cannot hook into renderer.");
            return;
        }

        // Use marked.use for additive extension if available (marked v4+)
        // Otherwise fallback to modifying the global renderer
        const extension = {
            renderer: {
                code(code, language, isEscaped) {
                    // Support both old and new marked.js signature
                    const isToken = typeof code === 'object';
                    const codeVal = isToken ? code.text : code;
                    const lang = isToken ? code.lang : language;

                    // Generate standard HTML using a clean renderer to avoid recursion
                    const cleanRenderer = new marked.Renderer();

                    // marked >= 4.0 expects a token object if it was called with one
                    // marked < 4.0 expects (code, lang, escaped)
                    let html = '';
                    if (isToken) {
                        html = cleanRenderer.code(code);
                    } else {
                        html = cleanRenderer.code(codeVal, lang, isEscaped);
                    }

                    // Fallback for [object Object] bug: if html is not a string or looks like an object
                    if (typeof html !== 'string' || html === '[object Object]') {
                         html = `<pre><code class="language-${lang || 'none'}">${escapeHtml(codeVal)}</code></pre>`;
                    }

                    if (lang === 'python' || lang === 'javascript' || lang === 'js') {
                        const isPy = lang === 'python';
                        const displayLang = isPy ? 'PYTHON' : 'JS';
                        const btnColor = isPy ? 'bg-[#50fa7b]' : 'bg-[#f1fa8c]';

                        // We wrap the original pre in a container and add the button
                        return `
                            <div class="exec-code-container relative group/exec" data-lang="${lang}">
                                ${html}
                                <button onclick="window.JulesExecBridge.confirmExecution(\`${b64EncodeUnicode(codeVal)}\`, '${lang}')"
                                        class="absolute top-2 right-2 opacity-0 group-hover/exec:opacity-100 transition-all ${btnColor} text-[#282a36] px-3 py-1 rounded text-[10px] font-bold hover:scale-105 active:scale-95 shadow-lg flex items-center gap-1.5 z-10">
                                    <i class="fas fa-play"></i> ▶ EJECUTAR ${displayLang}
                                </button>
                            </div>
                        `;
                    }
                    return html;
                }
            }
        };

        if (typeof marked.use === 'function') {
            marked.use(extension);
        } else {
            // Fallback for older marked versions
            const oldRenderer = marked.defaults.renderer || new marked.Renderer();
            const originalCode = oldRenderer.code.bind(oldRenderer);
            oldRenderer.code = extension.renderer.code;
            marked.setOptions({ renderer: oldRenderer });
        }

        console.log("[ExecBridge] Renderer hooked successfully.");

        // Inject modal HTML if not present
        if (!document.getElementById('exec-confirm-modal')) {
            injectModal();
        }
    }

    // Helper for base64 encoding that supports unicode
    function b64EncodeUnicode(str) {
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
            function(match, p1) {
                return String.fromCharCode('0x' + p1);
        }));
    }

    function b64DecodeUnicode(str) {
        return decodeURIComponent(atob(str).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    }

    function injectModal() {
        const modalHtml = `
            <div id="exec-confirm-modal" class="hidden fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div id="exec-modal-container" class="bg-[#282a36] border border-[#50fa7b]/30 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div class="p-4 border-b border-[#44475a] flex items-center justify-between bg-[#1e1f29]">
                        <h3 class="font-bold text-sm tracking-widest flex items-center gap-2 text-[#50fa7b]" id="exec-modal-title">
                            <i class="fas fa-terminal"></i> CONFIRMAR EJECUCIÓN
                        </h3>
                        <button onclick="window.JulesExecBridge.closeModal()" class="text-[#6272a4] hover:text-white transition-all">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar">
                        <div class="bg-red-900/20 border-l-4 border-red-500 p-3 rounded-r">
                            <p class="text-[10px] font-bold text-red-200 uppercase tracking-tighter">⚠️ ADVERTENCIA DE SEGURIDAD</p>
                            <p class="text-xs text-red-100/70 mt-1">Este código se ejecutará en un contenedor Docker aislado. No modifiques el código original. La red está desactivada.</p>
                        </div>

                        <div class="space-y-2">
                            <label class="text-[10px] font-bold text-[#6272a4] uppercase tracking-widest">Código a ejecutar</label>
                            <pre id="exec-code-preview" class="p-4 bg-[#1e1f29] border border-[#44475a] rounded-xl text-xs text-[#50fa7b] font-mono overflow-x-auto max-h-64 custom-scrollbar"></pre>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <label class="text-[10px] font-bold text-[#bd93f9] uppercase tracking-widest">Argumentos CLI (opcional)</label>
                                <input type="text" id="exec-args" placeholder="--input data.json"
                                       class="w-full bg-[#1e1f29] border border-[#44475a] rounded-lg p-3 text-white focus:border-[#bd93f9] outline-none text-xs transition-all">
                            </div>
                            <div class="space-y-2">
                                <label class="text-[10px] font-bold text-[#8be9fd] uppercase tracking-widest">Stdin (opcional)</label>
                                <textarea id="exec-stdin" rows="1" placeholder="Datos para input()..."
                                          class="w-full bg-[#1e1f29] border border-[#44475a] rounded-lg p-3 text-white focus:border-[#8be9fd] outline-none text-xs transition-all resize-none"></textarea>
                            </div>
                        </div>
                    </div>

                    <div class="p-6 border-t border-[#44475a] bg-[#1e1f29] flex gap-3">
                        <button onclick="window.JulesExecBridge.runNow()" id="exec-run-btn" class="flex-grow py-4 bg-[#50fa7b] text-[#282a36] rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-[#50fa7b]/20 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2">
                            <i class="fas fa-play"></i> ▶ EJECUTAR AHORA
                        </button>
                        <button onclick="window.JulesExecBridge.closeModal()" class="px-6 py-4 border border-[#44475a] hover:bg-[#44475a] text-[#6272a4] hover:text-white rounded-xl font-bold text-xs transition-all">
                            CANCELAR
                        </button>
                    </div>
                </div>
            </div>

            <style>
                .exec-code-container:hover pre { border-color: #50fa7b !important; }
            </style>
        `;
        const div = document.createElement('div');
        div.innerHTML = modalHtml;
        document.body.appendChild(div);
    }

    let currentPendingCode = "";
    let currentPendingLang = "python";

    function confirmExecution(base64Code, lang = 'python') {
        const code = b64DecodeUnicode(base64Code);
        currentPendingCode = code;
        currentPendingLang = lang;

        const modal = document.getElementById('exec-confirm-modal');
        const container = document.getElementById('exec-modal-container');
        const title = document.getElementById('exec-modal-title');
        const preview = document.getElementById('exec-code-preview');
        const runBtn = document.getElementById('exec-run-btn');

        const isPy = lang === 'python';
        const color = isPy ? '#50fa7b' : '#f1fa8c';
        const darkColor = isPy ? '#282a36' : '#282a36'; // Standard dracula bg

        if (title) title.innerHTML = `<i class="fas fa-terminal"></i> CONFIRMAR EJECUCIÓN ${isPy ? 'PYTHON' : 'JS'}`;
        if (title) title.style.color = color;
        if (container) container.style.borderColor = color + '4D'; // 30% alpha
        if (preview) {
            preview.textContent = code;
            preview.style.color = color;
        }
        if (runBtn) {
            runBtn.style.backgroundColor = color;
            runBtn.style.color = darkColor;
            runBtn.innerHTML = `<i class="fas fa-play"></i> ▶ EJECUTAR AHORA (${isPy ? 'PYTHON' : 'JS'})`;
        }

        if (modal) modal.classList.remove('hidden');

        // Reset inputs
        document.getElementById('exec-args').value = "";
        document.getElementById('exec-stdin').value = "";
    }

    function closeModal() {
        const modal = document.getElementById('exec-confirm-modal');
        if (modal) modal.classList.add('hidden');
    }

    async function runNow() {
        const runBtn = document.getElementById('exec-run-btn');
        const argsInput = document.getElementById('exec-args');
        const stdinInput = document.getElementById('exec-stdin');

        const args = argsInput.value;
        const stdin = stdinInput.value;

        const settings = JSON.parse(localStorage.getItem('hypenosys_repoAdmin') || '{}');
        const endpointKey = (currentPendingLang === 'javascript' || currentPendingLang === 'js') ? 'javascript-runner' : 'python-runner';
        const endpoint = settings.endpoints ? settings.endpoints[endpointKey] : null;

        if (!endpoint) {
            if (window.showToast) window.showToast(`Endpoint ${endpointKey} no configurado en repo-admin`, 'error');
            return;
        }

        runBtn.disabled = true;
        runBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> EJECUTANDO...';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    language: currentPendingLang,
                    code: currentPendingCode,
                    args: args,
                    stdin: stdin,
                    source: 'neural-chat-exec',
                    sessionId: window.currentSessionId || 'sandbox'
                }),
                signal: AbortSignal.timeout(25000)
            });

            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
            const data = await res.json();

            renderResult(data, currentPendingLang);
            logExecution(currentPendingCode, args, stdin, data);
            closeModal();

        } catch (e) {
            if (window.showToast) window.showToast('Error de ejecución: ' + e.message, 'error');
            console.error('[ExecBridge] Run failed:', e);
        } finally {
            runBtn.disabled = false;
            runBtn.innerHTML = '<i class="fas fa-play"></i> ▶ EJECUTAR AHORA';
        }
    }

    function renderResult(data, lang) {
        if (!window.chatMessages) return;

        const isPy = lang === 'python';
        const msgDiv = document.createElement('div');
        msgDiv.className = 'flex justify-start mb-4';

        const successColor = isPy ? '#50fa7b' : '#f1fa8c';
        const exitColor = data.exitCode === 0 ? `text-[${successColor}]` : 'text-[#ff5555]';
        const borderColor = data.exitCode === 0 ? `border-[${successColor}]/30` : 'border-[#ff5555]/30';

        // Tailwind sometimes has trouble with dynamic class names like text-[#...] if they aren't pre-compiled
        // so we'll use style attribute for the specific colors if needed, but let's try classes first
        const statusColorClass = data.exitCode === 0 ? (isPy ? 'text-[#50fa7b]' : 'text-[#f1fa8c]') : 'text-[#ff5555]';
        const statusBorderClass = data.exitCode === 0 ? (isPy ? 'border-[#50fa7b]/30' : 'border-[#f1fa8c]/30') : 'border-[#ff5555]/30';

        let html = `
            <div class="max-w-[90%] p-4 bg-[#1e1f29] border ${statusBorderClass} rounded-xl shadow-2xl relative overflow-hidden">
                <div class="flex items-center justify-between mb-3 border-b border-[#44475a] pb-2">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-terminal ${statusColorClass}"></i>
                        <span class="text-[10px] font-black tracking-widest uppercase text-white/70">RESULTADO DE EJECUCIÓN ${isPy ? 'PYTHON' : 'JS'}</span>
                    </div>
                    <div class="text-[9px] font-mono ${statusColorClass} font-bold">
                        EXIT CODE: ${data.exitCode} ${data.timedOut ? '(TIMEOUT)' : ''}
                    </div>
                </div>
        `;

        if (data.stdout) {
            html += `
                <div class="mb-3">
                    <label class="text-[8px] font-bold text-[#6272a4] uppercase mb-1 block">STDOUT</label>
                    <pre class="p-2 bg-black/40 rounded text-[11px] font-mono text-[#f8f8f2] overflow-x-auto custom-scrollbar">${escapeHtml(data.stdout)}</pre>
                </div>
            `;
        }

        if (data.stderr) {
            html += `
                <div>
                    <label class="text-[8px] font-bold text-red-400 uppercase mb-1 block">STDERR</label>
                    <pre class="p-2 bg-red-900/10 rounded text-[11px] font-mono text-red-200 overflow-x-auto custom-scrollbar">${escapeHtml(data.stderr)}</pre>
                </div>
            `;
        }

        if (!data.stdout && !data.stderr) {
            html += `<div class="text-xs text-[#6272a4] italic">Sin salida en consola</div>`;
        }

        const envName = isPy ? 'PYTHON 3.10-SLIM' : 'NODE.JS 18-SLIM';

        html += `
                <div class="mt-3 flex justify-between items-center opacity-40">
                    <span class="text-[8px] font-mono uppercase tracking-tighter">SANDBOXED ${envName}</span>
                    <span class="text-[8px] font-mono">${new Date().toLocaleTimeString()}</span>
                </div>
            </div>
        `;

        msgDiv.innerHTML = html;
        window.chatMessages.appendChild(msgDiv);
        window.chatMessages.scrollTop = window.chatMessages.scrollHeight;
    }

    function logExecution(code, args, stdin, result) {
        try {
            const logs = JSON.parse(localStorage.getItem('hy_exec_log') || '[]');
            const entry = {
                codeSnippet: code.substring(0, 100),
                args: args || '',
                hasStdin: !!stdin,
                exitCode: result.exitCode,
                timedOut: result.timedOut,
                truncated: result.truncated,
                stdoutPreview: result.stdout ? result.stdout.substring(0, 100) : '',
                lang: currentPendingLang,
                timestamp: Date.now()
            };

            logs.unshift(entry);
            if (logs.length > 50) logs.pop();
            localStorage.setItem('hy_exec_log', JSON.stringify(logs));
        } catch (e) {
            console.warn('[ExecBridge] Logging failed:', e);
        }
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    return {
        init,
        confirmExecution,
        closeModal,
        runNow,
        b64EncodeUnicode,
        b64DecodeUnicode
    };

})();

// Auto-init on script load if marked is available, or wait for DOM
if (document.readyState === 'complete') {
    window.JulesExecBridge.init();
} else {
    window.addEventListener('load', window.JulesExecBridge.init);
}
