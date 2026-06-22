/* ════════════════════════════════════════
   NEURAL CHAT SESSION MANAGEMENT
   ════════════════════════════════════════ */

window.sessions = JSON.parse(localStorage.getItem('claude_chat_sessions') || '[]');
window.archivedSessions = JSON.parse(localStorage.getItem('claude_archived_sessions') || '[]');
window.currentSessionId = null;
window.isLoadingSession = false;
window.currentSendMode = 'claude'; // 'claude' or 'jules'
window._activeTaskContext = null;

// Migrate sessions if needed
window.sessions = window.sessions.map(s => ({
    ...s,
    task_ref: s.task_ref || null
}));
localStorage.setItem('claude_chat_sessions', JSON.stringify(window.sessions));

window.createNewSession = function() {
    const id = 'session_' + Date.now();
    const newSession = {
        id,
        title: 'Nueva Conversación',
        messages: [],
        systemPrompt: 'Eres un asistente técnico del estudio de videojuegos Hypenosys. Ayudas al equipo a planificar e implementar tareas de desarrollo. Responde siempre en español, de forma directa y técnica.',
        createdAt: new Date().toISOString(),
        task_ref: null
    };
    window.sessions.unshift(newSession);
    saveSessions();
    renderSessionList();

    // Clean global neural link when creating a new session
    localStorage.removeItem('hy_neural_session_id');

    loadSession(id);
}

window.loadSession = async function(id, isArchived = false) {
    window.isLoadingSession = true;
    window.currentSessionId = id;
    localStorage.setItem('hy_active_claude_session_id', id);
    const currentSession = (isArchived ? window.archivedSessions : window.sessions).find(s => s.id === id);
    if (!currentSession) {
        window.isLoadingSession = false;
        return;
    }

    // Sync Neural Session ID for the banner
    const neuralId = localStorage.getItem('hy_neural_session_id_' + id);
    if (neuralId) {
        localStorage.setItem('hy_neural_session_id', neuralId);
        startJulesPolling(neuralId);

        // [FIX 2C] Intentar precargar feed de actividad guardado
        const idSafe = neuralId.split('/').pop();
        const saved = localStorage.getItem(`hy_activity_feed_${idSafe}`);
        if (saved && window._updateActivityFeed) {
            window._updateActivityFeed(JSON.parse(saved), true);
        }
    } else {
        localStorage.removeItem('hy_neural_session_id');
        stopJulesPolling();
        if (window._updateActivityFeed) window._updateActivityFeed([]);
    }

    // Close sidebar on mobile after selecting a session
    if (window.innerWidth <= 768) {
        closeSidebar();
    }

    document.getElementById('session-title').textContent = currentSession.title;
    renderMessages();
    document.getElementById('welcome-screen')?.classList.add('hidden');

    // Sync UI with session settings
    // isThinkingEnabled is global in html but used here
    window.isThinkingEnabled = !!currentSession.thinking;
    if (window.toggleThinkingBtn) window.toggleThinkingBtn.classList.toggle('dracula-cyan', window.isThinkingEnabled);
    document.getElementById('system-prompt-input').value = currentSession.systemPrompt || '';

    // Refresh session list to update active state
    renderSessionList();

    // Background processing for God Mode context
    if (window.godModeTools) {
        (async () => {
            const activeRepo = localStorage.getItem('hypenosys_active_repo');
            const godContext = await window.godModeTools.getGodModeSystemPrompt(activeRepo);
            if (!currentSession.baseSystemPrompt) currentSession.baseSystemPrompt = currentSession.systemPrompt || 'Eres un asistente técnico del estudio de videojuegos Hypenosys. Ayudas al equipo a planificar e implementar tareas de desarrollo. Responde siempre en español, de forma directa y técnica.';
            currentSession.systemPrompt = currentSession.baseSystemPrompt + '\n' + godContext;
            if (window.currentSessionId === id) {
                document.getElementById('system-prompt-input').value = currentSession.systemPrompt;
            }
        })();
    }

    window.isLoadingSession = false;
}

window.saveSessions = function(skipSync = false) {
    try {
        // Deduplicate sessions by ID before saving to prevent double-entries
        const uniqueSessions = [];
        const seenIds = new Set();

        window.sessions.forEach(s => {
            if (!seenIds.has(s.id)) {
                seenIds.add(s.id);
                uniqueSessions.push(s);
            }
        });

        localStorage.setItem('claude_chat_sessions', JSON.stringify(uniqueSessions));
        localStorage.setItem('claude_archived_sessions', JSON.stringify(window.archivedSessions));

        const neuralSessions = uniqueSessions.map(s => ({
            id: localStorage.getItem('hy_neural_session_id_' + s.id) || s.id,
            name: s.title,
            task_id: s.task_ref?.id || null,
            task_title: s.task_ref?.title || '---',
            start: s.createdAt,
            status: 'active'
        }));
        localStorage.setItem('hy_neural_sessions', JSON.stringify(neuralSessions));

        // Sync via BroadcastChannel
        if (window.neuralSyncChannel && !skipSync && window.currentSessionId) {
            const linkedSid = localStorage.getItem('hy_neural_session_id_' + window.currentSessionId);
            const currentSession = window.sessions.find(s => s.id === window.currentSessionId);
            if (currentSession && currentSession.messages.length > 0) {
                const lastMsg = currentSession.messages[currentSession.messages.length - 1];
                window.neuralSyncChannel.postMessage({
                    type: 'NEW_MESSAGE',
                    julesSessionId: linkedSid || localStorage.getItem('hy_active_jules_session'),
                    claudeConversationId: window.currentSessionId,
                    message: {
                        role: lastMsg.role,
                        content: lastMsg.content,
                        timestamp: lastMsg.timestamp || Date.now()
                    }
                });
            }
        }
    } catch (e) {
        console.error('Error saving sessions:', e);
    }
}

window.archiveSession = function(id) {
    const index = window.sessions.findIndex(s => s.id === id);
    if (index !== -1) {
        const currentSession = window.sessions.splice(index, 1)[0];
        window.archivedSessions.unshift(currentSession);
        saveSessions();
        renderSessionList();
        if (window.currentSessionId === id) {
            window.currentSessionId = null;
            window.chatMessages.innerHTML = '';
            document.getElementById('welcome-screen')?.classList.remove('hidden');
            document.getElementById('session-title').textContent = 'Nueva Conversación';
        }
        showToast('Conversación archivada');
    }
}

window.unarchiveSession = function(id) {
    const index = window.archivedSessions.findIndex(s => s.id === id);
    if (index !== -1) {
        const currentSession = window.archivedSessions.splice(index, 1)[0];
        window.sessions.unshift(currentSession);
        saveSessions();
        renderSessionList();
        showToast('Conversación restaurada');
    }
}

window.clearAllActiveSessions = function() {
    if (window.sessions.length === 0) return;
    showConfirmationToast(`¿Eliminar las ${window.sessions.length} conversaciones activas?`, () => {
        window.sessions.forEach(s => {
            localStorage.removeItem('hy_neural_session_id_' + s.id);
        });

        window.sessions = [];
        window.currentSessionId = null;
        localStorage.removeItem('hy_neural_session_id');
        saveSessions();
        renderSessionList();
        window.chatMessages.innerHTML = '';
        document.getElementById('welcome-screen')?.classList.remove('hidden');
        showToast('Historial limpiado');
    });
}

window.deleteSession = function(id, isArchived = false, skipConfirm = false) {
    const performDelete = () => {
        if (isArchived) {
            window.archivedSessions = window.archivedSessions.filter(s => s.id !== id);
        } else {
            window.sessions = window.sessions.filter(s => s.id !== id);
        }

        // Cleanup neural session mapping
        localStorage.removeItem('hy_neural_session_id_' + id);

        if (window.currentSessionId === id) {
            window.currentSessionId = null;
            localStorage.removeItem('hy_neural_session_id');
            window.chatMessages.innerHTML = '';
            document.getElementById('welcome-screen')?.classList.remove('hidden');
            document.getElementById('session-title').textContent = 'Nueva Conversación';
        }

        saveSessions();
        renderSessionList();
        showToast('Conversación eliminada');
    };

    if (skipConfirm) {
        performDelete();
    } else {
        showConfirmationToast('¿Eliminar esta conversación? Esta acción no se puede deshacer', performDelete);
    }
}

window.renderSessionList = function() {
    const list = document.getElementById('session-list');

    const renderItem = (s, isArchived = false) => {
        const hasNeural = !!localStorage.getItem('hy_neural_session_id_' + s.id);
        return `
        <div class="session-item ${window.currentSessionId === s.id ? 'active' : ''}"
             data-id="${s.id}"
             data-archived="${isArchived}"
             onmousedown="handleSessionTouchStart(event, '${s.id}')"
             ontouchstart="handleSessionTouchStart(event, '${s.id}')">
            <div class="swipe-actions">
                <div class="swipe-action swipe-action-archive" onclick="event.stopPropagation(); ${isArchived ? 'unarchiveSession' : 'archiveSession'}('${s.id}')">
                    <i class="fas fa-${isArchived ? 'box-open' : 'archive'}"></i>
                </div>
                <div class="swipe-action swipe-action-delete" onclick="event.stopPropagation(); deleteSession('${s.id}', ${isArchived})">
                    <i class="fas fa-trash-alt"></i>
                </div>
            </div>
            <div onclick="loadSession('${s.id}', ${isArchived})" class="session-item-content">
                ${hasNeural ? '<div class="neural-indicator" title="Sesión Neural vinculada"></div>' : ''}
                <span class="truncate flex-grow mr-2 text-xs">${s.title}</span>
                <div class="session-actions">
                    <button onclick="event.stopPropagation(); exportSession('${s.id}')"
                            class="action-btn text-[#6272a4] hover:text-[#50fa7b]"
                            title="Exportar">
                        <i class="fas fa-download"></i>
                    </button>
                    <button onclick="event.stopPropagation(); ${isArchived ? 'unarchiveSession' : 'archiveSession'}('${s.id}')"
                            class="action-btn"
                            title="${isArchived ? 'Desarchivar' : 'Archivar'}">
                        📦
                    </button>
                    <button onclick="handleDeleteClick(event, '${s.id}', ${isArchived})"
                            class="action-btn"
                            title="Eliminar">
                        🗑️
                    </button>
                </div>
            </div>
        </div>
        `;
    };

    let html = window.sessions.map(s => renderItem(s, false)).join('');

    if (window.archivedSessions.length > 0) {
        html += `
            <details class="archived-sessions-container mt-4">
                <summary class="flex items-center justify-between">
                    <span>Archivadas (${window.archivedSessions.length})</span>
                    <i class="fas fa-chevron-down text-[8px] opacity-50"></i>
                </summary>
                <div class="space-y-1 mt-2">
                    ${window.archivedSessions.map(s => renderItem(s, true)).join('')}
                </div>
            </details>
        `;
    }

    list.innerHTML = html;
}

window.exportSession = function(id) {
    const currentSession = window.sessions.find(s => s.id === id);
    if (!currentSession) return;

    const date = new Date().toISOString().split('T')[0];
    const filename = `hypenosys-chat-${id}-${date}.json`;
    const blob = new Blob([JSON.stringify(currentSession, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.handleDeleteClick = function(event, id, isArchived) {
    event.stopPropagation();
    const btn = event.currentTarget;
    if (!window.deleteConfirmTimeouts) window.deleteConfirmTimeouts = {};

    if (btn.textContent.trim() === '❓') {
        // Second click - perform delete
        clearTimeout(window.deleteConfirmTimeouts[id]);
        delete window.deleteConfirmTimeouts[id];
        deleteSession(id, isArchived, true); // Added true for skipConfirm
    } else {
        // First click - show confirmation
        const originalText = btn.textContent;
        btn.textContent = '❓';

        window.deleteConfirmTimeouts[id] = setTimeout(() => {
            btn.textContent = originalText;
            delete window.deleteConfirmTimeouts[id];
        }, 2000);
    }
}

window.handleSessionTouchStart = function(e, id) {
    const item = e.currentTarget;
    const content = item.querySelector('.session-item-content');
    const isTouch = e.type === 'touchstart';
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    window.touchStartX = clientX;
    window.touchStartY = clientY;

    // Reset others
    document.querySelectorAll('.session-item-content').forEach(el => {
        if (el !== content) el.style.transform = 'translateX(0)';
    });

    if (isTouch) {
        window.longPressTimer = setTimeout(() => {
            revealSessionActions(content);
        }, 600);

        const handleEnd = (ev) => {
            clearTimeout(window.longPressTimer);
            const deltaX = ev.changedTouches[0].clientX - window.touchStartX;
            const deltaY = ev.changedTouches[0].clientY - window.touchStartY;

            if (deltaX < -50 && Math.abs(deltaY) < 30) {
                revealSessionActions(content);
            } else if (deltaX > 50) {
                hideSessionActions(content);
            }
            item.removeEventListener('touchend', handleEnd);
            item.removeEventListener('touchmove', handleMove);
        };

        const handleMove = (ev) => {
            const deltaX = ev.touches[0].clientX - window.touchStartX;
            const deltaY = ev.touches[0].clientY - window.touchStartY;
            if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                clearTimeout(window.longPressTimer);
            }
        };

        item.addEventListener('touchend', handleEnd, { once: true });
        item.addEventListener('touchmove', handleMove);
    }
}

window.revealSessionActions = function(content) {
    content.style.transform = 'translateX(-120px)';
}

window.hideSessionActions = function(content) {
    content.style.transform = 'translateX(0)';
}
