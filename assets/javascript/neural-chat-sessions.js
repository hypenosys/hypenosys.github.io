/* ════════════════════════════════════════
   NEURAL CHAT SESSION MANAGEMENT
   ════════════════════════════════════════ */

window.sessions = (function() {
    if (window.HYPENOSYS_NEURAL_DEBUG) {
        const raw = localStorage.getItem('claude_chat_sessions');
        if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Chat] Storage before init:", raw ? JSON.parse(raw).length : 0, "sessions");
    }
    try {
        // PRIORITY: Always initialize from claude_chat_sessions as source of truth
        const stored = JSON.parse(localStorage.getItem('claude_chat_sessions') || '[]');
        if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Chat] window.sessions init count:", stored.length);
        return Array.isArray(stored) ? stored : [];
    } catch(e) {
        if (window.HYPENOSYS_NEURAL_DEBUG) console.error("[Claude Chat] Failed to parse sessions during init", e);
        return [];
    }
})();
window.archivedSessions = (function() {
    try {
        return JSON.parse(localStorage.getItem('claude_archived_sessions') || '[]');
    } catch(e) { return []; }
})();
window.currentSessionId = null;
window.isLoadingSession = false;
window.currentSendMode = 'claude'; // 'claude' or 'jules'
window._activeTaskContext = null;

// Migrate sessions if needed
if (window.sessions && window.sessions.length > 0) {
    if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Chat] Running migration for", window.sessions.length, "sessions");
    const migrated = window.sessions.map(s => ({
        ...s,
        task_ref: s.task_ref || null
    }));

    // Only update if something actually changed to avoid unnecessary writes
    const hasChanged = JSON.stringify(window.sessions) !== JSON.stringify(migrated);
    if (hasChanged) {
        window.sessions = migrated;
        localStorage.setItem('claude_chat_sessions', JSON.stringify(window.sessions));
        if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Chat] Migration completed and saved");
    } else {
        if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Chat] Migration skipped (no-op)");
    }
} else if (window.HYPENOSYS_NEURAL_DEBUG) {
    if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Chat] Migration skipped (no sessions)");
}

window.createNewSession = function() {
    const newSession = window.NeuralChatCore.createSession({
        title: 'Nueva Conversación'
    });
    const id = newSession.id;
    window.sessions.unshift(newSession);
    saveSessions(false, 'create-session');
    renderSessionList();

    // Clean global neural link when creating a new session
    localStorage.removeItem('hy_neural_session_id');

    loadSession(id);
}

window.loadSession = async function(id) {
    window.isLoadingSession = true;
    window.currentSessionId = id;
    localStorage.setItem('hy_active_claude_session_id', id);
    const currentSession = window.sessions.find(s => s.id === id);
    if (!currentSession) {
        window.isLoadingSession = false;
        return;
    }

    // Sync Neural Session ID for the banner
    let neuralId = currentSession.metadata?.linkedJulesTaskId || localStorage.getItem('hy_neural_session_id_' + id);
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

// Real-time synchronization channel
window.neuralSyncChannel = new BroadcastChannel('hypenosys_neural_sessions_sync');
window.neuralSyncChannel.onmessage = (event) => {
    const { type, sessionId } = event.data;
    if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Neural Sync] Message received:", type, sessionId);

    // Refresh sessions from storage
    window.sessions = JSON.parse(localStorage.getItem('claude_chat_sessions') || '[]');

    if (type === 'active-session-changed' && sessionId) {
        if (window.currentSessionId !== sessionId) {
            loadSession(sessionId);
        }
    } else {
        renderSessionList();
        if (window.currentSessionId) {
            renderMessages();
        }
    }
};

window.addEventListener('storage', (e) => {
    if (e.key === 'claude_chat_sessions' || e.key === 'hy_active_claude_session_id') {
        try {
            window.sessions = JSON.parse(localStorage.getItem('claude_chat_sessions') || '[]');
            const activeId = localStorage.getItem('hy_active_claude_session_id');

            if (e.key === 'hy_active_claude_session_id' && activeId !== window.currentSessionId) {
                loadSession(activeId);
            } else {
                renderSessionList();
                if (window.currentSessionId) {
                    const current = window.sessions.find(s => s.id === window.currentSessionId);
                    if (current) {
                        renderMessages();
                    } else {
                        // Current session was deleted in another tab
                        window.currentSessionId = null;
                        window.chatMessages.innerHTML = '';
                        document.getElementById('welcome-screen')?.classList.remove('hidden');
                        document.getElementById('session-title').textContent = 'Nueva Conversación';
                    }
                }
            }
        } catch (err) {
            console.error('Error syncing sessions from storage:', err);
        }
    }
});

window.saveSessions = function(skipSync = false, reason = 'unknown') {
    if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Chat] saveSessions called. Reason:", reason, "skipSync:", skipSync);
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

        // DEFENSIVE CHECK: Never overwrite with empty if we had data before and this is an implicit call
        if (uniqueSessions.length === 0 && reason !== 'clear-all' && reason !== 'delete-session') {
            const raw = localStorage.getItem('claude_chat_sessions');
            if (raw) {
                try {
                    const stored = JSON.parse(raw);
                    if (Array.isArray(stored) && stored.length > 0) {
                        console.warn("[Claude Chat] blocked potentially destructive empty save. Reason:", reason);
                        return;
                    }
                } catch(e) {}
            }
        }

        localStorage.setItem('claude_chat_sessions', JSON.stringify(uniqueSessions));
        if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Claude Chat] Storage after save:", uniqueSessions.length, "sessions");

        localStorage.setItem('claude_archived_sessions', JSON.stringify(window.archivedSessions));

        if (window.neuralSyncChannel) {
            window.neuralSyncChannel.postMessage({ type: 'session-updated' });
        }

        // Unified cross-tab and cross-component sync
        const neuralSessions = uniqueSessions.filter(s => !s.archived).map(s => ({
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
    const session = window.sessions.find(s => s.id === id);
    if (session) {
        session.archived = true;
        saveSessions(false, 'archive-session');
        renderSessionList();

        if (window.currentSessionId === id) {
            // Load another session if available
            const nextSession = window.sessions.find(s => !s.archived);
            if (nextSession) {
                loadSession(nextSession.id);
            } else {
                window.currentSessionId = null;
                window.chatMessages.innerHTML = '';
                document.getElementById('welcome-screen')?.classList.remove('hidden');
                document.getElementById('session-title').textContent = 'Nueva Conversación';
            }
        }
        showToast('Conversación archivada');
    }
}

window.unarchiveSession = function(id) {
    const session = window.sessions.find(s => s.id === id);
    if (session) {
        session.archived = false;
        saveSessions(false, 'unarchive-session');
        renderSessionList();
        showToast('Conversación restaurada');
    }
}

window.renameSession = function(id) {
    const session = window.sessions.find(s => s.id === id);
    if (!session) return;

    const newTitle = window.prompt("Renombrar sesión:", session.title);
    if (newTitle !== null && newTitle.trim() !== "") {
        session.title = newTitle.trim();
        session.updatedAt = new Date().toISOString();
        saveSessions(false, 'rename-session');
        renderSessionList();
        if (window.currentSessionId === id) {
            document.getElementById('session-title').textContent = session.title;
        }
        showToast('Sesión renombrada');
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
        saveSessions(false, 'clear-all');
        renderSessionList();
        window.chatMessages.innerHTML = '';
        document.getElementById('welcome-screen')?.classList.remove('hidden');
        showToast('Historial limpiado');
    });
}

window.deleteSession = function(id, skipConfirm = false) {
    const session = window.sessions.find(s => s.id === id);
    if (!session) return;

    const performDelete = () => {
        window.sessions = window.sessions.filter(s => s.id !== id);

        // Cleanup neural session mapping
        localStorage.removeItem('hy_neural_session_id_' + id);

        if (window.currentSessionId === id) {
            window.currentSessionId = null;
            localStorage.removeItem('hy_neural_session_id');
            window.chatMessages.innerHTML = '';
            document.getElementById('welcome-screen')?.classList.remove('hidden');
            document.getElementById('session-title').textContent = 'Nueva Conversación';
        }

        saveSessions(false, 'delete-session');
        renderSessionList();
        showToast('Conversación eliminada');
    };

    if (skipConfirm) {
        performDelete();
    } else {
        const isLinked = !!(session.metadata && session.metadata.linkedJulesTaskId);
        const msg = isLinked ?
            'Esta conversación está vinculada a una tarea Jules. Se borrará el historial local, pero no la tarea remota. ¿Continuar?' :
            '¿Eliminar esta conversación? Esta acción no se puede deshacer';

        showConfirmationToast(msg, performDelete);
    }
}

window.renderSessionList = function() {
    const list = document.getElementById('session-list');
    if (!list) return;

    const renderItem = (s) => {
        const isArchived = !!s.archived;
        const isMobile = window.innerWidth <= 768;
        const isLinked = !!(s.metadata && s.metadata.linkedJulesTaskId);

        // Status logic:
        let status = 'completed';

        const hasError = s.messages && s.messages.length > 0 && s.messages[s.messages.length - 1].isError;
        const isCurrentlyActive = window.currentSessionId === s.id;

        if (hasError) {
            status = 'error';
        } else if (isCurrentlyActive) {
            status = isLinked ? 'linked' : 'active';
        } else if (isArchived) {
            status = 'completed';
        }

        // Display Title: prioritize title, then first message, then generic
        let displayTitle = s.title;
        if (!displayTitle || displayTitle === 'Nueva Conversación') {
            const firstMsg = s.messages.find(m => m.role === 'user');
            if (firstMsg) {
                displayTitle = firstMsg.content.substring(0, 40) + (firstMsg.content.length > 40 ? '...' : '');
            } else {
                displayTitle = 'Nueva Conversación';
            }
        }

        return `
        <div class="session-item ${window.currentSessionId === s.id ? 'active' : ''} ${isLinked ? 'linked' : ''} group relative"
             data-id="${s.id}"
             data-archived="${isArchived}">

            <div onclick="loadSession('${s.id}')" class="session-item-content">
                <!-- Collapsed view content -->
                <i class="fas fa-comment-alt session-item-icon"></i>

                <!-- Status dot -->
                <div class="status-dot ${status}"></div>

                <!-- Expanded view text -->
                <span class="truncate flex-grow text-[11px] font-medium sidebar-text">${escapeHtml(displayTitle)}</span>

                <!-- Full title tooltip for collapsed mode -->
                <div class="session-tooltip collapsed-only">${escapeHtml(displayTitle)}</div>
            </div>

            <!-- Actions -->
            <div class="absolute right-2 top-1/2 -translate-y-1/2 ${isMobile ? 'flex' : 'hidden group-hover:flex'} items-center gap-1 sidebar-text bg-[#282a36]/80 backdrop-blur-sm pl-1 rounded-l-md">
                <button onclick="event.stopPropagation(); renameSession('${s.id}')" class="text-[#6272a4] hover:text-[#bd93f9] p-1" title="Renombrar"><i class="fas fa-edit text-[10px]"></i></button>
                ${isArchived ?
                    `<button onclick="event.stopPropagation(); unarchiveSession('${s.id}')" class="text-[#6272a4] hover:text-[#50fa7b] p-1" title="Desarchivar"><i class="fas fa-box-open text-[10px]"></i></button>` :
                    `<button onclick="event.stopPropagation(); archiveSession('${s.id}')" class="text-[#6272a4] hover:text-[#bd93f9] p-1" title="Archivar"><i class="fas fa-archive text-[10px]"></i></button>`
                }
                <button onclick="event.stopPropagation(); deleteSession('${s.id}')" class="text-[#6272a4] hover:text-[#ff5555] p-1" title="Borrar"><i class="fas fa-trash text-[10px]"></i></button>
            </div>
        </div>
        `;
    };

    const activeSessions = window.sessions.filter(s => !s.archived);
    const archivedSessions = window.sessions.filter(s => s.archived);

    let html = activeSessions.map(s => renderItem(s)).join('');

    if (archivedSessions.length > 0) {
        html += `
            <div class="sidebar-section-label">Sesiones Archivadas</div>
            <div class="space-y-1">
                ${archivedSessions.map(s => renderItem(s)).join('')}
            </div>
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
