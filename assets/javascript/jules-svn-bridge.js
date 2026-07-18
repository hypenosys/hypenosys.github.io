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
            const res = await window.hypenosysFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...body,
                    svnUrl: settings.svnUrl || 'svn://example.com/repo',
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
     * PRODUCTION-GRADE PATH EXTRACTION (Spanish natural language)
     * Priority: strong unambiguous signals first, weak trigger-word heuristic last.
     */

    // Spanish stopwords/articles to skip when scanning after a trigger word
    const STOPWORDS_ES = new Set([
        'de', 'del', 'al', 'el', 'la', 'los', 'las',
        'un', 'una', 'unos', 'unas', 'en', 'y', 'o', 'su', 'sus'
    ]);

    // Common capitalized acronyms that are NOT folder/file paths — exclude as false positives
    const CAPITALIZED_EXCLUDE = new Set([
        'SVN', 'GIT', 'HTTP', 'HTTPS', 'API', 'URL', 'JSON',
        'HEAD', 'PREV', 'UE5', 'NPC', 'NPCS', 'UI', 'ID'
    ]);

    // Trigger words that typically precede a folder/file name
    const RE_TRIGGER_WORDS = /\b(carpeta|archivo|fichero|directorio|script|subcarpeta|subdirectorio)s?\b/i;

    // Signal patterns, strongest to weakest
    const RE_FILE_WITH_EXT       = /^[A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_\-]+)*\.[A-Za-z0-9]{1,6}$/;
    const RE_MULTI_SEGMENT_PATH  = /^[A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_\-]+)+$/;
    const RE_CAPITALIZED_FOLDER  = /^[A-Z][A-Za-z0-9_\-]{1,40}$/;

    function stripPunct(token) {
        return token.replace(/^[¿?¡!,;:]+|[¿?¡!,;:]+$/g, '');
    }

    function extractPath(rawQuery) {
        const cleaned = rawQuery.trim();
        const tokens = cleaned.split(/\s+/).filter(Boolean).map(stripPunct).filter(Boolean);

        const isSafe = (t) => t && !t.includes('..'); // path traversal guard, defense in depth

        // PASS 1 — strongest signal: filename with extension, anywhere in the message
        for (const t of tokens) {
            if (isSafe(t) && RE_FILE_WITH_EXT.test(t)) return t;
        }

        // PASS 2 — multi-segment path (contains "/"), anywhere in the message
        for (const t of tokens) {
            if (isSafe(t) && RE_MULTI_SEGMENT_PATH.test(t)) return t;
        }

        // PASS 3 — word immediately after a trigger word, skipping Spanish articles/stopwords
        const triggerIdx = tokens.findIndex(t => RE_TRIGGER_WORDS.test(t));
        if (triggerIdx !== -1) {
            for (let i = triggerIdx + 1; i < tokens.length; i++) {
                const t = tokens[i];
                if (!isSafe(t)) continue;
                if (STOPWORDS_ES.has(t.toLowerCase())) continue;
                if (t.length < 2) continue;
                return t;
            }
        }

        // PASS 4 — fallback: standalone capitalized word, never the first token of the message
        for (let i = 1; i < tokens.length; i++) {
            const t = tokens[i];
            if (!isSafe(t)) continue;
            if (!RE_CAPITALIZED_FOLDER.test(t)) continue;
            if (STOPWORDS_ES.has(t.toLowerCase())) continue;
            if (CAPITALIZED_EXCLUDE.has(t.toUpperCase())) continue;
            return t;
        }

        return '';
    }

    /**
     * getSvnContext(userMessage)
     *
     * Heuristic Intent Detection:
     * - "diff": keywords [cambios, diff, diferencia, qué cambió] -> calls svn-diff
     * - "log": keywords [log, historial, commit, quién tocó] -> calls svn-log
     * - "list": keywords [archivos, qué hay, lista, carpetas, estructura] -> calls svn-list
     * - "read": keywords [resume, resumen, analiza, qué hace, contenido de, abre, muestra el archivo] -> calls svn-cat
     * - "info": keywords [info, revisión, revision, rev, estado del repo] -> calls svn-info
     */
    async function getSvnContext(userMessage) {
        if (!_isSvnEnabled) return "";

        const query = userMessage.toLowerCase();
        const header = "\n\n## CONTEXTO SVN (trunk/Hypenosys)\n";
        const footer = "\nInstrucción: Usa esta información técnica real del repositorio para responder con precisión. Si la información no es suficiente, indícalo.\n\n";
        let path = extractPath(userMessage);

        try {
            // Intent: Diff (Summary of changes)
            if (/(cambios|diff|diferencia|qué cambió|que cambio)/i.test(query)) {
                const data = await svnBridgeApiCall('svn-diff', { path, rev1: 'PREV', rev2: 'HEAD' });
                if (data && data.diff) {
                    let diffText = data.diff;
                    if (diffText.length > 2500) {
                        diffText = diffText.substring(0, 2500) + "\n[CONTENIDO TRUNCADO]";
                    }
                    return header + `Cambios detectados en ${path || 'raíz'} (svn diff):\n` + diffText + footer;
                }
                console.warn(`[SvnBridge] Failed to fetch data from svn-diff for path: ${path || 'raíz'}`);
                return header + `[No se pudo obtener información de '${path || "raíz"}' — verifica que la ruta existe o que el servicio SVN esté disponible]\n\n`;
            }

            // Intent: Log (Last 5 commits)
            else if (/(log|historial|commit|quién tocó|quien toco)/i.test(query)) {
                const data = await svnBridgeApiCall('svn-log', { path, limit: 5 });
                if (data && data.log) {
                    const logEntries = data.log.map(e => `r${e.revision} | ${e.author} | ${e.date}\nMsg: ${e.message}`).join('\n---\n');
                    return header + `Historial reciente en ${path || 'raíz'} (svn log):\n` + logEntries + footer;
                }
                console.warn(`[SvnBridge] Failed to fetch data from svn-log for path: ${path || 'raíz'}`);
                return header + `[No se pudo obtener información de '${path || "raíz"}' — verifica que la ruta existe o que el servicio SVN esté disponible]\n\n`;
            }

            // Intent: List (Structure)
            else if (/(archivos|qué hay|que hay|lista|carpetas|estructura)/i.test(query)) {
                const data = await svnBridgeApiCall('svn-list', { path });
                if (data && data.entries) {
                    const listEntries = data.entries.map(e => `- ${e.name}${e.kind === 'dir' ? '/' : ''} (r${e.revision})`).join('\n');
                    return header + `Estructura de archivos en ${path || 'raíz'} (svn list):\n` + listEntries + footer;
                }
                console.warn(`[SvnBridge] Failed to fetch data from svn-list for path: ${path || 'raíz'}`);
                return header + `[No se pudo obtener información de '${path || "raíz"}' — verifica que la ruta existe o que el servicio SVN esté disponible]\n\n`;
            }

            // Intent: Read (File content - svn-cat)
            else if (/(resume|resumen|analiza|qué hace|que hace|contenido de|abre|muestra el archivo)/i.test(query)) {
                if (!path) {
                    return header + "[No se especificó qué archivo leer — indica el nombre del archivo, ej: \"resume generate_race.py\"]\n\n";
                }
                const data = await svnBridgeApiCall('svn-cat', { path });
                if (data && data.content) {
                    let content = data.content;
                    if (content.length > 2500) {
                        content = content.substring(0, 2500) + "\n[CONTENIDO TRUNCADO]";
                    }
                    return header + `Contenido del archivo ${path} (svn cat):\n` + content + footer;
                }
                console.warn(`[SvnBridge] Failed to fetch data from svn-cat for path: ${path}`);
                return header + `[No se pudo obtener información de '${path}' — verifica que la ruta existe o que el servicio SVN esté disponible]\n\n`;
            }

            // Intent: Info (General repo status)
            else if (/info|revisión|revision|rev|estado del repo/i.test(query)) {
                const data = await svnBridgeApiCall('svn-info', {});
                if (data && data.revision) {
                    return header + `Repositorio en revisión: r${data.revision}\nURL: ${data.url}\nÚltimo cambio por: ${data.last_changed_author} (r${data.last_changed_rev})` + footer;
                }
                console.warn(`[SvnBridge] Failed to fetch data from svn-info`);
                return header + `[No se pudo obtener información de 'raíz' — verifica que la ruta existe o que el servicio SVN esté disponible]\n\n`;
            }

            // FALLBACK: No intent detected
            else {
                return "";
            }

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
