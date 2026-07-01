/* ════════════════════════════════════════
   NEURAL CHAT UI & MESSAGING
   ════════════════════════════════════════ */

// DOM References (assigned in IIFE)
window.chatMessages = null;
window.chatInput = null;
window.sendBtn = null;
window.thinkingIndicator = null;
window.toggleThinkingBtn = null;

window.showToast = function(msg) {
    if (window.hypeToast) {
        window.hypeToast(msg, 'info');
        return;
    }
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-[#44475a] text-white px-4 py-2 rounded-lg text-xs font-bold border border-[#bd93f9]/50 shadow-2xl z-[9999]';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

window.appendSystemMessage = function(msg, type = 'error') {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'flex justify-center mb-4';
    const bgColor = type === 'error' ? 'bg-red-900/20' : 'bg-blue-900/20';
    const borderColor = type === 'error' ? 'border-red-500' : 'border-blue-500';
    const textColor = type === 'error' ? 'text-red-200' : 'text-blue-200';

    msgDiv.innerHTML = `
        <div class="max-w-[90%] p-3 rounded-lg border-l-4 ${bgColor} ${borderColor} ${textColor} text-xs font-mono shadow-lg">
            <div class="flex items-center gap-2 mb-1 uppercase font-black tracking-tighter opacity-70">
                <i class="fas ${type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
                SYSTEM MESSAGE: ${type}
            </div>
            <div>${escapeHtml(msg)}</div>
        </div>
    `;
    window.chatMessages.appendChild(msgDiv);
    window.chatMessages.scrollTop = window.chatMessages.scrollHeight;
}

window.renderMessages = function() {
    const currentSession = window.sessions.find(s => s.id === window.currentSessionId) || window.archivedSessions.find(s => s.id === window.currentSessionId);
    if (!currentSession) {
        window.chatMessages.innerHTML = '';
        return;
    }

    if (currentSession.messages.length === 0) {
        document.getElementById('welcome-screen')?.classList.remove('hidden');
        window.chatMessages.innerHTML = '';
        return;
    } else {
        document.getElementById('welcome-screen')?.classList.add('hidden');
    }

    window.chatMessages.innerHTML = currentSession.messages.map((m, idx) => {
        let content = m.content;
        let reasoningHtml = '';

        const isUser = m.role === 'user';
        const isJules = m.source === 'jules' || m.role === 'agent' || m.role === 'jules';
        const label = isUser ? 'USER' : (isJules ? 'JULES' : 'CLAUDE');
        const labelColor = isUser ? 'text-[#f8f8f2]' : (isJules ? 'text-[#6272a4]' : 'text-[#bd93f9]');
        const bubbleClass = isUser ? 'message-user' : (isJules ? 'message-claude border-[#44475a] border shadow-none bg-[#1a1b26]' : 'message-claude shadow-xl');

        // Handle <think> blocks for Reasoning
        if (content && typeof content === 'string' && content.includes('<think>')) {
            const parts = content.split(/<\/?think>/);
            if (parts.length >= 3) {
                const reasoning = parts[1];
                content = parts.slice(2).join('');
                reasoningHtml = `
                    <details class="mb-4 border-l-2 border-orange-400 bg-orange-400/5 rounded-r-lg overflow-hidden">
                        <summary class="p-2 text-[10px] font-bold text-orange-400 cursor-pointer hover:bg-orange-400/10 transition-all uppercase tracking-widest">
                            <i class="fas fa-brain mr-2"></i> Razonamiento interno
                        </summary>
                        <div class="p-3 text-xs text-orange-200/70 italic bg-black/20">
                            ${escapeHtml(reasoning)}
                        </div>
                    </details>
                `;
            }
        }

        // Handle Safety classification
        let safetyBadge = '';
        if (m.flagged || m.categories) {
            safetyBadge = `<div class="mb-2 px-2 py-1 rounded bg-red-500/20 border border-red-500/50 text-red-400 text-[9px] font-bold uppercase tracking-widest">⚠️ SAFETY ALERT: FLAG DETECTED</div>`;
        }

        // Handle Consulted Sources (Docs Bridge)
        let docsSourcesHtml = '';
        if (m.role === 'assistant' && m.sources && m.sources.length > 0) {
            const readStatusCount = m.sources.filter(s => s.readStatus === 'completo' || s.readStatus === 'truncado').length;
            const contextLabel = readStatusCount > 0 ? `Docs Context · ${readStatusCount} documentos leídos` : `Docs Context · ${m.sources.length} fragmentos`;

            docsSourcesHtml = `
                <div class="mt-4 border-t border-[#44475a]/30 pt-3">
                    <details class="docs-sources-details">
                        <summary class="text-[10px] font-bold text-[#6272a4] cursor-pointer hover:text-[#bd93f9] transition-all flex items-center gap-2 uppercase tracking-widest">
                            <i class="fas fa-book-open"></i> ${contextLabel}
                        </summary>
                        <div class="mt-2 space-y-2">
                            ${m.sources.map(s => {
                                const statusColor = s.readStatus === 'completo' ? 'text-[#50fa7b]' : (s.readStatus === 'truncado' ? 'text-[#ffb86c]' : 'text-indigo-400');
                                return `
                                <a href="${s.url}" target="_blank" class="block p-2 bg-[#1e1f29] rounded border border-[#44475a]/50 hover:border-[#bd93f9]/50 transition-all group/source">
                                    <div class="flex justify-between items-start mb-1">
                                        <span class="text-[10px] font-bold ${statusColor} truncate">${s.title}</span>
                                        <i class="fas fa-external-link-alt text-[8px] text-[#6272a4] group-hover/source:text-[#bd93f9]"></i>
                                    </div>
                                    <div class="flex justify-between items-center">
                                        <div class="text-[8px] text-[#6272a4] font-mono truncate">${s.path}</div>
                                        <div class="text-[7px] font-bold uppercase ${statusColor} opacity-70">${s.readStatus || 'fragmento'}</div>
                                    </div>
                                </a>
                                `;
                            }).join('')}
                        </div>
                    </details>
                </div>
            `;
        }

        return `
        <div class="flex ${isUser ? 'justify-end' : 'justify-start'} group mb-4">
            <div class="max-w-[85%] p-4 ${bubbleClass} relative message-bubble">
                <div class="text-[10px] font-black tracking-widest uppercase mb-2 ${labelColor} opacity-70">
                    ${label}
                </div>
                ${safetyBadge}
                ${m.thinking ? `<div class="thinking-block">${escapeHtml(m.thinking)}</div>` : ''}
                ${reasoningHtml}
                <div class="prose prose-invert text-sm prose-pre:bg-[#1e1f29] prose-pre:border prose-pre:border-[#44475a] selection:bg-[#bd93f9]/30">
                    ${content ? marked.parse(content) : ''}
                </div>

                ${docsSourcesHtml}

                ${!isUser ? `
                <div class="message-actions opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-6 left-0 flex gap-2">
                    <button onclick="copyMessage(${idx})" class="text-[9px] font-bold text-[#6272a4] hover:text-[#bd93f9] flex items-center gap-1 bg-[#1e1f29] px-2 py-0.5 rounded border border-[#44475a]">
                        <i class="fas fa-copy"></i> COPIAR
                    </button>
                    <button onclick="sendToJulesByIndex(${idx})" class="text-[9px] font-bold text-[#6272a4] hover:text-[#50fa7b] flex items-center gap-1 bg-[#1e1f29] px-2 py-0.5 rounded border border-[#44475a]">
                        <i class="fas fa-arrow-right"></i> → ENVIAR A JULES
                    </button>
                </div>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');
    window.chatMessages.scrollTop = window.chatMessages.scrollHeight;
}

window.toggleMobileSidebar = function() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

window.closeSidebar = function() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

window.toggleSidebarCollapse = function() {
    const sidebar = document.getElementById('neural-sidebar');
    const chevron = document.getElementById('sidebar-chevron');
    const isCollapsed = sidebar.classList.toggle('collapsed');

    // Update icon
    if (isCollapsed) {
        chevron.classList.replace('fa-chevron-left', 'fa-chevron-right');
    } else {
        chevron.classList.replace('fa-chevron-right', 'fa-chevron-left');
    }

    // Persist state
    localStorage.setItem('hy_neural_sidebar_collapsed', isCollapsed);
}

// Initialize sidebar state on load
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('neural-sidebar');
    const chevron = document.getElementById('sidebar-chevron');
    const wasCollapsed = localStorage.getItem('hy_neural_sidebar_collapsed') === 'true';

    if (wasCollapsed && sidebar) {
        sidebar.classList.add('collapsed');
        if (chevron) chevron.classList.replace('fa-chevron-left', 'fa-chevron-right');
    }
});

window.showConfirmationToast = function(message, onConfirm) {
    const container = document.getElementById('hype-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'confirm-toast hype-toast--visible pointer-events-auto mb-4 animate-slide-up';
    toast.innerHTML = `
        <div class="text-sm font-bold text-white mb-1">Confirmar acción</div>
        <div class="text-xs text-[#6272a4]">${message}</div>
        <div class="confirm-toast-buttons">
            <button id="confirm-btn" class="flex-grow py-2 bg-[#ff5555] text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-all uppercase tracking-widest">Eliminar</button>
            <button id="cancel-btn" class="flex-grow py-2 bg-[#44475a] text-white text-[10px] font-bold rounded-lg hover:bg-[#6272a4] transition-all uppercase tracking-widest">Cancelar</button>
        </div>
    `;

    container.appendChild(toast);

    toast.querySelector('#confirm-btn').onclick = () => {
        onConfirm();
        toast.remove();
    };
    toast.querySelector('#cancel-btn').onclick = () => {
        toast.remove();
    };
}

window.handleSlashCommand = function(command) {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    switch(cmd) {
        case '/tarea':
            appendSystemMessage('Comando detectado: /tarea. El asistente God Mode procesará tu descripción.', 'info');
            window.chatInput.value = 'Crea una tarea: ' + args;
            sendMessage();
            break;
        case '/move':
            appendSystemMessage('Comando detectado: /move. Indica ID y estado.', 'info');
            break;
        case '/jules':
            window.location.href = '/jules-panel/';
            break;
        default:
            appendSystemMessage('Comando desconocido: ' + cmd, 'error');
    }
}

window.openSystemPrompt = function() {
    document.getElementById('system-prompt-modal').classList.remove('hidden');
}
window.closeSystemPrompt = function() {
    document.getElementById('system-prompt-modal').classList.add('hidden');
}
window.saveSystemPrompt = function() {
    const val = document.getElementById('system-prompt-input').value;
    const currentSession = window.sessions.find(s => s.id === window.currentSessionId);
    if (currentSession) {
        currentSession.systemPrompt = val;
        saveSessions();
    }
    closeSystemPrompt();
}

window.openSettings = function() { window.authManager.showApiConfigModal(); }

window.quickPrompt = function(text) {
    window.chatInput.value = text;
    sendMessage();
}

window.toggleDebugPanel = function() {
    const log = document.getElementById('debug-log');
    const chev = document.getElementById('debug-chevron');
    if (log.classList.contains('hidden')) {
        log.classList.remove('hidden');
        chev.classList.replace('fa-chevron-down', 'fa-chevron-up');
    } else {
        log.classList.add('hidden');
        chev.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
}

window.logDebug = function(msg, type = 'info') {
    const log = document.getElementById('debug-log');
    const time = new Date().toLocaleTimeString();
    // Assuming debugEvents is global or not strictly needed to be shared
    const color = type === 'error' ? 'text-red-400' : (type === 'warn' ? 'text-yellow-400' : 'text-[#50fa7b]');

    const entry = document.createElement('div');
    entry.className = `border-b border-[#44475a]/30 pb-1 mb-1 ${color}`;
    entry.innerHTML = `<span class="opacity-40">[${time}]</span> <span class="font-bold">${type.toUpperCase()}:</span> ${escapeHtml(msg)}`;

    log.prepend(entry);
    if (log.children.length > 50) {
        log.lastElementChild.remove();
    }

    if (type === 'error') {
        document.getElementById('debug-panel').classList.remove('hidden');
    }
}

window.buildSystemPrompt = async function(userMessage, basePrompt) {
    if (window.HYPENOSYS_DOCS_DEBUG) console.log("[NeuralSend] send started");

    const docKeywords = ['documentación', 'docs', 'readme', 'manual', 'cómo funciona', 'qué es', 'explica', 'describe'];
    const needsDocs = docKeywords.some(k => userMessage.toLowerCase().includes(k));

    let systemPrompt = basePrompt || "Eres un asistente técnico del estudio de videojuegos Hypenosys. Ayudas al equipo a planificar e implementar tareas de desarrollo. Responde siempre en español, de forma directa y técnica.";

    if (window._activeTaskContext) {
        const t = window._activeTaskContext;
        const blockingInfo = (t.blocks && t.blocks.length > 0) ? `Bloquea a: ${t.blocks.join(', ')}` : 'No bloquea a nadie';
        const blockedByInfo = (t.blocked_by && t.blocked_by.length > 0) ? `Bloqueada por: ${t.blocked_by.join(', ')}` : 'No tiene bloqueos';

        systemPrompt += `\n\n## Tarea activa en contexto\n` +
            `ID: #${t.id}\n` +
            `Título: ${t.titulo || t.title}\n` +
            `Descripción: ${t.descripcion || t.description}\n` +
            `Criterios de Aceptación: ${t.acceptance_criteria || 'N/A'}\n` +
            `Subtareas: ${JSON.stringify(t.subtasks || [])}\n` +
            `Estado: ${t.estado || t.status}\n` +
            `Prioridad: ${t.prioridad || t.priority}\n` +
            `Rama: ${t.rama || 'N/A'}\n` +
            `Milestone: ${t.milestone || 'N/A'}\n` +
            `Repositorio: ${t.repository || t.repo || 'N/A'}\n` +
            `Dependencias: ${blockingInfo} | ${blockedByInfo}\n`;

        // Fetch Jules History if linked session exists
        if (t.jules_session && t.jules_session.session_id) {
            try {
                const activities = await window.julesApi.getActivities(t.jules_session.session_id, 10);
                const logs = (activities.activities || []).map(a => a.description || a.progressUpdated?.title).filter(Boolean).join('\n');
                if (logs) {
                    systemPrompt += `\n### Historial reciente de Jules (Sesión #${t.jules_session.session_id}):\n${logs}\n`;
                }
            } catch (e) { console.warn("Could not fetch Jules activity for context", e); }
        }
    }

    // Hybrid Docs Search Integration with Timeout
    const docsEnabled = localStorage.getItem('hypenosys_docs_context_enabled') !== 'false';
    if (window.HYPENOSYS_DOCS_DEBUG) console.log("[NeuralSend] docs enabled: " + docsEnabled);

    if (docsEnabled && window.DocsBridge) {
        try {
            if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] getDocContext started");

            // Non-blocking timeout promise
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('DocsBridge timeout')), 3500)
            );

            // Wrap documentation logic in a racing promise to never block the chat
            const docsLogic = async () => {
                const results = await window.DocsIndex.search(userMessage, 5);
                if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] results count: " + (results?.length || 0));

                if (results && results.length > 0) {
                    const docsContext = await window.DocsBridge.getContextForQuery(userMessage, { limit: 5 });
                    if (docsContext) {
                        const guardrail = "\n\nUsa únicamente el CONTEXTO DOCUMENTAL DE HYPENOSYS para responder sobre la documentación.\nNo inventes carpetas, tecnologías, herramientas, estructura del repositorio ni contenido no presente en las fuentes.\nSi el contexto no contiene la respuesta, dilo explícitamente.\n\n";

                        if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] context chars: " + docsContext.length);
                        if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] injected: true");

                        // Store metadata for the last search to show in the UI
                        window._lastDocsMetadata = await window.DocsBridge.getSourceMetadata(results);
                        return "\n\n" + docsContext + guardrail;
                    }
                } else {
                    // If asking about organization/structure and no documents found, provide real directory info if available
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

            const docsPromptFragment = await Promise.race([
                docsLogic(),
                timeoutPromise
            ]);

            systemPrompt += docsPromptFragment;

        } catch (e) {
            console.warn("[DocsBridge] Failed, continuing without docs", e);
            if (window.HYPENOSYS_DOCS_DEBUG) console.log("[DocsBridge] error: " + e.message);
        }
    }

    if (window.HYPENOSYS_DOCS_DEBUG) console.log("[NeuralSend] sending to provider");
    return systemPrompt;
}

// Adaptative UI Handlers & Audio/Vision Tools
window.removeAttachedImage = function() {
    window.attachedImage = null;
    document.getElementById('vision-preview').classList.add('hidden');
    document.getElementById('image-input').value = '';
}

window.sendAudioTranscription = async function(blob) {
    const config = getActiveConfig();
    const baseUrl = (config.base_url || '').trim().replace(/\/+$/, '');
    const apiKey = config.api_key;

    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    formData.append('model', config.model);

    window.thinkingIndicator.classList.remove('hidden');

    try {
        const response = await fetch(`${baseUrl}/audio/transcriptions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });

        if (!response.ok) throw new Error('Transcripción fallida');

        const data = await response.json();
        window.chatInput.value = data.text;
        sendMessage();
    } catch (e) {
        appendSystemMessage('Error de transcripción: ' + e.message, 'error');
    } finally {
        window.thinkingIndicator.classList.add('hidden');
    }
}
