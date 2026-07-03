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
                const required = ['svn-list', 'svn-log', 'svn-info', 'svn-diff'];
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
     * getSvnContext(query)
     *
     * Heuristic Intent Detection:
     * - "diff": keywords [cambios, diff, diferencia, qué cambió] -> calls svn-diff
     * - "log": keywords [log, historial, commit, quién tocó] -> calls svn-log
     * - "list": keywords [archivos, qué hay, lista, carpetas, estructura] -> calls svn-list
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

        try {
            if (/cambios|diff|diferencia|qué cambió|que cambio/i.test(query)) {
                // Intent: Diff (Summary of latest changes)
                data = await svnBridgeApiCall('svn-diff', { path: '', rev1: 'PREV', rev2: 'HEAD' });
                if (data && data.diff) {
                    context += "Últimos cambios detectados (svn diff):\n" + data.diff.substring(0, 2500) + "\n";
                }
            }
            else if (/log|historial|commit|quién tocó|quien toco/i.test(query)) {
                // Intent: Log (Last 5 commits)
                data = await svnBridgeApiCall('svn-log', { path: '', limit: 5 });
                if (data && data.log) {
                    context += "Historial reciente de commits (svn log):\n" + data.log.map(e => `r${e.revision} | ${e.author} | ${e.date}\nMsg: ${e.message}`).join('\n---\n') + "\n";
                }
            }
            else if (/archivos|qué hay|que hay|lista|carpetas|estructura/i.test(query)) {
                // Intent: List (Root structure)
                data = await svnBridgeApiCall('svn-list', { path: '' });
                if (data && data.entries) {
                    context += "Estructura de archivos en raíz (svn list):\n" + data.entries.map(e => `- ${e.name}${e.kind === 'dir' ? '/' : ''} (r${e.revision})`).join('\n') + "\n";
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
