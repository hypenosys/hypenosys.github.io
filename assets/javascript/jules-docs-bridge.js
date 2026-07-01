/**
 * JULES DOCS BRIDGE
 * Provides a high-level API for Neural Chat to consume documentation context.
 */
window.DocsBridge = (function() {

    // Docs Context Toggle State
    window.isDocsEnabled = localStorage.getItem('hypenosys_docs_context_enabled') !== 'false';

    window.toggleDocsContext = function() {
        window.isDocsEnabled = !window.isDocsEnabled;
        localStorage.setItem('hypenosys_docs_context_enabled', window.isDocsEnabled);
        window.updateDocsStatusBadge();
        if (window.showToast) window.showToast(window.isDocsEnabled ? 'Documentación activada' : 'Documentación desactivada');
    };

    window.updateDocsStatusBadge = function() {
        const badge = document.getElementById('docs-status-badge');
        if (!badge) return;

        badge.onclick = window.toggleDocsContext;
        badge.style.cursor = 'pointer';
        badge.title = window.isDocsEnabled ? 'Click para desactivar búsqueda en docs' : 'Click para activar búsqueda en docs';

        if (window.isDocsEnabled) {
            badge.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border border-[#50fa7b]/20 bg-[#50fa7b]/10 text-[#50fa7b] transition-all';
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#50fa7b] shadow-[0_0_5px_#50fa7b]"></span> docs: on';
        } else {
            badge.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border border-[#6272a4]/20 bg-[#6272a4]/10 text-[#6272a4] transition-all opacity-70';
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#6272a4]"></span> docs: off';
        }
    };

    /**
     * Search documentation and build a context prompt
     */
    async function getContextForQuery(query, options = {}) {
        const limit = options.limit || 5;
        const maxFragments = options.maxFragments || 3;
        const maxChars = options.maxChars || 3000;

        try {
            const results = await window.DocsIndex.search(query, limit);

            if (!results || results.length === 0) return "";

            let context = "CONTEXTO DOCUMENTAL DE HYPENOSYS\n";
            context += "Usa estos fragmentos como fuente prioritaria. Si la respuesta no está cubierta por estos fragmentos, dilo explícitamente.\n\n";

            let totalChars = 0;

            for (const doc of results) {
                if (totalChars > maxChars) break;

                const docHeader = `[Documento: ${doc.path}]\n`;
                const docMeta = `Título: ${doc.title}\n` + (doc.tags?.length ? `Tags: ${doc.tags.join(', ')}\n` : '');

                let snippets = extractRelevantSnippets(doc.content, query, maxFragments);
                let docContent = snippets.join('\n...\n');

                const entry = docHeader + docMeta + "Fragmento:\n" + docContent + "\n\n";

                if (totalChars + entry.length > maxChars) {
                    // Try to fit at least some part or skip
                    if (maxChars - totalChars > 200) {
                        context += entry.substring(0, maxChars - totalChars) + "... [recortado]\n\n";
                    }
                    break;
                }

                context += entry;
                totalChars += entry.length;
            }

            return context;
        } catch (e) {
            console.error('[DocsBridge] Error building context:', e);
            return "";
        }
    }

    function extractRelevantSnippets(content, query, count) {
        if (!query) return [content.substring(0, 500)];

        const lines = content.split('\n');
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        const relevantLines = [];

        lines.forEach((line, index) => {
            const lowerLine = line.toLowerCase();
            const hasMatch = terms.some(t => lowerLine.includes(t));
            if (hasMatch) {
                // Get a few lines of context around the match
                const start = Math.max(0, index - 2);
                const end = Math.min(lines.length, index + 3);
                relevantLines.push(lines.slice(start, end).join('\n'));
            }
        });

        if (relevantLines.length === 0) return [content.substring(0, 500)];

        // De-duplicate and limit
        return Array.from(new Set(relevantLines)).slice(0, count);
    }

    /**
     * Get details for "Consulted Sources" UI
     */
    async function getSourceMetadata(results) {
        return results.map(doc => ({
            title: doc.title,
            path: doc.path,
            tags: doc.tags || [],
            url: `/documentacion/#${doc.path}`
        }));
    }

    return {
        getContextForQuery,
        getSourceMetadata,
        toggleDocsContext: window.toggleDocsContext,
        updateDocsStatusBadge: window.updateDocsStatusBadge,
        get isDocsEnabled() { return localStorage.getItem('hypenosys_docs_context_enabled') !== 'false'; }
    };
})();
