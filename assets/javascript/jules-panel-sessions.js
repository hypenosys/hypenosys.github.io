/* ════════════════════════════════════════
   JULES PANEL SESSIONS & HISTORY
   ════════════════════════════════════════ */

async function refreshDashboard() {
    try {
        window.julesSessionsCache = await window.julesApi.listSessions();
        console.log("[JULES-DEBUG] Sessions received:", window.julesSessionsCache);
        if (window.julesSessionsCache.length > 0) {
            console.log("[JULES-DEBUG] Sample session structure:", JSON.stringify(window.julesSessionsCache[0], null, 2));
        }
        renderMetrics();
        renderHistoryTable(window.julesSessionsCache);
        updateKanbanCounts(window.julesSessionsCache);
        updateNeuralHistory(window.julesSessionsCache);

        // Render Kanban cards
        if (typeof window.renderKanban === 'function') {
            window.renderKanban(window.julesSessionsCache);
        }
    } catch (e) {
        console.error("Dashboard refresh failed:", e);
    }
}

function renderHistoryTable(sessions) {
    const tbody = $('history-tbody');
    if (!tbody) return;

    if (!sessions || sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="notif-empty">No hay sesiones recientes</td></tr>';
        return;
    }

    tbody.innerHTML = sessions.map(s => {
        const sid = s.name.split('/').pop();
        const repo = (s.sourceContext && s.sourceContext.source && s.sourceContext.source.split('/').pop()) || '---';
        const branch = (s.sourceContext && s.sourceContext.githubRepoContext && s.sourceContext.githubRepoContext.startingBranch) || '---';
        const stateClass = s.state.toLowerCase().replace(/_/g, '-');

        // Calculate Duration
        let duration = '---';
        if (s.createTime && (s.updateTime || s.state === 'COMPLETED')) {
            const start = new Date(s.createTime);
            const end = s.state === 'COMPLETED' ? new Date(s.updateTime || Date.now()) : new Date();
            const diffMs = end - start;
            const diffMins = Math.floor(diffMs / 60000);
            const diffSecs = Math.floor((diffMs % 60000) / 1000);
            duration = diffMins + 'm ' + diffSecs + 's';
        }

        const taskTitle = s.title || s.prompt || 'Sin título';

        return '<tr onclick="handleRowClick(event, \'' + s.name + '\')" data-sid="' + sid + '">' +
               '<td onclick="handleCheckboxClick(event, \'' + sid + '\')">' +
               '<div class="custom-control custom-checkbox">' +
               '<input type="checkbox" class="session-checkbox" data-sid="' + sid + '">' +
               '</div>' +
               '</td>' +
               '<td><span class="sid">#' + sid + '</span></td>' +
               '<td><div class="tdesc" title="' + escapeHtml(taskTitle) + '">' + escapeHtml(taskTitle) + '</div></td>' +
               '<td><div class="tmono">' + repo + '</div></td>' +
               '<td><div class="tmono">' + branch + '</div></td>' +
               '<td><span class="sbadge ' + stateClass + '">' + s.state + '</span></td>' +
               '<td style="color:var(--text3); font-family:var(--font-mono); font-size:11px">' + duration + '</td>' +
               '<td style="font-size:11px; color:var(--text3)">' + getTimeAgo(s.createTime) + '</td>' +
               '</tr>';
    }).join('');

    const skeletons = tbody.querySelectorAll('.skeleton');
    skeletons.forEach(s => s.classList.remove('skeleton', 'skeleton--loading'));
}

function updateNeuralHistory(sessions) {
    const list = $('sb-neural-history-list');
    if (!list) return;

    if (!sessions || sessions.length === 0) {
        list.innerHTML = '<div class="notif-empty" style="font-size: 10px; padding: 10px;">No hay sesiones recientes</div>';
        return;
    }

    list.innerHTML = sessions.map(s => {
        const sid = s.name.split('/').pop();
        const active = sid === localStorage.getItem('hy_neural_session_id');
        const taskTitle = s.title || s.prompt || 'Sin título';
        const repo = (s.sourceContext && s.sourceContext.source && s.sourceContext.source.split('/').pop()) || '---';
        const stateClass = s.state.toLowerCase().replace(/_/g, '-');

        return '<div class="sb-history-item' + (active ? ' active' : '') + '" data-sid="' + sid + '" onclick="selectSession(\'' + s.name + '\')" title="' + escapeHtml(taskTitle) + '">' +
               '<div class="h-task">' + escapeHtml(taskTitle) + '</div>' +
               '<div class="h-meta">' +
               '<span>#' + sid + ' · ' + repo + '</span>' +
               '<span class="sbadge ' + stateClass + '" style="font-size:7px; padding:1px 4px">' + s.state.substring(0,4) + '</span>' +
               '</div>' +
               '</div>';
    }).join('');
}

let lastSelectedIdx = -1;

window.handleRowClick = function(event, sessionName) {
    const sid = sessionName.split('/').pop();
    const rows = Array.from(document.querySelectorAll('#history-tbody tr'));
    const clickedIdx = rows.findIndex(r => r.getAttribute('data-sid') === sid);

    if (event.shiftKey && lastSelectedIdx !== -1) {
        const start = Math.min(clickedIdx, lastSelectedIdx);
        const end = Math.max(clickedIdx, lastSelectedIdx);
        for (let i = start; i <= end; i++) {
            toggleSelection(rows[i].getAttribute('data-sid'), true);
        }
    } else if (event.ctrlKey || event.metaKey) {
        toggleSelection(sid);
    } else {
        // User instruction: Clicking a row selects/deselects it.
        toggleSelection(sid);
        selectSession(sessionName);
    }
    lastSelectedIdx = clickedIdx;
}

window.handleCheckboxClick = function(event, sid) {
    event.stopPropagation();
    toggleSelection(sid);
}

function toggleSelection(sid, forceState = null) {
    const row = document.querySelector('#history-tbody tr[data-sid="' + sid + '"]');
    const checkbox = document.querySelector('.session-checkbox[data-sid="' + sid + '"]');
    const sidebarItem = document.querySelector('.sb-history-item[data-sid="' + sid + '"]');

    const newState = forceState !== null ? forceState : !checkbox.checked;

    if (row) row.classList.toggle('selected', newState);
    if (checkbox) checkbox.checked = newState;
    if (sidebarItem) sidebarItem.classList.toggle('selected', newState);

    updateSelectionUI();
}

function updateSelectionUI() {
    const selected = document.querySelectorAll('.session-checkbox:checked');
    const count = selected.length;

    const toolbar = $('neural-selection-toolbar');
    const countEl = $('selection-count');
    const analyzeBtn = document.querySelector('button[onclick="analyzeSelectedWithClaude()"]');

    if (count > 0) {
        if (toolbar) toolbar.style.display = 'flex';
        if (countEl) countEl.innerText = count;
        if (analyzeBtn) analyzeBtn.disabled = false;
    } else {
        if (toolbar) toolbar.style.display = 'none';
        if (analyzeBtn) analyzeBtn.disabled = true;
    }
}

window.clearHistorySelection = function() {
    document.querySelectorAll('.session-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('#history-tbody tr').forEach(tr => tr.classList.remove('selected'));
    document.querySelectorAll('.sb-history-item').forEach(item => item.classList.remove('selected'));
    updateSelectionUI();
}

window.selectSession = function(sessionName) {
    const sid = sessionName.split('/').pop();

    // Highlight in sidebar
    document.querySelectorAll('.sb-history-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-sid') === sid);
    });

    // Highlight in table if visible
    document.querySelectorAll('#history-tbody tr').forEach(tr => {
        const trSid = tr.getAttribute('data-sid');
        tr.classList.toggle('active-row', trSid === sid);
    });

    // Navigate to Kanban and Highlight
    if (typeof switchView === 'function') {
        switchView('kanban');

        // Wait for view switch and cards to be potentially rendered/available
        setTimeout(() => {
            const card = document.querySelector('.kb-card[data-sid="' + sid + '"]');
            if (card) {
                // Clear previous highlights
                document.querySelectorAll('.kb-card.highlight-focus').forEach(c => c.classList.remove('highlight-focus'));

                // Add focus highlight
                card.classList.add('highlight-focus');

                // Ensure it's visible
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });

                console.log("[JULES-UI] Session #" + sid + " highlighted in Kanban.");
            } else {
                console.warn("[JULES-UI] Could not find card for #" + sid + " in Kanban view.");
            }
        }, 300);
    }

    openDrawer(sessionName);
}

function updateKanbanCounts(sessions) {
    const counts = { pending: 0, running: 0, done: 0, error: 0 };
    const localOverrides = JSON.parse(localStorage.getItem('jules_kanban_overrides') || '{}');

    // Apply user filter if applicable
    const currentUser = window.githubApi.user;
    const filtered = sessions.filter(s => {
        if (!currentUser) return true;
        // Basic check: if no ownership field, keep it
        const login = currentUser.login.toLowerCase().trim();
        const creator = (s.creator || s.metadata?.creator || s.user || '').toLowerCase().trim();
        if (!creator) return true;
        return creator === login;
    });

    filtered.forEach(s => {
        const sid = s.name.split('/').pop();
        const col = localOverrides[sid] || window.normalizeJulesStatus(s.state);
        if (counts[col] !== undefined) counts[col]++;
    });

    let total = 0;
    Object.keys(counts).forEach(k => {
        const el = $('kb-count-' + k);
        if (el) el.innerText = counts[k];
        const mEl = $('m-count-' + k);
        if (mEl) mEl.innerText = counts[k];
        total += counts[k];
    });

    const hdrBadge = $('hdr-kanban-badge');
    if (hdrBadge) hdrBadge.innerText = total;
}

// Session Details Drawer logic
window.openDrawer = async function(sessionName) {
    const drawer = $('details-drawer');
    const overlay = $('details-overlay');
    if (!drawer || !overlay) return;

    drawer.classList.add('open');
    overlay.classList.add('open');

    const sid = sessionName.split('/').pop();
    $('dr-title').innerText = 'Sesión #' + sid;
    $('dr-content').innerHTML = '<div class="skeleton-block" style="height:200px"></div>';

    try {
        const session = await window.julesApi.getSession(sessionName);
        const activities = await window.julesApi.getActivities(sessionName);
        renderDrawerDetails(session, activities);
    } catch (e) {
        $('dr-content').innerHTML = '<div class="tel-line error">Error al cargar detalles: ' + e.message + '</div>';
    }
}

window.closeDrawer = function() {
    $('details-drawer').classList.remove('open');
    $('details-overlay').classList.remove('open');
}

function renderDrawerDetails(session, activities) {
    const content = $('dr-content');
    if (!content) return;

    let html = '<div class="dr-section">' +
               '<div class="dr-label">Prompt Original</div>' +
               '<div class="prose-invert" style="font-size:13px; opacity:0.8">' + escapeHtml(session.prompt) + '</div>' +
               '</div>';

    if (activities && activities.length > 0) {
        html += '<div class="dr-section"><div class="dr-label">Actividad Reciente</div>';
        activities.reverse().forEach(act => {
            html += renderActivityLine(act);
        });
        html += '</div>';
    }

    content.innerHTML = html;
}

function renderActivityLine(act) {
    const ts = getTimeAgo(act.createTime);
    let type = 'INFO';
    let msg = 'Actividad desconocida';

    if (act.userMessaged) { type = 'USER'; msg = act.userMessaged.userMessage; }
    else if (act.agentMessaged) { type = 'AGENT'; msg = act.agentMessaged.agentMessage; }
    else if (act.planGenerated) { type = 'PLAN'; msg = 'Plan generado'; }
    else if (act.planApproved) { type = 'PLAN'; msg = 'Plan aprobado'; }
    else if (act.progressUpdated) { type = 'PROG'; msg = act.progressUpdated.title; }
    else if (act.sessionCompleted) { type = 'DONE'; msg = 'Sesión completada'; }
    else if (act.sessionFailed) { type = 'FAIL'; msg = 'Sesión fallida: ' + (act.sessionFailed.reason || '---'); }
    else if (act.artifactGenerated) { type = 'FILE'; msg = 'Artefacto generado'; }

    return '<div class="tel-line ' + type.toLowerCase() + '">' +
           '<div class="tel-head"><span class="tel-time">' + ts + '</span><span class="tel-tag ' + type.toLowerCase() + '">' + type + '</span></div>' +
           '<div class="tel-msg">' + parseActivityContent(msg) + '</div>' +
           '</div>';
}

function parseActivityContent(content) {
    if (!content) return '---';
    // Basic markdown-like parsing for the drawer
    return content.replace(/`([^`]+)`/g, '<code class="u-mono">$1</code>')
                  .replace(/\n/g, '<br>');
}

// Activity rendering helpers (shared with Neural Chat)
window.renderActivityMarkdown = function(text) {
    if (!text) return "";
    let html = text;
    // Replace code blocks
    html = html.replace(/```([\s\S]*?)```/g, function(match, code) {
        const lines = code.trim().split('\n');
        let lang = "";
        if (lines[0].length < 10 && !lines[0].includes(' ')) {
            lang = lines.shift();
        }
        const cleanCode = lines.join('\n');
        return '<pre class="code-block" data-lang="' + lang + '"><code>' + escapeHtml(cleanCode) + '</code></pre>';
    });
    // Replace inline code
    html = html.replace(/`([^`]+)`/g, '<code class="u-mono">$1</code>');
    // Replace lines for simple formatting
    const lines = html.split('\n');
    const parsed = lines.map(line => {
          let cls = "";
          if (line.startsWith('### ')) { cls = "h3"; line = line.replace('### ', ''); }
          else if (line.startsWith('## ')) { cls = "h2"; line = line.replace('## ', ''); }
          else if (line.startsWith('# ')) { cls = "h1"; line = line.replace('# ', ''); }
          else if (line.startsWith('- ') || line.startsWith('* ')) { cls = "li"; line = line.replace(/^[-*]\s+/, '• '); }
          return '<div class="' + cls + '">' + escapeHtml(line) + '</div>';
    }).join('');

    return parsed;
}

window.renderUserActivity = function(msg) {
    const parsed = renderActivityMarkdown(msg);
    return '<div class="activity-entry activity-entry--user prose-invert" style="overflow-x: auto; max-width: 100%; word-break: break-word;">' + parsed + '</div>';
}

window.renderAgentActivity = function(msg) {
    const parsed = renderActivityMarkdown(msg);
    return '<div class="activity-entry activity-entry--agent prose-invert" style="overflow-x: auto; max-width: 100%; word-break: break-word;">' + parsed + '</div>';
}

window.refreshActivities = async function(sessionId) {
    if (!sessionId) return;
    try {
        const sName = sessionId.startsWith('sessions/') ? sessionId : 'sessions/' + sessionId;
        const activities = await window.julesApi.getActivities(sName);
        const session = await window.julesApi.getSession(sName);

        // Update local status
        const sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
        const idx = sessions.findIndex(s => s.id === sessionId);
        if (idx !== -1) {
            sessions[idx].status = session.state.toLowerCase();
            localStorage.setItem('hy_neural_sessions', JSON.stringify(sessions));
        }

        // Handle specific activities
        activities.forEach(act => {
            const idSafe = sessionId;
            if (act.planGenerated) {
                if (!localStorage.getItem('jules_notif_approval_' + idSafe)) {
                    if (window.addNotification) {
                        window.addNotification('Plan Generado', 'Sesión #' + idSafe + ' espera revisión del plan.', 'warn');
                    } else {
                        showToast('Sesión ' + idSafe + ' espera revisión.', 'amber');
                    }
                    localStorage.setItem('jules_notif_approval_' + idSafe, Date.now());
                }
            }
            if (act.sessionCompleted && !localStorage.getItem('jules_notif_done_' + idSafe)) {
                if (window.addNotification) window.addNotification('Tarea Completada', 'Sesión #' + idSafe + ' ha finalizado con éxito.', 'success');
                localStorage.setItem('jules_notif_done_' + idSafe, Date.now());
            }
            if (act.sessionFailed && !localStorage.getItem('jules_notif_fail_' + idSafe)) {
                if (window.addNotification) window.addNotification('Error en Sesión', 'Sesión #' + idSafe + ' ha fallado.', 'error');
                localStorage.setItem('jules_notif_fail_' + idSafe, Date.now());
            }
        });

        // Broadcast for Neural Chat UI if open
        window.dispatchEvent(new CustomEvent('julesActivitiesUpdated', { detail: { sessionId, activities, session } }));

    } catch (e) {
        console.error("Error refreshing activities:", e);
    }
}

window.getLinkedJulesSessionId = function() {
    const claudeId = localStorage.getItem('hy_active_claude_session_id');
    if (claudeId) {
        // First check in session metadata (new unified way)
        const sessions = JSON.parse(localStorage.getItem('claude_chat_sessions') || '[]');
        const current = sessions.find(s => s.id === claudeId);
        if (current && current.metadata && current.metadata.linkedJulesTaskId) {
            return current.metadata.linkedJulesTaskId;
        }
        // Fallback to legacy mapping
        return localStorage.getItem('hy_neural_session_id_' + claudeId) || localStorage.getItem('hy_neural_session_id');
    }
    return localStorage.getItem('hy_neural_session_id');
}

window.exportSessionToMarkdown = function(session, activities) {
    const sid = session.name.split('/').pop();
    let content = "# Sesión Jules #" + sid + "\n\n";
    content += "**Estado:** " + session.state + "\n";
    content += "**Prompt:** " + session.prompt + "\n\n";
    content += "## Cronología de Actividad\n\n";

    activities.forEach(act => {
        let activityType = 'INFO';
        if (act.userMessaged) activityType = 'Usuario';
        else if (act.agentMessaged) activityType = 'Jules';
        else if (act.planGenerated) activityType = 'Plan Generado';
        else if (act.planApproved) activityType = 'Plan Aprobado';
        else if (act.progressUpdated) activityType = 'Progreso: ' + act.progressUpdated.title;
        else if (act.sessionCompleted) activityType = 'Completado';
        else if (act.sessionFailed) activityType = 'Fallido';
        else if (act.artifactGenerated) activityType = 'Artefacto: ' + ((act.artifactGenerated.artifact && act.artifactGenerated.artifact.name) || '---');

        const date = new Date(act.createTime).toLocaleString();
        const separator = "\n--- Actividad: " + activityType + " ---\n";
        content += separator + "\n*Fecha: " + date + "*\n\n";

        if (act.userMessaged) {
            content += act.userMessaged.userMessage + "\n";
        } else if (act.agentMessaged) {
            content += act.agentMessaged.agentMessage + "\n";
        } else if (act.progressUpdated) {
            if (act.progressUpdated.description) content += act.progressUpdated.description + "\n";
            const steps = act.progressUpdated.steps || [];
            if (steps.length > 0) {
                content += "PASOS:\n" + steps.map(s => ((s.index || 0) + 1) + ". " + s.title + ": " + (s.description || '')).join('\n') + "\n";
            }
        } else if (act.sessionCompleted) {
            content += "Commit: " + (act.sessionCompleted.commitMessage || '---') + "\n";
        } else if (act.sessionFailed) {
            content += "Razón: " + (act.sessionFailed.reason || 'Desconocida') + "\n";
        } else if (act.artifactGenerated) {
            const art = act.artifactGenerated.artifact;
            if (art) {
                if (art.changeSet) {
                    content += "\nCÓDIGO (DIFF):\n```diff\n" + art.changeSet.gitPatch.unidiffPatch + "\n```\n";
                }
                if (art.bashOutput) {
                    content += "\nCOMANDO: " + art.bashOutput.command + "\nOUTPUT:\n```\n" + art.bashOutput.output + "\n```\n";
                }
            }
        }
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jules-session-' + sid + '.md';
    a.click();
}

window.askAboutStep = function(stepIndex, stepTitle) {
    const input = $('v2-chat-input');
    if (input) {
        input.value = "Respecto al paso " + stepIndex + " (" + stepTitle + "): " + input.value;
        input.focus();
    }
}

window.analyzeSelectedWithClaude = async function() {
    const selectedCheckboxes = document.querySelectorAll('.session-checkbox:checked');
    if (selectedCheckboxes.length === 0) return;

    const sids = Array.from(selectedCheckboxes).map(cb => cb.getAttribute('data-sid'));
    const sessions = window.julesSessionsCache || [];

    showToast("Recopilando logs y analizando...", "amber");
    let context = "Analiza las siguientes sesiones de Jules (incluyendo logs recientes):\n\n";

    for (const sid of sids) {
        const s = sessions.find(sess => sess.name.endsWith(sid));
        if (s) {
            context += "--- SESIÓN #" + sid + " ---\n";
            context += "TAREA: " + (s.title || s.prompt) + "\n";
            context += "REPO: " + (s.sourceContext?.source || '---') + "\n";
            context += "RAMA: " + (s.sourceContext?.githubRepoContext?.startingBranch || '---') + "\n";
            context += "ESTADO: " + s.state + "\n";
            context += "FECHA: " + s.createTime + "\n";

            try {
                const sName = s.name.startsWith('sessions/') ? s.name : 'sessions/' + sid;
                const activityData = await window.julesApi.getActivities(sName, 5);
                const activities = activityData.activities || [];
                if (activities.length > 0) {
                    context += "LOGS RECIENTES:\n";
                    activities.forEach(a => {
                        const msg = a.agentMessaged?.agentMessage || a.progressUpdated?.title || a.description || 'Actividad';
                        context += "- [" + a.createTime.split('T')[1].split('.')[0] + "] " + msg.substring(0, 100) + "\n";
                    });
                }
            } catch(e) { console.warn("Could not fetch logs for " + sid, e); }

            context += "\n";
        }
    }

    context += "¿Qué patrones identificas en estas sesiones? ¿Hay algún problema común o sugerencia de mejora?";

    // Send to Claude
    localStorage.setItem('hy_neural_pending_prompt', context);
    switchView('chat');

    // Auto-focus chat input and show pre-filled message (already handled by switchView -> loadV2Messages if we integrate it)
    if ($('v2-chat-input')) {
        $('v2-chat-input').value = context;
        // Trigger resize
        $('v2-chat-input').dispatchEvent(new Event('input'));
    }

    clearHistorySelection();
    showToast("Contexto enviado a Claude", "green");
}
