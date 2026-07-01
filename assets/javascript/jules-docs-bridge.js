/**
 * JULES DOCS BRIDGE
 * Provides a high-level API for Neural Chat to consume documentation context.
 */
window.DocsBridge = (function() {

    // Debug Flag
    window.HYPENOSYS_DOCS_DEBUG = localStorage.getItem('hypenosys_docs_debug') === 'true';

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

    /**
     * Unified RAG Prompt Builder
     * Centralizes documentation context injection for all chat interfaces.
     */
    async function buildSystemPrompt(userMessage, basePrompt, contextData = {}) {
        if (window.HYPENOSYS_DOCS_DEBUG) console.log("[NeuralSend] send started");

        let systemPrompt = basePrompt || "Eres un asistente técnico del estudio de videojuegos Hypenosys. Ayudas al equipo a planificar e implementar tareas de desarrollo. Responde siempre en español, de forma directa y técnica.";

        // Inject Task Context if provided
        const task = contextData.task || window._activeTaskContext;
        if (task) {
            const blockingInfo = (task.blocks && task.blocks.length > 0) ? `Bloquea a: ${task.blocks.join(', ')}` : 'No bloquea a nadie';
            const blockedByInfo = (task.blocked_by && task.blocked_by.length > 0) ? `Bloqueada por: ${task.blocked_by.join(', ')}` : 'No tiene bloqueos';

            systemPrompt += `\n\n## Tarea activa en contexto\n` +
                `ID: #${task.id}\n` +
                `Título: ${task.titulo || task.title}\n` +
                `Descripción: ${task.descripcion || task.description}\n` +
                `Criterios de Aceptación: ${task.acceptance_criteria || 'N/A'}\n` +
                `Subtareas: ${JSON.stringify(task.subtasks || [])}\n` +
                `Estado: ${task.estado || task.status}\n` +
                `Prioridad: ${task.prioridad || task.priority}\n` +
                `Rama: ${task.rama || 'N/A'}\n` +
                `Milestone: ${task.milestone || 'N/A'}\n` +
                `Repositorio: ${task.repository || task.repo || 'N/A'}\n` +
                `Dependencias: ${blockingInfo} | ${blockedByInfo}\n`;
        }

        // Hybrid Docs Search Integration with Timeout
        const docsEnabled = localStorage.getItem('hypenosys_docs_context_enabled') !== 'false';
        if (window.HYPENOSYS_DOCS_DEBUG) console.log("[NeuralSend] docs enabled: " + docsEnabled);

        if (docsEnabled && window.DocsIndex) {
            try {
                if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] getDocContext started");

                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('DocsBridge timeout')), 3500)
                );

                const docsLogic = async () => {
                    const results = await window.DocsIndex.search(userMessage, 5);
                    if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] results count: " + (results?.length || 0));

                    if (results && results.length > 0) {
                        const docsContext = await getContextForQuery(userMessage, { limit: 5 });
                        if (docsContext) {
                            const guardrail = "\n\nUsa únicamente el CONTEXTO DOCUMENTAL DE HYPENOSYS para responder sobre la documentación.\nNo inventes carpetas, tecnologías, herramientas, estructura del repositorio ni contenido no presente en las fuentes.\nSi el contexto no contiene la respuesta, dilo explícitamente.\n\n";

                            if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] context chars: " + docsContext.length);
                            if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] injected: true");

                            window._lastDocsMetadata = await getSourceMetadata(results);
                            return "\n\n" + docsContext + guardrail;
                        }
                    } else {
                        // Structural fallback
                        const isAskingStructure = /organiza|estructura|carpetas|folders|donde esta|dónde está/i.test(userMessage);
                        if (isAskingStructure) {
                            const allDocs = await window.DocsIndex.getAllDocs();
                            if (allDocs && allDocs.length > 0) {
                                const directories = new Set();
                                allDocs.forEach(d => {
                                    const parts = d.path.split('/');
                                    if (parts.length > 1) directories.add(parts[0]);
                                });
                                if (directories.size > 0) {
                                    const dirList = Array.from(directories).sort().join('\n- ');
                                    if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] injected structure fallback: true");
                                    return "\n\nCONTEXTO DE ESTRUCTURA REAL (hypenosys/docs):\nEl repositorio está organizado en las siguientes carpetas principales:\n- " + dirList + "\n\nInstrucción: Usa esta lista real para responder sobre la organización. No inventes otras carpetas.\n";
                                }
                            }
                        }

                        const fallbackGuardrail = "\n\nNo hay contexto documental suficiente disponible para responder con certeza sobre la documentación de Hypenosys.\nNo inventes información sobre la estructura del repositorio ni carpetas que no conozcas.\nSi te preguntan por la estructura y no tienes fragmentos que la describan, indica que no tienes acceso a esa información ahora mismo.\n";
                        if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] injected fallback guardrail: true");
                        return fallbackGuardrail;
                    }
                    return "";
                };

                const docsPromptFragment = await Promise.race([docsLogic(), timeoutPromise]);
                systemPrompt += docsPromptFragment;

            } catch (e) {
                console.warn("[DocsBridge] Failed, continuing without docs", e);
                if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] error: " + e.message);
            }
        }

        if (window.HYPENOSYS_DOCS_DEBUG) console.log("[NeuralSend] sending to provider");
        return systemPrompt;
    }

    /**
     * Runtime Debug Utilities
     */
    window.HypenosysDocsDebug = {
        getStatus: async () => {
            const docs = await window.DocsIndex.getAllDocs();
            const sha = await window.HypenosysDocsClient.getLatestCommitSha();
            return {
                enabled: window.isDocsEnabled,
                indexedDocs: docs.length,
                latestSha: sha,
                debugMode: window.HYPENOSYS_DOCS_DEBUG
            };
        },
        listIndexedPaths: async () => {
            const docs = await window.DocsIndex.getAllDocs();
            return docs.map(d => d.path).sort();
        },
        clearCache: async () => {
            await window.DocsIndex.clearIndex();
            console.log('[DocsDebug] Cache cleared');
        },
        rebuildIndex: async () => {
            console.log('[DocsDebug] Rebuilding index...');
            return await window.DocsIndex.rebuildIndex(m => console.log(`[DocsDebug] ${m}`));
        },
        testQuery: async (query) => {
            const results = await window.DocsIndex.search(query);
            console.log(`[DocsDebug] Search results for "${query}":`, results);
            const context = await getContextForQuery(query);
            console.log(`[DocsDebug] Generated context:`, context);
            return { results, context };
        }
    };

    return {
        getContextForQuery,
        getSourceMetadata,
        buildSystemPrompt,
        toggleDocsContext: window.toggleDocsContext,
        updateDocsStatusBadge: window.updateDocsStatusBadge,
        get isDocsEnabled() { return localStorage.getItem('hypenosys_docs_context_enabled') !== 'false'; }
    };
})();
