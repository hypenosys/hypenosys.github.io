/**
 * JULES SVN BRIDGE
 * Provides SVN repository context to Neural Chat via n8n webhooks.
 * This bridge reuses credentials and endpoints from repo-admin settings (Read-Only).
 */
window.JulesSvnBridge = (function() {

    // Persistent state: hypenosys_svn_context_enabled
    let _isSvnEnabled = localStorage.getItem('hypenosys_svn_context_enabled') === 'true';

    // Default to false if no repo-admin settings found to avoid dead calls
    const hasRepoSettings = !!localStorage.getItem('hypenosys_repoAdmin');
    if (!hasRepoSettings) {
        _isSvnEnabled = false;
        localStorage.setItem('hypenosys_svn_context_enabled', 'false');
    }

    window.toggleSvnContext = function() {
        if (!_isSvnEnabled) {
            // Guard: Check if all SVN endpoints are configured before enabling
            try {
                const settings = JSON.parse(localStorage.getItem('hypenosys_repoAdmin') || '{}');
                const endpoints = settings.endpoints || {};
                const required = ['svn-list', 'svn-log', 'svn-info', 'svn-diff', 'svn-cat'];
                const missing = required.some(k => !endpoints[k]);

                if (missing) {
                    if (window.showToast) window.showToast('SVN no configurado en repo-admin', 'amber');
                    return;
                }
            } catch(e) {
                if (window.showToast) window.showToast('Error al leer configuración SVN', 'red');
                return;
            }
        }

        _isSvnEnabled = !_isSvnEnabled;
        localStorage.setItem('hypenosys_svn_context_enabled', _isSvnEnabled);
        window.updateSvnStatusBadge();
        if (window.showToast) window.showToast(_isSvnEnabled ? 'Contexto SVN activado' : 'Contexto SVN desactivado');
    };

    window.updateSvnStatusBadge = function() {
        const badge = document.getElementById('svn-status-badge');
        if (!badge) return;

        badge.onclick = window.toggleSvnContext;
        badge.style.cursor = 'pointer';
        badge.title = _isSvnEnabled ? 'Click para desactivar contexto SVN' : 'Click para activar contexto SVN';

        if (_isSvnEnabled) {
            // Dracula Red/Pink palette for SVN ON (as per design system consistency)
            badge.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border border-[#ff5555]/20 bg-[#ff5555]/10 text-[#ff5555] transition-all';
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#ff5555] shadow-[0_0_5px_#ff5555]"></span> svn: on';
        } else {
            // Reuses exact classes from docs:off for visual parity
            badge.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border border-[#6272a4]/20 bg-[#6272a4]/10 text-[#6272a4] transition-all opacity-70';
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#6272a4]"></span> svn: off';
        }
    };

    /**
     * Isolated API Call for SVN webhooks (Read-only access to repo-admin localStorage key)
     * No dependencies on repo-admin-*.js files to avoid side effects.
     */
    async function svnBridgeApiCall(endpointKey, body) {
        let settings = {};
        try {
            settings = JSON.parse(localStorage.getItem('hypenosys_repoAdmin') || '{}');
        } catch(e) { return null; }

        const url = settings.endpoints ? settings.endpoints[endpointKey] : null;

        if (!url) {
            console.warn(`[SvnBridge] Endpoint "${endpointKey}" not configured in repo-admin.`);
            return null;
        }

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...body,
                    user: settings.svnUser || 'SVN_USERNAME',
                    password: settings.svnPass || 'SVN_PASSWORD'
                }),
                signal: AbortSignal.timeout(15000)
            });
            if (!res.ok) return null;
            const data = await res.json();
            return data.error ? null : data;
        } catch (e) {
            console.error(`[SvnBridge] API Call failed for ${endpointKey}:`, e);
            return null;
        }
    }

    /**
     * Path Extraction Heuristic (Phase 2 Refined)
     * Extracts folder/file from query tokens appearing AFTER the matched intent.
     */
    function extractPath(query, intentMatch) {
        if (!intentMatch) return '';

        const afterMatch = query.split(intentMatch)[1] || '';
        const tokens = afterMatch.trim().split(/\s+/).filter(Boolean);

        if (!tokens.length) return '';

        for (let i = 0; i < tokens.length; i++) {
            let token = tokens[i].replace(/[?¿!¡,.;:]/g, '');

            // Client-side Sanitization: defense in depth
            if (token.includes('..')) continue;

            // Heuristic A: After "carpeta", "archivo", "fichero", "en"
            const prevToken = i > 0 ? tokens[i-1].toLowerCase() : '';
            if (['carpeta', 'archivo', 'fichero', 'en'].includes(prevToken)) return token;

            // Heuristic B: Has file extension
            if (/\.(cs|json|uasset|umap|cpp|h|ini|cfg|png|jpg|wav|mp3|fbx|obj|md|txt)$/i.test(token)) return token;

            // Heuristic C: Capitalized word (likely Unreal/Unity folder/file), but skip first word of message
            // Note: Since we are scanning after intentMatch, tokens[0] is NOT necessarily the first word of the message.
            // But we already restricted scan to AFTER intentMatch.
            if (/^[A-Z][a-zA-Z0-9_\-\/.]+$/.test(token)) return token;
        }
        return '';
    }

    /**
     * getSvnContext(query)
     *
     * Heuristic Intent Detection:
     * - "diff": keywords [cambios, diff, diferencia, qué cambió] -> calls svn-diff
     * - "log": keywords [log, historial, commit, quién tocó] -> calls svn-log
     * - "list": keywords [archivos, qué hay, lista, carpetas, estructura] -> calls svn-list
     * - "read": keywords [resume, resumen, analiza, qué hace, contenido de, abre, muestra el archivo] -> calls svn-cat
     * - "info": keywords [info, revisión, revision, rev, estado del repo] -> calls svn-info
     *
     * FALLBACK: If no keywords match, returns an empty string ("") to avoid polluting
     * the prompt with irrelevant context and to prevent unnecessary n8n traffic.
     */
    async function getSvnContext(userMessage) {
        if (!_isSvnEnabled) return "";

        const query = userMessage.toLowerCase();
        let context = "\n\n## CONTEXTO SVN (trunk/Hypenosys)\n";
        let data = null;
        let matchedIntent = null;
        let path = '';

        try {
            if (/(cambios|diff|diferencia|qué cambió|que cambio)/i.test(query)) {
                matchedIntent = query.match(/(cambios|diff|diferencia|qué cambió|que cambio)/i)[0];
                path = extractPath(userMessage, matchedIntent);
                // Intent: Diff (Summary of changes)
                data = await svnBridgeApiCall('svn-diff', { path, rev1: 'PREV', rev2: 'HEAD' });
                if (data && data.diff) {
                    let diffText = data.diff;
                    if (diffText.length > 2500) {
                        diffText = diffText.substring(0, 2500) + "\n[CONTENIDO TRUNCADO]";
                    }
                    context += `Cambios detectados en ${path || 'raíz'} (svn diff):\n` + diffText + "\n";
                }
            }
            else if (/(log|historial|commit|quién tocó|quien toco)/i.test(query)) {
                matchedIntent = query.match(/(log|historial|commit|quién tocó|quien toco)/i)[0];
                path = extractPath(userMessage, matchedIntent);
                // Intent: Log (Last 5 commits)
                data = await svnBridgeApiCall('svn-log', { path, limit: 5 });
                if (data && data.log) {
                    context += `Historial reciente en ${path || 'raíz'} (svn log):\n` + data.log.map(e => `r${e.revision} | ${e.author} | ${e.date}\nMsg: ${e.message}`).join('\n---\n') + "\n";
                }
            }
            else if (/(archivos|qué hay|que hay|lista|carpetas|estructura)/i.test(query)) {
                matchedIntent = query.match(/(archivos|qué hay|que hay|lista|carpetas|estructura)/i)[0];
                path = extractPath(userMessage, matchedIntent);
                // Intent: List (Structure)
                data = await svnBridgeApiCall('svn-list', { path });
                if (data && data.entries) {
                    context += `Estructura de archivos en ${path || 'raíz'} (svn list):\n` + data.entries.map(e => `- ${e.name}${e.kind === 'dir' ? '/' : ''} (r${e.revision})`).join('\n') + "\n";
                }
            }
            else if (/(resume|resumen|analiza|qué hace|que hace|contenido de|abre|muestra el archivo)/i.test(query)) {
                matchedIntent = query.match(/(resume|resumen|analiza|qué hace|que hace|contenido de|abre|muestra el archivo)/i)[0];
                path = extractPath(userMessage, matchedIntent);
                if (!path) return ""; // Cat requires a path
                // Intent: Read (File content)
                data = await svnBridgeApiCall('svn-cat', { path });
                if (data && data.content) {
                    let content = data.content;
                    if (content.length > 2500) {
                        content = content.substring(0, 2500) + "\n[CONTENIDO TRUNCADO]";
                    }
                    context += `Contenido del archivo ${path} (svn cat):\n` + content + "\n";
                }
            }
            else if (/info|revisión|revision|rev|estado del repo/i.test(query)) {
                // Intent: Info (General repo status)
                data = await svnBridgeApiCall('svn-info', {});
                if (data && data.revision) {
                    context += `Repositorio en revisión: r${data.revision}\nURL: ${data.url}\nÚltimo cambio por: ${data.last_changed_author} (r${data.last_changed_rev})\n`;
                }
            }
            else {
                // FALLBACK: No intent detected
                return "";
            }

            if (!data) return ""; // Fail-silent if API returned error

            context += "\nInstrucción: Usa esta información técnica real del repositorio para responder con precisión. Si la información no es suficiente, indícalo.\n\n";
            return context;

        } catch (e) {
            console.error("[SvnBridge] Error in getSvnContext:", e);
            return "";
        }
    }

    return {
        getSvnContext,
        toggleSvnContext: window.toggleSvnContext,
        updateSvnStatusBadge: window.updateSvnStatusBadge,
        get isSvnEnabled() { return localStorage.getItem('hypenosys_svn_context_enabled') === 'true'; }
    };
})();
