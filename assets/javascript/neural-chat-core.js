/**
 * Neural Chat Core - Logic for session management and AI interaction
 * Independent of DOM and storage keys.
 */
// Tab synchronization protocol properties
window.neuralTabSourceId = window.neuralTabSourceId || 'tab_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
window.neuralSyncHistory = window.neuralSyncHistory || new Set();

window.broadcastNeuralEvent = function(type, sessionId, payload = {}) {
    if (!window.neuralSyncChannel) {
        window.neuralSyncChannel = new BroadcastChannel('hypenosys_neural_sessions_sync');
    }
    const eventId = 'evt_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    const eventMsg = {
        v: '2.0.0',
        eventId: eventId,
        sourceId: window.neuralTabSourceId,
        type: type,
        sessionId: sessionId,
        timestamp: Date.now(),
        payload: payload
    };
    window.neuralSyncHistory.add(eventId);
    if (window.neuralSyncHistory.size > 200) {
        const first = window.neuralSyncHistory.values().next().value;
        window.neuralSyncHistory.delete(first);
    }
    try {
        window.neuralSyncChannel.postMessage(eventMsg);
    } catch (e) {
        console.warn("[Neural Sync] Failed to post message:", e);
    }
};

window.handleNeuralSyncMessage = function(eventData, onLoadSessions, onActiveSessionChanged, onRender) {
    if (!eventData || typeof eventData !== 'object') return;
    const { v, eventId, sourceId, type, sessionId, payload } = eventData;

    // Ignore events from same source tab
    if (sourceId === window.neuralTabSourceId) return;

    // Ignore duplicate events
    if (window.neuralSyncHistory.has(eventId)) return;
    window.neuralSyncHistory.add(eventId);
    if (window.neuralSyncHistory.size > 200) {
        const first = window.neuralSyncHistory.values().next().value;
        window.neuralSyncHistory.delete(first);
    }

    if (window.HYPENOSYS_NEURAL_DEBUG) {
        console.log(`[Neural Sync] Received remote event: ${type} (Session: ${sessionId}) from Source: ${sourceId}`);
    }

    // Process event
    if (onLoadSessions) onLoadSessions();

    if (type === 'active-session-changed' && sessionId) {
        if (onActiveSessionChanged) onActiveSessionChanged(sessionId);
    } else if (type === 'NEW_MESSAGE' && payload) {
        const activeId = localStorage.getItem('hy_active_claude_session_id');
        if (sessionId === activeId) {
            const currentSession = (window.sessions || []).find(s => s.id === activeId) ||
                                   (window.julesPanelSessions || []).find(s => s.id === activeId);
            const { message } = payload;
            if (currentSession && message) {
                const exists = currentSession.messages.some(m =>
                    m.content === message.content && m.role === message.role &&
                    (m.timestamp === message.timestamp || m.createTime === message.createTime)
                );
                if (!exists) {
                    currentSession.messages.push(message);
                    if (onRender) onRender();
                }
            }
        }
    } else {
        if (onRender) onRender();
    }
};

window.NeuralChatCore = (function() {
    console.log("[Neural Chat Core] Core loaded");

    function getSessions(storageKey) {
        try {
            return JSON.parse(localStorage.getItem(storageKey) || '[]');
        } catch (e) {
            console.error("[NeuralChatCore] Error loading sessions:", e);
            return [];
        }
    }

    function saveSessions(storageKey, sessions) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(sessions));
            // Trigger storage event for same-page sync if needed, though BroadcastChannel is better
        } catch (e) {
            console.error("[NeuralChatCore] Error saving sessions:", e);
        }
    }

    function appendMessage(sessions, sessionId, message) {
        return sessions.map(s => {
            if (s.id === sessionId) {
                const updatedMessages = [...s.messages, { ...message, timestamp: Date.now() }];
                let updatedTitle = s.title;
                if ((s.title === 'Nueva Conversación' || !s.title) && message.role === 'user') {
                    updatedTitle = message.content.substring(0, 40) + (message.content.length > 40 ? '...' : '');
                }
                return { ...s, messages: updatedMessages, title: updatedTitle, updatedAt: new Date().toISOString() };
            }
            return s;
        });
    }

    function updateActiveSessionId(id) {
        localStorage.setItem('hy_active_claude_session_id', id);
    }

    function getActiveSessionId() {
        return localStorage.getItem('hy_active_claude_session_id');
    }

    function createSession({ title, systemPrompt, idPrefix = 'session_' }) {
        return {
            id: idPrefix + Date.now(),
            title: title || 'Nueva Conversación',
            messages: [],
            systemPrompt: systemPrompt || 'Eres un asistente técnico del estudio de videojuegos Hypenosys. Ayudas al equipo a planificar e implementar tareas de desarrollo. Responde siempre en español, de forma directa y técnica.',
            createdAt: new Date().toISOString(),
            task_ref: null
        };
    }

    function deleteSession(sessions, id) {
        return sessions.filter(s => s.id !== id);
    }

    function renameSession(sessions, id, newTitle) {
        return sessions.map(s => {
            if (s.id === id) {
                return { ...s, title: newTitle, updatedAt: new Date().toISOString() };
            }
            return s;
        });
    }

    function archiveSession(sessions, id, isArchived = true) {
        return sessions.map(s => {
            if (s.id === id) {
                return { ...s, archived: isArchived, updatedAt: new Date().toISOString() };
            }
            return s;
        });
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function sendMessage({
        session,
        userMessage,
        systemPrompt,
        onToken,
        onDone,
        onError,
        saveCallback,
        skipUserMessagePush = false
    }) {
        if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Neural Chat Core] Sending message...");

        if (!skipUserMessagePush) {
            // Add user message to session
            const userMsg = {
                role: 'user',
                content: userMessage,
                timestamp: Date.now()
            };
            session.messages.push(userMsg);
            session.updatedAt = new Date().toISOString();

            // Set title from first message if default
            if ((session.title === 'Nueva Conversación' || !session.title) && userMessage) {
                session.title = userMessage.substring(0, 40) + (userMessage.length > 40 ? '...' : '');
            }

            if (saveCallback) saveCallback();
        }

        // Prepare for assistant message
        const assistantMsg = {
            role: 'assistant',
            content: '',
            timestamp: Date.now()
        };
        session.messages.push(assistantMsg);
        session.updatedAt = new Date().toISOString();
        const assistantIdx = session.messages.length - 1;

        try {
            // Filter out empty messages and format for API
            const apiMessages = session.messages
                .slice(0, -1)
                .filter(m => m.content)
                .map(m => ({ role: m.role, content: m.content }));

            // Final sync of linkedJulesTaskId to legacy hy_neural_session_id for real-time polling compatibility
            if (session.metadata && session.metadata.linkedJulesTaskId) {
                localStorage.setItem('hy_neural_session_id', session.metadata.linkedJulesTaskId);
            }

            if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Neural Chat Core] Provider Client status:", !!window.NeuralProviderClient);

            if (!window.NeuralProviderClient) {
                throw new Error("NeuralProviderClient no encontrado. Verifica la carga de scripts.");
            }

            await window.NeuralProviderClient.sendMessage({
                messages: apiMessages,
                systemPrompt: systemPrompt || session.systemPrompt,
                onToken: (token, fullContent) => {
                    if (session.messages[assistantIdx]) {
                        session.messages[assistantIdx].content = fullContent;
                    }
                    if (onToken) onToken(token, fullContent);
                },
                onDone: (fullContent) => {
                    if (session.messages[assistantIdx]) {
                        session.messages[assistantIdx].content = fullContent;
                        session.messages[assistantIdx].timestamp = Date.now();
                        session.updatedAt = new Date().toISOString();
                    }
                    if (saveCallback) saveCallback();
                    if (onDone) onDone(fullContent);
                },
                onError: (err) => {
                    if (window.HYPENOSYS_NEURAL_DEBUG) console.log("[Neural Chat Core] provider error:", err.message);
                    // Remove empty placeholder
                    if (session.messages[assistantIdx] && !session.messages[assistantIdx].content) {
                        session.messages.splice(assistantIdx, 1);
                    }
                    if (onError) onError(err);
                }
            });
        } catch (e) {
            if (!session.messages[assistantIdx].content) {
                session.messages.splice(assistantIdx, 1);
            }
            if (onError) onError(e);
        }
    }

    return {
        getSessions,
        saveSessions,
        createSession,
        deleteSession,
        renameSession,
        archiveSession,
        appendMessage,
        updateActiveSessionId,
        getActiveSessionId,
        sendMessage,
        escapeHtml
    };
})();
