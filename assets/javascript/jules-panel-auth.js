/* ════════════════════════════════════════
   JULES PANEL AUTH, INIT & HANDOFF logic
   ════════════════════════════════════════ */

window.forceOpenPanel = function() {
    $("auth-overlay").classList.remove("show");
    $("app-root").classList.remove("locked");
    if (window._bootJules) window._bootJules(null);
    else initRealPanel(null);
}

window.handleGlobalAuthError = function() {
    showAuthCard("auth-card-login");
    $("app-root").classList.add("locked");
}

window.showAuthCard = function(id) {
    document.querySelectorAll(".auth-card").forEach(c => c.classList.add("hidden"));
    $(id).classList.remove("hidden");
    $("auth-overlay").classList.add("show");
}

window.initRealPanel = async function(user) {
    if (!user && !getGitHubToken()) { showAuthCard("auth-card-login"); return; }
    $("auth-overlay").classList.remove("show");
    $("app-root").classList.remove("locked");

    if (user) {
        updateUserUI(user);
        addTel("SYSTEM", "Iniciado como " + user.login, "success");
    } else {
        addTel("SYSTEM", "Iniciado como Invitado", "success");
    }

    // Initialize components with independent error handling
    try {
        await initializeRepoSelector();
    } catch(e) { console.error("Repo selector failed", e); }

    try {
        await refreshDashboard();
    } catch(e) { console.error("Initial dashboard refresh failed", e); }

    switchView(window.JulesPanelState.currentView || 'dashboard');
    await handleUrlParams();
    checkClipboard();
    startPolling();
}

window.prefillTaskFromHandoff = async function(task) {
    if (!task) return;

    // Determinar si hay una sesión activa vinculada
    const claudeId = localStorage.getItem('hy_active_claude_session_id');
    let linkedSid = null;
    if (claudeId) {
        linkedSid = localStorage.getItem('hy_neural_session_id_' + claudeId);
    }
    if (!linkedSid) linkedSid = localStorage.getItem('hy_neural_session_id');

    let isSessionActive = false;
    if (linkedSid) {
        try {
            const sessionData = await window.julesApi.getSession(linkedSid);
            const terminalStates = ['COMPLETED', 'FAILED', 'CANCELLED', 'ERROR'];
            if (sessionData && !terminalStates.includes(sessionData.state)) {
                isSessionActive = true;
            }
        } catch (e) {
            console.warn("Error checking linked session status", e);
        }
    }

    const payloadStr = localStorage.getItem('jules_task_payload');
    let formattedPrompt = "";
    let payload = null;

    if (payloadStr) {
        try {
            payload = JSON.parse(payloadStr);
            if (payload.user_note) formattedPrompt += "[NOTA DEL USUARIO]\n" + payload.user_note + "\n\n";
            if (payload.session_context && typeof payload.session_context === 'string') {
                formattedPrompt += "[CONTEXTO NEURAL]\n\n" + payload.session_context + "\n\n";
            }
            if (payload.claude_response) {
                formattedPrompt += "[RESPUESTA DE CLAUDE]\n\n" + payload.claude_response;
            }
        } catch(e) { console.error("Error parsing payload", e); }
    }

    if (!formattedPrompt) {
        formattedPrompt = "He vinculado esta tarea para su análisis técnico:\n\n📌 TAREA: #" + task.id + " - " + (task.titulo || task.title) + "\n";
        if (task.descripcion) formattedPrompt += "📝 DESCRIPCIÓN: " + task.descripcion + "\n";
        formattedPrompt += "\n¿Cómo podemos abordar esta tarea?";
    }

    const targetRepo = task.repository || task.repo || (payload?.source_task?.repository || payload?.source_task?.repo);
    const targetBranch = task.rama || task.branch || payload?.rama;

    if (targetRepo) {
        const source = (window.julesSourcesCache || []).find(function(src) {
            return src.name === targetRepo || src.name === 'sources/github/' + targetRepo || src.displayName === targetRepo;
        });
        if (source) {
            switchRepo(source.name, source);
        } else if (targetRepo.includes('/')) {
            const sourceName = targetRepo.startsWith('sources/') ? targetRepo : 'sources/github/' + targetRepo;
            switchRepo(sourceName, { name: sourceName });
        }
    }

    if (targetBranch) {
        const waitForBranches = () => {
            return new Promise((resolve) => {
                let attempts = 0;
                const check = () => {
                    const sel = $('branch-sel');
                    if (sel && !sel.disabled && sel.options.length > 0) {
                        const option = Array.from(sel.options).find(o => o.value === targetBranch);
                        if (option) {
                            sel.value = targetBranch;
                            window.JulesPanelState.activeBranch = targetBranch;
                            const sessCtx = $('sess-ctx');
                            if(sessCtx) {
                                const repoLabel = $('repo-label').textContent;
                                sessCtx.textContent = repoLabel + ': ' + targetBranch;
                            }
                            addTel("SYSTEM", "Rama auto-ajustada a " + targetBranch + " (Tarea #" + task.id + ")", "info");
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    } else if (attempts < 20) {
                        attempts++;
                        setTimeout(check, 250);
                    } else {
                        resolve(false);
                    }
                };
                check();
            });
        };

        const exists = await waitForBranches();
        if (!exists) {
             formattedPrompt = "Crea la branch " + targetBranch + " a partir de main antes de empezar.\n\n" + formattedPrompt;
             addTel("SYSTEM", "Instrucción de creación de branch añadida al prompt", "warn");
        }
    }

    if (isSessionActive) {
        showToast("Enviando orden a sesión activa...", "amber");
        try {
            const targetId = linkedSid.startsWith('sessions/') ? linkedSid : 'sessions/' + linkedSid;
            const ok = await window.julesApi.sendMessage(targetId, formattedPrompt);
            if (ok) {
                showToast("Orden enviada con éxito", "green");
                addTel("USER", "Orden enviada vía Neural Link", "info");

                if (typeof window.chatV2Messages !== 'undefined') {
                    window.chatV2Messages.push({ role: 'user', content: formattedPrompt });
                    saveSessionsV2();
                    renderChatV2Messages();
                }

                localStorage.setItem('hy_neural_active', 'true');
                localStorage.setItem('hy_neural_task_context', JSON.stringify(task));
                switchView('chat');
            }
        } catch (err) {
            showToast("Error al enviar: " + err.message, "red");
            isSessionActive = false;
        }
    }

    if (!isSessionActive) {
        localStorage.setItem('hy_neural_active', 'true');
        localStorage.setItem('hy_neural_task_context', JSON.stringify(task));

        if ($('session-prompt')) {
            $('session-prompt').value = formattedPrompt.trim();
        }

        if ($('neural-session-banner')) {
            $('neural-session-banner').classList.remove('hidden');
            $('neural-banner-task').textContent = "Tarea #" + task.id + ": " + (task.titulo || task.title);
            $('neural-banner-task').classList.remove('skeleton');
        }
        showTaskContextInChat(task);

        showToast("Contexto cargado en Nueva Tarea", "green");
        switchView('neural');
    }

    localStorage.removeItem('jules_task_payload');
    localStorage.removeItem('hy_jules_handoff');
    localStorage.removeItem('jules_clipboard');
    localStorage.removeItem('jules_linked_task_id');
}

window.handleUrlParams = async function() {
    const handoffRaw = localStorage.getItem('hy_jules_handoff');
    if (handoffRaw) {
        try {
            const { task, timestamp } = JSON.parse(handoffRaw);
            if (Date.now() - timestamp < 30000) {
                await prefillTaskFromHandoff(task);
                localStorage.removeItem('hy_jules_handoff');
                return;
            }
        } catch(e) {
            console.error("Error parsing hy_jules_handoff", e);
        }
        localStorage.removeItem('hy_jules_handoff');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const taskDataRaw = urlParams.get('task_data');
    const taskId = urlParams.get('task_id');

    if (taskDataRaw || taskId) {
        let task = null;
        if (taskDataRaw) {
            try {
                task = JSON.parse(decodeURIComponent(taskDataRaw));
            } catch(e) { console.error("Error parsing task_data param", e); }
        } else if (taskId && window.JulesPanelState.tasks) {
            task = window.JulesPanelState.tasks.find(t => String(t.id) === String(taskId));
        }

        if (task) {
            await prefillTaskFromHandoff(task);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
}

window.checkClipboard = function() {
    const payloadStr = localStorage.getItem('jules_task_payload');
    const promptArea = $('session-prompt');

    const pendingPrompt = localStorage.getItem('hy_neural_pending_prompt');
    if (pendingPrompt && promptArea && promptArea.value !== pendingPrompt) {
        promptArea.value = pendingPrompt;
        showToast("Prompt actualizado desde Claude", "green");
        localStorage.removeItem('hy_neural_pending_prompt');
        switchView('neural');
    }

    if (localStorage.getItem('hy_neural_active') === 'true') {
        const task = JSON.parse(localStorage.getItem('hy_neural_task_context') || '{}');
        if (task.id) {
            $('neural-session-banner').classList.remove('hidden');
            $('neural-banner-task').textContent = "Tarea #" + task.id + ": " + (task.titulo || task.title);
            $('neural-banner-task').classList.remove('skeleton');
            showTaskContextInChat(task);
        }
    }

    if (payloadStr) {
        try {
            const payload = JSON.parse(payloadStr);
            if (payload.source_task) {
                showTaskContextInChat(payload.source_task);
            }
        } catch(e){}
    }

    if (payloadStr && promptArea) {
        try {
            const payload = JSON.parse(payloadStr);
            let formattedPrompt = "";

            if (payload.user_note) {
                formattedPrompt += "[NOTA DEL USUARIO]\n" + payload.user_note + "\n\n";
            }

            if (payload.session_context && typeof payload.session_context === 'string') {
                formattedPrompt += "[CONTEXTO NEURAL]\n\n" + payload.session_context + "\n\n";
            }

            if (payload.claude_response) {
                formattedPrompt += "[RESPUESTA DE CLAUDE]\n\n" + payload.claude_response;
            }

            promptArea.value = formattedPrompt.trim();
            window.JulesPanelState.activePayload = payload;

            showToast("Neural Link: Payload cargado con éxito", "green");
            switchView('neural');

            setTimeout(() => {
                promptArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                promptArea.classList.add('neural-active-glow');
                setTimeout(() => promptArea.classList.remove('neural-active-glow'), 3000);
            }, 600);

            localStorage.removeItem('jules_task_payload');
            localStorage.removeItem('jules_clipboard');
            localStorage.removeItem('jules_linked_task_id');

            if (payload.source_task) {
                window.JulesPanelState.linkedTaskId = payload.source_task.id;
                checkBranchWarning();
            }
            return;
        } catch (e) { console.error("Error parsing jules_task_payload", e); }
    }

    const content = localStorage.getItem('jules_clipboard');
    if (content) {
        if (promptArea) {
            promptArea.value = content;
            showToast("Prompt importado desde Neural Chat", "green");
            switchView('neural');

            setTimeout(() => {
                promptArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                promptArea.classList.add('neural-active-glow');
                setTimeout(() => promptArea.classList.remove('neural-active-glow'), 3000);
            }, 600);
            localStorage.removeItem('jules_clipboard');

            const taskId = localStorage.getItem('jules_linked_task_id');
            if (taskId) {
                window.JulesPanelState.linkedTaskId = taskId;
                localStorage.removeItem('jules_linked_task_id');
                const task = (window.JulesPanelState.tasks || []).find(t => String(t.id) === String(taskId));
                if (task) {
                    window.JulesPanelState.activePayload = { source_task: task };
                    checkBranchWarning();
                }
            }
        }
    }
}

window.updateUserUI = async function(user) {
    const avatarUrl = user.avatar_url || 'https://github.com/' + user.login + '.png';

    if ($('sb-avatar')) {
        $('sb-avatar').innerHTML = '<img src="' + avatarUrl + '" style="width:100%; height:100%; border-radius:50%">';
    }
    if ($('sb-user-name')) {
        $('sb-user-name').textContent = user.login;
    }

    if ($('mob-avatar')) {
        $('mob-avatar').style.display = 'flex';
        $('mob-avatar').innerHTML = '<img src="' + avatarUrl + '" style="width:100%; height:100%; border-radius:50%">';
    }

    if ($('hdr-user')) {
        $('hdr-user').style.display = 'flex';
        $('hdr-avatar').innerHTML = '<img src="' + avatarUrl + '" style="width:100%; height:100%; border-radius:50%">';
        $('hdr-username').textContent = user.login;
    }

    try {
        const res = await fetch('{{ "/assets/data/team.json" | relative_url }}');
        if (res.ok) {
            const team = await res.json();
            const member = team.find(m => m.github && m.github.toLowerCase().includes(user.login.toLowerCase()));
            if (member && member.role) {
                if ($('hdr-role')) $('hdr-role').textContent = member.role;
            }
        }
    } catch (e) { console.warn("Could not fetch user role", e); }
}

window.desvincularNeuralSession = function() {
    const sid = getLinkedJulesSessionId();
    if (sid) {
        const sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
        const s = sessions.find(sess => sess.id === sid);
        if (s) {
            s.status = 'archived';
            localStorage.setItem('hy_neural_sessions', JSON.stringify(sessions));
        }
    }

    localStorage.removeItem('hy_neural_active');
    const claudeId = localStorage.getItem('hy_active_claude_session_id');
    if (claudeId) {
        localStorage.removeItem('hy_neural_session_id_' + claudeId);
    }
    localStorage.removeItem('hy_neural_session_id');
    localStorage.removeItem('hy_neural_task_context');
    localStorage.removeItem('hy_neural_pending_prompt');
    localStorage.removeItem('hy_neural_thread');
    stopNeuralPolling();
    $('neural-session-banner').classList.add('hidden');
    $('v2-task-context').classList.add('hidden');
    if (window.JulesPanelState.activePayload) {
        delete window.JulesPanelState.activePayload.source_task;
    }
    showToast("Sesión neural desvinculada (archivada)", "info");
}

window.launchSession = async function() {
    let prompt = $('session-prompt').value.trim();
    if (!prompt) { $('session-prompt').focus(); showToast("Escribe una tarea para Jules", "red"); return; }
    const source = window.JulesPanelState.activeRepo, branch = window.JulesPanelState.activeBranch || 'master';

    addTel("SYSTEM", "Iniciando sesión - Source: \"" + source + "\", Branch: \"" + branch + "\"", "info");
    console.log("[Jules Debug] Source:", source, "Branch:", branch);

    if (!source || source.includes("Cargando")) {
        showToast("Selecciona un repositorio válido", "red");
        return;
    }

    if ($('opt-review').classList.contains('active') && !getLinkedJulesSessionId()) {
        showToast("Selecciona primero Modo Automático para iniciar una nueva sesión", "red");
        return;
    }

    if ($('opt-tests').classList.contains('active')) {
        prompt += "\n\nIMPORTANTE: Genera tests unitarios automáticos para cubrir estos cambios.";
    }
    if ($('opt-branch').classList.contains('active')) {
        prompt += "\n\nIMPORTANTE: Crea y trabaja en una nueva rama dedicada para esta tarea (ej: jules/task-" + Date.now() + ").";
    }

    const btn = $('launch-btn');
    const textarea = $('session-prompt');
    btn.disabled = true;
    textarea.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Iniciando...';

    try {
        const body = { prompt, sourceContext: { source, githubRepoContext: { startingBranch: branch } } };

        if ($('opt-auto').classList.contains('active')) {
            body.requirePlanApproval = false;
            body.automationMode = "AUTO_CREATE_PR";
        } else if ($('opt-review').classList.contains('active')) {
            body.requirePlanApproval = true;
        }

        const res = await window.julesApi.createSession(body);
        const sid = res.name.split('/').pop();
        showToast("Sesión iniciada correctamente", "green");
        addTel("JULES", "Sesión iniciada: " + sid, "success");

        const claudeId = localStorage.getItem('hy_active_claude_session_id');
        if (claudeId) {
            localStorage.setItem('hy_neural_session_id_' + claudeId, sid);
        }
        localStorage.setItem('hy_neural_session_id', sid);

        startNeuralPolling(sid, true);
        const taskContext = JSON.parse(localStorage.getItem('hy_neural_task_context') || '{}');
        const sessionName = taskContext.titulo || taskContext.title || "Sesión Neural " + new Date().toLocaleDateString();
        const now = new Date().toISOString();

        localStorage.setItem('hy_neural_active', 'true');
        localStorage.setItem('hy_neural_session_name', sessionName);
        localStorage.setItem('hy_neural_session_start', now);

        const sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
        sessions.unshift({
            id: sid,
            name: sessionName,
            task_id: taskContext.id || null,
            task_title: taskContext.titulo || taskContext.title || '---',
            branch: branch,
            start: now,
            status: 'active',
            messages: []
        });
        localStorage.setItem('hy_neural_sessions', JSON.stringify(sessions));

        if (window.JulesPanelState.linkedTaskId) {
            await window.taskOps.updateTask(window.JulesPanelState.linkedTaskId, {
                jules_session: {
                    session_id: sid,
                    initiated_by: window.githubApi.user?.login || 'Invitado',
                    status: 'PLANNING',
                    updated_at: new Date().toISOString()
                }
            });
            window.JulesPanelState.linkedTaskId = null;
        }

        $('session-prompt').value = ''; await refreshDashboard();
    } catch (e) {
        console.error("[Jules Debug] Error en createSession:", e);
        const errorInfo = {
            message: e.message,
            status: e.httpStatus,
            details: e.fullDetails
        };
        addTel("SYSTEM", JSON.stringify(errorInfo), "error");
        showToast(e.message || "Error al lanzar sesión", "red");
    }
    finally {
        btn.disabled = false;
        textarea.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.startPolling = function() {
    stopPolling();
    window.sessionPollInterval = setInterval(() => {
        if (!document.hidden) {
            refreshDashboard();
            checkClipboard();
        }
    }, 10000);
}
window.stopPolling = function() { if (window.sessionPollInterval) clearInterval(window.sessionPollInterval); }

window.startNeuralPolling = function(sessionId = null) {
    const sid = sessionId || getLinkedJulesSessionId();
    if (!sid) return;

    refreshActivities(sid);
    stopNeuralPolling();
    window.neuralPollInterval = setInterval(() => {
        if (!document.hidden) {
            if (localStorage.getItem('hy_neural_active') !== 'true') {
                stopNeuralPolling();
                return;
            }
            refreshActivities(sid);
        }
    }, 15000);
}

window.stopNeuralPolling = function() {
    if (window.neuralPollInterval) {
        clearInterval(window.neuralPollInterval);
        window.neuralPollInterval = null;
    }
}
