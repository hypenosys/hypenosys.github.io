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

window._selectedNeuralMessageKeys = window._selectedNeuralMessageKeys || new Set();

window.toggleNeuralMessageSelection = function(index, checked) {
    const session = (window.sessions || []).find(s => s.id === window.currentSessionId);
    if (!session?.messages?.[index]) return;
    const key = session.id + ':' + index;
    if (checked) window._selectedNeuralMessageKeys.add(key);
    else window._selectedNeuralMessageKeys.delete(key);
    window.updateNeuralMessageSelectionCount();
};

window.updateNeuralMessageSelectionCount = function() {
    const el = document.getElementById('neural-selected-message-count');
    if (el) el.textContent = [...window._selectedNeuralMessageKeys].filter(x => x.startsWith(window.currentSessionId + ':')).length + ' mensajes seleccionados';
};

window.prepareSelectedNeuralMessagesForJules = function() {
    const session = (window.sessions || []).find(s => s.id === window.currentSessionId);
    if (!session) return;
    const messages = (session.messages || []).map((msg, index) => ({msg,index}))
        .filter(({index}) => window._selectedNeuralMessageKeys.has(session.id + ':' + index));
    if (!messages.length) {
        if (window.showToast) showToast('Selecciona antes al menos un mensaje.', 'error');
        return;
    }
    const excerpt = messages.slice(-15).map(({msg}) => {
        const role = msg.source === 'jules' ? 'JULES' : msg.role === 'assistant' ? 'CLAUDE' : 'USUARIO';
        const content = String(msg.content || '')
            .replace(/\b(sk-ant-[\w-]{10,}|gh[pousr]_[\w-]{15,}|github_pat_[\w-]{15,}|nvapi-[\w-]{12,})\b/g, '[REDACTED]');
        return '[' + role + ']\n' + content.slice(0,2400);
    }).join('\n\n').slice(0,20000);
    let task = window._activeTaskContext || null;
    if (!task) { try { task = JSON.parse(localStorage.getItem('hy_neural_task_context') || 'null'); } catch {} }
    window._selectedNeuralMessageKeys.clear();
    window.handoffClaudeToJules?.(excerpt, '', task, session);
};

window.renderMessages = function() {
    const currentSession = window.sessions.find(s => s.id === window.currentSessionId);
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

    const githubUser = window.githubApi?.user;
    const localProfile = JSON.parse(localStorage.getItem('hy_user_profile') || 'null');

    window.chatMessages.innerHTML = currentSession.messages.map((m, idx) => {
        let content = m.content;
        let reasoningHtml = '';

        const isUser = m.role === 'user';
        const isJules = m.source === 'jules' || m.role === 'agent' || m.role === 'jules';

        let label = isUser ? 'USUARIO' : (isJules ? 'JULES' : 'CLAUDE');
        let iconHTML = isUser ? '<i class="fas fa-user"></i>' : (isJules ? '<i class="fas fa-bolt"></i>' : '<i class="fas fa-robot"></i>');

        if (isUser) {
            if (githubUser) {
                label = githubUser.name || githubUser.login || 'USUARIO';
                if (githubUser.avatar_url) {
                    iconHTML = `<img src="${githubUser.avatar_url}" class="w-full h-full rounded-full object-cover">`;
                }
            } else if (localProfile) {
                label = localProfile.name || localProfile.login || 'USUARIO';
                if (localProfile.avatar_url) {
                    iconHTML = `<img src="${localProfile.avatar_url}" class="w-full h-full rounded-full object-cover">`;
                }
            }
        }

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

        // Handle Consulted Sources (Docs Bridge & Local File RAG)
        let docsSourcesHtml = '';
        if (m.role === 'assistant' && ((m.sources && m.sources.length > 0) || (m.ragSources && m.ragSources.length > 0))) {
            let docsPart = '';
            if (m.sources && m.sources.length > 0) {
                const readStatusCount = m.sources.filter(s => s.readStatus === 'completo' || s.readStatus === 'truncado').length;
                const contextLabel = readStatusCount > 0 ? `Docs Context · ${readStatusCount} documentos leídos` : `Docs Context · ${m.sources.length} fragmentos`;
                docsPart = `
                    <details class="docs-sources-details mb-2">
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
                `;
            }

            let ragPart = '';
            if (m.ragSources && m.ragSources.length > 0) {
                const threshold = m.ragThreshold !== undefined ? m.ragThreshold : 0.35;
                ragPart = `
                    <details class="rag-sources-details">
                        <summary class="text-[10px] font-bold text-[#50fa7b] cursor-pointer hover:text-white transition-all flex items-center gap-2 uppercase tracking-widest">
                            <i class="fas fa-file-code"></i> RAG Adjuntos (${m.ragSources.length} fragmentos, umbral: ${threshold})
                        </summary>
                        <div class="mt-2 space-y-2">
                            ${m.ragSources.map((rs, rIdx) => `
                                <div class="p-2 bg-[#1e1f29] rounded border border-[#50fa7b]/30">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-[10px] font-bold text-[#50fa7b] truncate">[${rIdx + 1}] ${escapeHtml(rs.fileName)}</span>
                                        <span class="text-[9px] font-mono text-[#8be9fd]">Similitud: ${(rs.score || 0).toFixed(2)}</span>
                                    </div>
                                    <div class="text-[8px] text-[#6272a4] font-mono truncate">Chunk ${rs.chunkIndex + 1}</div>
                                </div>
                            `).join('')}
                        </div>
                    </details>
                `;
            }

            docsSourcesHtml = `
                <div class="mt-4 border-t border-[#44475a]/30 pt-3">
                    ${docsPart}
                    ${ragPart}
                </div>
            `;
        }

        return `
        <div class="flex ${isUser ? 'justify-end' : 'justify-start'} group mb-4">
            <div class="max-w-[85%] p-4 ${bubbleClass} relative message-bubble">
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-5 h-5 rounded-full bg-[#44475a] flex items-center justify-center text-[10px] overflow-hidden border border-[#bd93f9]/20">
                        ${iconHTML}
                    </div>
                    <div class="text-[10px] font-black tracking-widest uppercase ${labelColor} opacity-70">
                        ${label}
                    </div>
                </div>
                ${safetyBadge}
                ${m.thinking ? `
                    <details class="mb-3 border-l-2 border-[#8be9fd] bg-[#8be9fd]/10 rounded-r-lg overflow-hidden thinking-block" open>
                        <summary class="p-2 text-[10px] font-bold text-[#8be9fd] cursor-pointer hover:bg-[#8be9fd]/10 transition-all uppercase tracking-widest flex items-center gap-2">
                            <i class="fas fa-brain"></i> Razonamiento extendido
                        </summary>
                        <div class="p-3 text-xs text-[#f8f8f2]/90 font-mono bg-black/30 whitespace-pre-wrap">
                            ${escapeHtml(m.thinking)}
                        </div>
                    </details>
                ` : ''}
                ${reasoningHtml}
                <div class="prose prose-invert text-sm prose-pre:bg-[#1e1f29] prose-pre:border prose-pre:border-[#44475a] selection:bg-[#bd93f9]/30">
                    ${content ? (isJules ? escapeHtml(content).replace(/\n/g, '<span class="block"></span>') : marked.parse(content)) : ''}
                </div>

                ${docsSourcesHtml}

                ${`
                <div class="neural-message-actions absolute -bottom-3 right-4 flex gap-1.5 z-10">
                    <label class="neural-action-mini" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer">
                        <input type="checkbox" aria-label="Seleccionar mensaje" onchange="window.toggleNeuralMessageSelection(${idx},this.checked)" ${window._selectedNeuralMessageKeys.has(currentSession.id + ':' + idx) ? 'checked' : ''}> Seleccionar
                    </label>
                    ${!isUser ? `
                    <button onclick="copyMessage(${idx})" class="neural-action-mini" title="Copiar respuesta">
                        <i class="fas fa-copy"></i> <span class="desktop-only">Copiar</span>
                    </button>
                    <button onclick="sendToJulesByIndex(${idx})" class="neural-action-mini" title="Enviar a Jules">
                        <i class="fas fa-bolt"></i> <span class="desktop-only">→ Jules</span>
                    </button>
                    ` : ''}
                </div>
                `}
            </div>
        </div>
        `;
    }).join('');
    window.chatMessages.scrollTop = window.chatMessages.scrollHeight;
    window.updateNeuralMessageSelectionCount();
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
        saveSessions(false, 'save-system-prompt');
    }
    closeSystemPrompt();
}

window.openSettings = function() {
    // Close mobile sidebar if open
    if (window.innerWidth <= 768) {
        window.closeSidebar();
    }
    window.authManager.showApiConfigModal();
}

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

    if (docsEnabled && window.JulesDocsBridge) {
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 3500)
            );

            const docsPromptFragment = await Promise.race([
                window.JulesDocsBridge.getDocContext(userMessage),
                timeoutPromise
            ]);

            systemPrompt += docsPromptFragment;

        } catch (e) {
            console.warn("[DocsBridge] failed; continuing without docs", e);
            if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[DocsBridge] failed; continuing without docs");
        }
    }

    return systemPrompt;
}

// Adaptative UI Handlers & Audio/Vision Tools
window.removeAttachedImage = function() {
    window.attachedImage = null;
    document.getElementById('vision-preview').classList.add('hidden');
    document.getElementById('image-input').value = '';
}

/* ════════════════════════════════════════
   RAG ATTACHMENT CHIPS UI ENGINE
   ════════════════════════════════════════ */

window.ragActiveIngestControllers = {};
window.ragMemoryErrorChips = {};

window.renderRagFileChips = async function(targetSessionId) {
    const sessionId = targetSessionId || window.currentSessionId;
    const container = document.getElementById('rag-file-chips-container');
    if (!container) return;

    if (!sessionId) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    // 1. Fetch persistent chunks for current session
    let readyFiles = [];
    try {
        const chunks = await window.aiStorage.getRagChunksBySession(sessionId);
        const fileMap = new Map();
        chunks.forEach(c => {
            if (!fileMap.has(c.fileId)) {
                fileMap.set(c.fileId, {
                    fileId: c.fileId,
                    fileName: c.fileName || 'archivo.txt',
                    fileSize: c.fileSize || 0,
                    modelId: c.modelId,
                    chunkCount: 0
                });
            }
            fileMap.get(c.fileId).chunkCount++;
        });
        readyFiles = Array.from(fileMap.values());
    } catch (e) {
        console.error('Error fetching RAG chunks for chips:', e);
    }

    // 2. Active indexing chips for current session
    const activeIndexing = Object.entries(window.ragActiveIngestControllers)
        .filter(([_, item]) => item.sessionId === sessionId)
        .map(([fId, item]) => ({
            fileId: fId,
            fileName: item.fileName,
            fileSize: item.fileSize,
            progress: item.progress || '0/0',
            state: 'indexing'
        }));

    // 3. Memory error chips for current session
    const memoryErrors = window.ragMemoryErrorChips[sessionId] || [];

    // Current embedding model check
    const embedConfig = window.getEmbeddingsConfig ? window.getEmbeddingsConfig() : {};
    const currentModel = embedConfig.model;

    const totalChips = activeIndexing.length + readyFiles.length + memoryErrors.length;
    if (totalChips === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    let html = '';

    // Render indexing chips
    activeIndexing.forEach(file => {
        html += `
            <div class="rag-chip indexing" id="rag-chip-${file.fileId}">
                <i class="fas fa-spinner fa-spin text-xs"></i>
                <span class="rag-chip-name" title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</span>
                <span class="rag-chip-size">${file.progress}</span>
                <button type="button" class="rag-chip-remove" aria-label="Quitar ${escapeHtml(file.fileName)} del contexto" onclick="removeRagChip('${file.fileId}', 'indexing')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    });

    // Render ready files chips
    readyFiles.forEach(file => {
        const isMismatch = file.modelId && currentModel && file.modelId !== currentModel;
        const formattedSize = window.NeuralChatRAG?.formatFileSize ? window.NeuralChatRAG.formatFileSize(file.fileSize) : `${file.fileSize} B`;

        html += `
            <div class="rag-chip ready" id="rag-chip-${file.fileId}">
                <i class="fas fa-file-lines rag-chip-icon text-xs"></i>
                <span class="rag-chip-name" title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</span>
                <span class="rag-chip-size">${formattedSize}</span>
                ${isMismatch ? `<span class="rag-chip-badge reindex" title="Modelo de embeddings cambiado (${file.modelId} → ${currentModel})">reindexar</span>` : ''}
                <button type="button" class="rag-chip-remove" aria-label="Quitar ${escapeHtml(file.fileName)} del contexto" onclick="removeRagChip('${file.fileId}', 'ready')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    });

    // Render error chips
    memoryErrors.forEach(file => {
        const formattedSize = window.NeuralChatRAG?.formatFileSize ? window.NeuralChatRAG.formatFileSize(file.fileSize) : `${file.fileSize} B`;
        html += `
            <div class="rag-chip error" id="rag-chip-${file.fileId}" title="${escapeHtml(file.errorMessage)}">
                <i class="fas fa-exclamation-triangle text-xs"></i>
                <span class="rag-chip-name" title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</span>
                <span class="rag-chip-size">${formattedSize} · Error</span>
                <button type="button" class="rag-chip-remove" aria-label="Quitar ${escapeHtml(file.fileName)} del contexto" onclick="removeRagChip('${file.fileId}', 'error')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
};

window.renderRagFileChips.addErrorChip = function({ fileId, fileName, fileSize, errorMessage }) {
    const sessionId = window.currentSessionId;
    if (!sessionId) return;

    if (!window.ragMemoryErrorChips[sessionId]) {
        window.ragMemoryErrorChips[sessionId] = [];
    }
    // Remove existing error chip for same file if present
    window.ragMemoryErrorChips[sessionId] = window.ragMemoryErrorChips[sessionId].filter(c => c.fileId !== fileId);
    window.ragMemoryErrorChips[sessionId].push({
        fileId,
        fileName,
        fileSize,
        errorMessage,
        state: 'error'
    });

    window.renderRagFileChips(sessionId);
};

window.removeRagChip = async function(fileId, state) {
    const sessionId = window.currentSessionId;
    if (!sessionId) return;

    if (state === 'indexing') {
        const active = window.ragActiveIngestControllers[fileId];
        if (active && active.controller) {
            active.controller.abort();
        }
        delete window.ragActiveIngestControllers[fileId];
    } else if (state === 'ready') {
        await window.aiStorage.deleteRagChunksByFile(sessionId, fileId);
    } else if (state === 'error') {
        if (window.ragMemoryErrorChips[sessionId]) {
            window.ragMemoryErrorChips[sessionId] = window.ragMemoryErrorChips[sessionId].filter(c => c.fileId !== fileId);
        }
    }

    await window.renderRagFileChips(sessionId);
};

window.handleFileIngestionWithChip = async function({ sessionId, fileId, fileName, fileSize, fileContent }) {
    const controller = new AbortController();

    window.ragActiveIngestControllers[fileId] = {
        sessionId,
        controller,
        fileName,
        fileSize,
        progress: '0/0',
        state: 'indexing'
    };

    await window.renderRagFileChips(sessionId);

    try {
        await window.NeuralChatRAG.ingestFile({
            sessionId,
            fileId,
            fileName,
            fileSize,
            fileContent,
            signal: controller.signal,
            onProgress: (p) => {
                if (window.ragActiveIngestControllers[fileId]) {
                    window.ragActiveIngestControllers[fileId].progress = `${p.processedChunks}/${p.totalChunks}`;
                    window.renderRagFileChips(sessionId);
                }
            }
        });

        delete window.ragActiveIngestControllers[fileId];
        await window.renderRagFileChips(sessionId);

    } catch (err) {
        delete window.ragActiveIngestControllers[fileId];

        if (err.name === 'AbortError') {
            // User cancelled indexing via X button; no chunks were saved
            await window.renderRagFileChips(sessionId);
            return;
        }

        // Display error state chip in memory
        window.renderRagFileChips.addErrorChip({
            fileId,
            fileName,
            fileSize,
            errorMessage: err.message || 'Error al indexar archivo'
        });
    }
};

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
