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
    const token = getGitHubToken();

    // Si no hay usuario ni token, directo a login
    if (!user && !token) {
        console.log("[JULES-AUTH] No user and no token. Showing login card.");
        showAuthCard("auth-card-login");
        return;
    }

    // Si hay token pero no usuario, mostramos carga mientras validamos
    if (!user && token) {
        console.log("[JULES-AUTH] Token present but no user. Validating...");
        showAuthCard("auth-card-loading");
        try {
            const res = await window.githubApi.validateToken();
            if (res.valid) {
                user = res.user;
            } else {
                console.warn("[JULES-AUTH] Token validation returned invalid.");
                // Si el token es inválido y no hay bypass, pedimos login
                if (!window._julesBypass) {
                    showAuthCard("auth-card-login");
                    return;
                }
            }
        } catch (e) {
            console.error("[JULES-AUTH] Pre-init validation failed:", e);
            if (!window._julesBypass) {
                showAuthCard("auth-card-error");
                return;
            }
        }
    }

    window.__julesPanelState ||= {
      initializationPromise: null,
      initialized: false,
      listenersRegistered: false
    };

    const state = window.__julesPanelState;

    if (state.initialized) {
        return;
    }

    if (state.initializationPromise) {
        return state.initializationPromise;
    }

    state.initializationPromise = (async () => {
        // A este punto, o tenemos usuario, o estamos en bypass
        $("auth-overlay").classList.remove("show");
        $("app-root").classList.remove("locked");

        if (user && user.login) {
            console.log("[JULES-AUTH] Initializing as user:", user.login);
            updateUserUI(user);
            addTel("SYSTEM", "Iniciado como " + user.login, "success");
        } else {
            console.warn("[JULES-AUTH] Initializing as GUEST (no valid user resolved)");
            addTel("SYSTEM", "Iniciado como Invitado", "success");
        }

        // Initialize components with independent error handling
        try {
            await initializeRepoSelector();
        } catch(e) { console.error("Repo selector failed", e); }

        registerPanelListenersOnce();

        // Execute exactly one coordinated parallel load instead of two separate functions
        try {
            await requestDashboardRefresh('initial-load', { force: true, immediate: true });
        } catch(e) { console.error("Initial coordinated Jules refresh failed", e); }

        // Eager-load GitHub Ops badge counts (background, non-blocking)
        if (getGitHubToken()) {
            var _eagerRepo = window.JulesPanelState.activeRepo;
            var _eagerParsed = _eagerRepo && window.parseSourceName ? window.parseSourceName(_eagerRepo) : null;
            if (_eagerParsed && _eagerParsed.owner && _eagerParsed.repo) {
                fetchHubPRs(_eagerParsed.owner, _eagerParsed.repo).catch(function(e) { console.warn("Eager PR badge load failed", e); });
                fetchHubIssues(_eagerParsed.owner, _eagerParsed.repo).catch(function(e) { console.warn("Eager Issues badge load failed", e); });
            }
            fetchHubNotifs().catch(function(e) { console.warn("Eager Notifs badge load failed", e); });
        }

        switchView(window.JulesPanelState.currentView || 'dashboard');
        window.initJulesPanelNeuralChat();
        if (window.updateSidebarContextLabel) window.updateSidebarContextLabel();
        await handleUrlParams();
        checkClipboard();

        // Start polling ONLY if the initial load was fully successful (authenticated and ready/empty)
        const errStates = ['network-error', 'rate-limited', 'service-error'];
        if (window.julesApiAuthState === 'authenticated' && !errStates.includes(window.currentJulesState)) {
            startPolling();
        }

        state.initialized = true;
    })();

    try {
        await state.initializationPromise;
    } catch (err) {
        console.error("[JULES-AUTH] initRealPanel promise failed:", err);
        state.initialized = false;
        throw err;
    } finally {
        state.initializationPromise = null;
    }
}

window.registerPanelListenersOnce = function() {
    window.__julesPanelState ||= {
      initializationPromise: null,
      initialized: false,
      listenersRegistered: false
    };

    const state = window.__julesPanelState;
    if (state.listenersRegistered) {
        return;
    }
    state.listenersRegistered = true;

    console.log("[JULES-INIT] Registering once-only panel listeners.");

    if (typeof window.initHistoryControls === 'function') {
        window.initHistoryControls();
    }
};

/**
 * Shared task/message handoff. It NEVER sends messages automatically.
 * Repositories and branches are validated before the task launch can execute.
 */
window.resizeJulesDraftTextarea = function(textarea = document.getElementById('session-prompt')) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const needed = textarea.scrollHeight || 240;
    textarea.style.height = Math.min(420, Math.max(240, needed)) + 'px';
    textarea.style.overflowY = needed > 420 ? 'auto' : 'hidden';
};

window.prefillTaskFromHandoff = async function(task, handoff = {}) {
    let payload = null;
    try {
        payload = JSON.parse(localStorage.getItem('jules_task_payload') || 'null');
    } catch (error) {
        console.warn('[Jules Handoff] Invalid payload ignored');
    }

    const contextTask = task || payload?.source_task || {};
    const claudeId = String(handoff.claude_conversation_id || payload?.claude_conversation_id || '');
    const taskTitle = contextTask.titulo || contextTask.title || '';
    const isDashboardTask = handoff.source === 'dashboard' || handoff.intent === 'new-task';

    const fragments = [];
    if (payload?.user_note) fragments.push('[NOTA DEL USUARIO]\n' + payload.user_note);
    if (payload?.session_context) fragments.push('[CONTEXTO CLAUDE]\n' + payload.session_context);
    if (payload?.claude_response) fragments.push('[RESPUESTA DE CLAUDE]\n' + payload.claude_response);

    if (!fragments.length && contextTask.id) {
        fragments.push(
            'Tarea #' + contextTask.id + ' — ' + taskTitle +
            '\n\n' + (contextTask.descripcion || contextTask.description || '') +
            '\n\nAnaliza el alcance, las dependencias y los bloqueos. Propón un plan verificable antes de ejecutar cambios.'
        );
    }
    const formattedPrompt = fragments.join('\n\n').trim();
    if (!formattedPrompt) {
        showToast('El traspaso no contiene ninguna instrucción para Jules.', 'red');
        return;
    }

    const targetRepo = contextTask.repository || contextTask.repo
        || payload?.source_task?.repository || payload?.source_task?.repo || '';
    const targetBranch = contextTask.rama || contextTask.branch || payload?.rama || '';
    const canonicalRepo = targetRepo && window.getCanonicalRepoName
        ? window.getCanonicalRepoName(targetRepo) : '';
    const sidRaw = handoff.linked_jules_session_id || payload?.linked_jules_session_id
        || (claudeId ? localStorage.getItem('hy_neural_session_id_' + claudeId) : null);
    const linkedSid = String(sidRaw || '').replace(/^sessions\//, '');
    let existing = null;

    // Never borrow the globally active Jules session for a different task.
    if (!isDashboardTask && linkedSid && /^[A-Za-z0-9_-]{3,100}$/.test(linkedSid)) {
        try {
            const remote = await window.julesApi.getSession('sessions/' + linkedSid);
            const terminal = ['COMPLETED', 'FAILED', 'CANCELLED', 'ERROR'];
            const remoteRepo = remote?.sourceContext?.source || '';
            const remoteBranch = remote?.sourceContext?.githubRepoContext?.startingBranch || '';
            const sameRepo = !canonicalRepo || !remoteRepo
                || window.getCanonicalRepoName(remoteRepo) === canonicalRepo;
            const sameBranch = !targetBranch || !remoteBranch || remoteBranch === targetBranch;
            if (remote && !terminal.includes(remote.state) && sameRepo && sameBranch) {
                existing = remote;
                if (!Array.isArray(window.julesSessionsCache)) window.julesSessionsCache = [];
                if (!window.julesSessionsCache.some(x => x.name?.endsWith('/' + linkedSid))) {
                    window.julesSessionsCache.unshift({ ...remote, name: 'sessions/' + linkedSid });
                }
            }
        } catch (error) {
            console.warn('[Jules Handoff] Session unavailable; preparing a draft, not sending.');
        }
    }

    // Restore the original Claude conversation, but only if it still exists.
    if (claudeId) {
        const saved = window.julesPanelSessions || [];
        if (saved.some(x => x.id === claudeId) && typeof window.loadJulesPanelSession === 'function') {
            window.loadJulesPanelSession(claudeId);
        }
    }

    if (contextTask.id) {
        localStorage.setItem('hy_neural_task_context', JSON.stringify(contextTask));
        window.JulesPanelState.linkedTaskId = contextTask.id;
        if (typeof showTaskContextInChat === 'function') showTaskContextInChat(contextTask);
    } else {
        window.JulesPanelState.linkedTaskId = null;
    }
    if (claudeId) localStorage.setItem('hy_pending_claude_handoff_id', claudeId);
    if (!existing) localStorage.setItem('hy_handoff_autolink', 'true');

    if (existing) {
        if (claudeId && typeof window.linkClaudeToJulesTask === 'function') {
            window.linkClaudeToJulesTask(claudeId, linkedSid, existing.title || linkedSid);
        }
        window.NeuralWorkspaceState.activeJulesSessionId = linkedSid;
        localStorage.setItem('hy_neural_session_id', linkedSid);
        if (claudeId) localStorage.setItem('hy_neural_session_id_' + claudeId, linkedSid);
        switchView('chat');
        window.setNeuralWorkspaceMode('jules');
        if (typeof window.setJulesComposerDraft === 'function') {
            window.setJulesComposerDraft('jules', formattedPrompt);
        } else if ($('v2-chat-input')) {
            $('v2-chat-input').value = formattedPrompt;
            $('v2-chat-input').dispatchEvent(new Event('input'));
        }
        showToast('Mensaje preparado para Jules en su sesión vinculada. Revisa y pulsa Enviar.', 'green');
    } else {
        // New work must start from an existing GitHub branch. Never assume main.
        switchView('neural');
        if ($('opt-supervised')) $('opt-supervised').classList.add('active');
        if ($('opt-review')) $('opt-review').classList.remove('active');
        if ($('opt-auto')) $('opt-auto').classList.remove('active');

        if (canonicalRepo && typeof window.selectRepo === 'function') {
            // Pin target before loading branches, including during background refresh.
            window.JulesPanelState.handoffTargetRepo = canonicalRepo;
            window.JulesPanelState.handoffTargetBranch = targetBranch;
            await window.selectRepo(canonicalRepo);
        }

        const select = $('branch-sel');
        const launchBtn = $('launch-btn');
        let branchReady = false;
        if (canonicalRepo && select && !select.disabled && select.dataset.repo === canonicalRepo) {
            if (targetBranch && [...select.options].some(o => o.value === targetBranch)) {
                select.value = targetBranch;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                branchReady = true;
            } else if (!targetBranch && select.value) {
                branchReady = true;
            }
        }

        window.JulesPanelState._handoffBranchBlocked = !!(canonicalRepo && !branchReady);
        if (launchBtn && branchReady) {
            launchBtn.disabled = false;
            launchBtn.title = '';
        }
        if (launchBtn && window.JulesPanelState._handoffBranchBlocked) {
            launchBtn.disabled = true;
            launchBtn.title = 'La rama solicitada no está disponible. Selecciona una rama existente en Jules Panel.';
            showToast('La rama de esta tarea no está disponible en GitHub. Selecciona una rama existente antes de ejecutar.', 'amber');
        }

        const textArea = $('session-prompt');
        if (textArea) {
            textArea.value = formattedPrompt;
            window.resizeJulesDraftTextarea(textArea);
        }
        const banner = $('neural-session-banner');
        if (banner && contextTask.id) {
            banner.classList.remove('hidden');
            const label = $('neural-banner-task');
            if (label) {
                label.textContent = 'Tarea #' + contextTask.id + ': ' + taskTitle;
                label.classList.remove('skeleton');
            }
        }
        showToast('Borrador listo en Nueva Tarea Jules (revisión supervisada).', 'green');
    }

    // Consume a handoff once. Reloads must not send or duplicate a task.
    for (const key of ['jules_task_payload', 'hy_jules_handoff', 'jules_clipboard', 'jules_linked_task_id']) {
        localStorage.removeItem(key);
    }
};

window.handleUrlParams = async function() {
    const handoffRaw = localStorage.getItem('hy_jules_handoff');
    if (handoffRaw) {
        try {
            const handoff = JSON.parse(handoffRaw);
            if (handoff && Date.now() - Number(handoff.timestamp) < 10 * 60 * 1000) {
                await prefillTaskFromHandoff(handoff.task || null, handoff);
                return;
            }
        } catch (e) {
            console.warn('[Jules Handoff] Ignoring invalid or expired handoff');
        }
        localStorage.removeItem('hy_jules_handoff');
    }
    // A Claude response can be sent without a dashboard task; this path must still
    // land in the correct composer and must never re-submit automatically.
    const pendingClaudePayload = localStorage.getItem('jules_task_payload');
    if (pendingClaudePayload) {
        let parsed = null;
        try { parsed = JSON.parse(pendingClaudePayload); } catch (e) {}
        if (parsed && Date.now() - Number(parsed.timestamp || 0) < 10 * 60 * 1000) {
            await prefillTaskFromHandoff(parsed.source_task || null, {
                source: 'claude-chat', claude_conversation_id: parsed.claude_conversation_id,
                linked_jules_session_id: parsed.linked_jules_session_id
            });
            return;
        }
        localStorage.removeItem('jules_task_payload');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const taskDataRaw = urlParams.get('task_data');
    const taskId = urlParams.get('task_id');
    const isNewTaskSent = localStorage.getItem('hy_neural_new_task_sent') === 'true';

    if (taskDataRaw || taskId || isNewTaskSent) {
        let task = null;
        if (taskDataRaw) {
            try {
                task = JSON.parse(decodeURIComponent(taskDataRaw));
            } catch(e) { console.error("Error parsing task_data param", e); }
        } else if (isNewTaskSent) {
            try {
                task = JSON.parse(localStorage.getItem('hy_neural_task_context'));
                localStorage.removeItem('hy_neural_new_task_sent');
            } catch(e) { console.error("Error parsing localStorage task context", e); }
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
        const res = await fetch('/assets/data/team.json');
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
    if (!confirm("¿Estás seguro de que deseas desvincular la sesión neural activa?")) return;

    const sid = getLinkedJulesSessionId();
    if (sid) {
        const sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
        const s = sessions.find(sess => sess.id === sid);
        if (s) {
            s.status = 'archived';
            localStorage.setItem('hy_neural_sessions', JSON.stringify(sessions));
        }
    }

    // Atomic clear of state
    localStorage.removeItem('hy_neural_active');
    const claudeId = localStorage.getItem('hy_active_claude_session_id');
    if (claudeId) {
        localStorage.removeItem('hy_neural_session_id_' + claudeId);
    }
    localStorage.removeItem('hy_neural_session_id');
    localStorage.removeItem('hy_neural_task_context');
    localStorage.removeItem('hy_neural_pending_prompt');
    localStorage.removeItem('hy_neural_thread');

    // Clear caches
    window.julesSessionsCache = [];
    window.julesSourcesCache = [];

    stopNeuralPolling();

    // UI Reset
    if ($('neural-session-banner')) $('neural-session-banner').classList.add('hidden');
    if ($('v2-task-context')) $('v2-task-context').classList.add('hidden');

    if (window.JulesPanelState.activePayload) {
        delete window.JulesPanelState.activePayload.source_task;
    }

    showToast("Sesión neural desvinculada. Limpiando estado...", "amber");

    // Refresh data atomically
    if (typeof refreshDashboard === 'function') {
        refreshDashboard().then(() => {
            showToast("Estado sincronizado", "green");
        });
    } else {
        location.reload();
    }
}

window.launchSession = async function(options = {}) {
    // A first Jules chat message creates a session using the user's text as
    // its initial prompt. Subsequent messages use :sendMessage, never both.
    if (window._julesLaunchInFlight) return null;
    let prompt = String(options.promptOverride ?? $('session-prompt')?.value ?? '').trim();
    if (!prompt) { $('session-prompt')?.focus(); showToast("Escribe una tarea para Jules", "red"); return null; }

    // Ensure repo and branch are real and normalized
    const source = window.JulesPanelState.activeRepo;
    const branch = window.JulesPanelState.activeBranch;
    const selectedRepo = localStorage.getItem('hypenosys_active_repo') || '';
    const selectedBranch = $('branch-sel');
    if (window.JulesPanelState._handoffBranchBlocked || !selectedBranch || selectedBranch.disabled ||
        selectedBranch.value !== branch || selectedBranch.dataset.repo !== window.getCanonicalRepoName(selectedRepo)) {
        showToast('Verifica y selecciona una rama existente de este repositorio antes de ejecutar.', 'red');
        return;
    }

    if (!source || source.includes("Cargando") || source === 'null') {
        showToast("Selecciona un repositorio válido", "red");
        return;
    }

    if (!branch || branch === 'Error' || branch === 'Cargando...') {
        showToast("Selecciona una rama válida", "red");
        return;
    }

    addTel("SYSTEM", "Iniciando sesión - Source: \"" + source + "\", Branch: \"" + branch + "\"", "info");
    console.log("[Jules Debug] Source:", source, "Branch:", branch);

    if (!source || source.includes("Cargando")) {
        showToast("Selecciona un repositorio válido", "red");
        return;
    }

    // Capture current UI mode (frontend state)
    const isAuto = $('opt-auto').classList.contains('active');
    const isReview = $('opt-review').classList.contains('active');
    const isSupervised = !!$('opt-supervised')?.classList.contains('active');

    if (!isAuto && !isReview && !isSupervised) {
        showToast("Selecciona un modo de ejecución para iniciar la sesión.", "red");
        return;
    }

    // Append mode-specific instructions to prompt
    if (isSupervised) {
        prompt += "\n\n[MODO SUPERVISADO] Prepara un plan con cambios, validación y riesgos; espera aprobación humana antes de modificar código. No hagas merge ni despliegues.";
    }
    if (isReview) {
        prompt += "\n\n[MODO REVISIÓN ACTIVADO]\nInstrucciones obligatorias:\n1. Revisa exclusivamente los cambios actuales en la rama.\n2. NO modifiques ningún archivo.\n3. NO realices commits ni crees PRs.\n4. Devuelve tus hallazgos y sugerencias ordenados por severidad.";
    }

    if ($('opt-tests').classList.contains('active')) {
        prompt += "\n\nIMPORTANTE: Genera tests unitarios automáticos para cubrir estos cambios.";
    }
    if ($('opt-branch').classList.contains('active')) {
        prompt += "\n\nIMPORTANTE: Crea y trabaja en una nueva rama dedicada para esta tarea (ej: jules/task-" + Date.now() + ").";
    }

    const btn = $('launch-btn');
    const textarea = $('session-prompt');
    window._julesLaunchInFlight = true;
    btn.disabled = true;
    textarea.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Iniciando...';

    try {
        // This is a per-user safety cap, not a server-side global quota.
        // Remote list (rather than UI cache) keeps concurrent sessions visible.
        const existingSessions = await window.julesApi.listSessions(100);
        if (!Array.isArray(existingSessions)) throw new Error('No se pudo consultar el número de sesiones Jules.');
        const activeStates = new Set(['QUEUED','PLANNING','AWAITING_PLAN_APPROVAL','AWAITING_USER_FEEDBACK','IN_PROGRESS','PAUSED']);
        const active = existingSessions.filter(item => activeStates.has(item.state));
        if (active.length >= 3) {
            throw new Error('Límite HAIS: ya hay ' + active.length + ' sesiones Jules activas o esperando intervención (máximo 3). Finaliza o resuelve una antes de iniciar otra.');
        }

        // Block actual unresolved dependencies, rather than relying solely
        // on a status badge. No auto-relocation of blocked tasks.
        const linkedContext = JSON.parse(localStorage.getItem('hy_neural_task_context') || '{}');
        const blockedBy = Array.isArray(linkedContext.blocked_by) ? linkedContext.blocked_by : [];
        if (blockedBy.length && window.taskOps?.getAllTasks) {
            const allTasks = await window.taskOps.getAllTasks();
            const unresolved = blockedBy.filter(taskId => {
                const dep = (allTasks || []).find(t => String(t.id) === String(taskId));
                return !dep || !['DONE','Fixed','COMPLETED'].includes(String(dep.estado || dep.status));
            });
            if (unresolved.length) throw new Error('Tarea bloqueada por dependencias sin completar: ' + unresolved.join(', ') + '. Revisa el Kanban antes de ejecutar.');
        }
        if (linkedContext.estado === 'BLOCKED' && !blockedBy.length && !window.confirm('Esta tarea está marcada como BLOCKED. ¿Quieres iniciar solo una revisión supervisada de sus bloqueos?')) {
            return null;
        }

        // Prepare API payload (only supported fields)
        const body = {
            prompt,
            sourceContext: { source, githubRepoContext: { startingBranch: branch } },
            requirePlanApproval: isReview || isSupervised // Supervised mode blocks execution until human approval
        };

        if (isAuto) {
            body.requirePlanApproval = false;
            body.automationMode = "AUTO_CREATE_PR";
        }

        // Defensive Logging (internal UI state + final API body)
        const logPayload = {
            ui_mode: isAuto ? "auto" : isSupervised ? "supervised" : "review",
            api_body: {
                requirePlanApproval: body.requirePlanApproval,
                automationMode: body.automationMode || "NONE",
                repo: source,
                branch: branch
            }
        };
        console.log("[Jules Launch] UI State:", {isAuto, isReview}, "API Body:", body);
        addTel("SYSTEM", "Iniciando (UI:" + logPayload.ui_mode + ") - API Payload: " + JSON.stringify(logPayload.api_body), "info");

        const res = await window.julesApi.createSession(body);
        if (!res?.name || !/^sessions\/[^/]+$/.test(res.name)) throw new Error('Jules respondió sin un ID de sesión válido.');
        const sid = res.name.split('/').pop();
        window._lastCreatedJulesSessionId = sid;
        showToast("Sesión iniciada correctamente", "green");
        addTel("JULES", "Sesión iniciada: " + sid, "success");

        const taskContext = JSON.parse(localStorage.getItem('hy_neural_task_context') || '{}');
        const sessionName = taskContext.titulo || taskContext.title || "Sesión Neural " + new Date().toLocaleDateString();

        startNeuralPolling(sid, true);

        // When a task was explicitly handed off, link the newly created Jules
        // session to the matching Claude conversation; never link to a stale session.
        const shouldAutoLink = localStorage.getItem('hy_handoff_autolink') === 'true';
        const handoffClaudeId = localStorage.getItem('hy_pending_claude_handoff_id');
        if ((shouldAutoLink || options.fromChat) && typeof window.linkClaudeToJulesTask === 'function') {
            const knownClaude = handoffClaudeId && (window.julesPanelSessions || []).some(s => s.id === handoffClaudeId);
            if (knownClaude) {
                window.linkClaudeToJulesTask(handoffClaudeId, sid, sessionName);
                window.loadJulesPanelSession?.(handoffClaudeId);
            } else if (typeof window.createNewClaudeFromJulesSession === 'function') {
                window.createNewClaudeFromJulesSession(sid);
            }
            localStorage.setItem('hy_neural_session_id', sid);
            window.NeuralWorkspaceState.activeJulesSessionId = sid;
            window.switchView?.('chat');
            window.setNeuralWorkspaceMode?.('jules');
            showToast('Sesión Jules y conversación Claude vinculadas.', 'green');
        } else if (window.showJulesCreationLinkingChoices) {
            window.showJulesCreationLinkingChoices(sid, sessionName);
        } else {
            localStorage.setItem('hy_neural_session_id', sid);
        }
        localStorage.removeItem('hy_handoff_autolink');
        localStorage.removeItem('hy_pending_claude_handoff_id');
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
            const currentUser = window.githubApi.user || user;
            await window.taskOps.updateTask(window.JulesPanelState.linkedTaskId, {
                jules_session: {
                    session_id: sid,
                    initiated_by: (currentUser && currentUser.login) || 'Invitado',
                    status: 'PLANNING',
                    updated_at: new Date().toISOString()
                }
            });
            window.JulesPanelState.linkedTaskId = null;
        }

        if (!options.fromChat) $('session-prompt').value = '';
        // A dashboard refresh is secondary; a successful create must never
        // look like a failed create (which could cause a duplicate retry).
        try { await refreshDashboard(); }
        catch (refreshError) { console.warn('[Jules] Session created; dashboard refresh failed', refreshError); }
        return sid;
    } catch (e) {
        console.error("[Jules Debug] Error en createSession:", e);
        const errorInfo = {
            message: e.message,
            status: e.httpStatus,
            details: e.fullDetails
        };
        addTel("SYSTEM", JSON.stringify(errorInfo), "error");
        showToast(e.message || "Error al lanzar sesión", "red");
        return window._lastCreatedJulesSessionId || null;
    }
    finally {
        window._julesLaunchInFlight = false;
        btn.disabled = !!window.JulesPanelState._handoffBranchBlocked;
        textarea.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.startJulesPolling = function() {
    console.log("[JULES-POLLING] startJulesPolling bridging to active-session polling.");
    if (typeof window.syncSessionPolling === 'function') {
        window.syncSessionPolling();
    }
}

window.stopJulesPolling = function() {
    console.log("[JULES-POLLING] stopJulesPolling bridging to stopActiveSessionPolling.");
    if (typeof window.stopActiveSessionPolling === 'function') {
        window.stopActiveSessionPolling();
    }
    if (typeof window.clearJulesRetry === 'function') {
        window.clearJulesRetry();
    }
}

// Keep backward compatibility
window.startPolling = window.startJulesPolling;
window.stopPolling = window.stopJulesPolling;

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

window.checkBranchWarning = function() {
    const banner = $('branch-warning-banner');
    if (!banner) return;

    const task = JSON.parse(localStorage.getItem('hy_neural_task_context') || '{}');
    const expectedBranch = task.rama || task.branch;
    const currentBranch = window.JulesPanelState.activeBranch;

    if (!expectedBranch || !currentBranch) {
        banner.classList.add('hidden');
        banner.style.display = 'none';
        return;
    }

    const normExpected = window.normalizeBranchName(expectedBranch);
    const normCurrent = window.normalizeBranchName(currentBranch);

    if (normExpected && normCurrent && normExpected !== normCurrent) {
        banner.classList.remove('hidden');
        banner.style.display = 'flex';
        const warnText = $('branch-warning-text');
        if (warnText) warnText.textContent = 'La rama actual (' + normCurrent + ') no es la esperada (' + normExpected + ') para esta tarea.';
    } else {
        banner.classList.add('hidden');
        banner.style.display = 'none';
    }
}
