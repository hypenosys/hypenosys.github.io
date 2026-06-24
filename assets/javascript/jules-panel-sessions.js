/* ════════════════════════════════════════
   JULES PANEL SESSIONS & HISTORY
   ════════════════════════════════════════ */

async function refreshDashboard() {
    try {
        window.julesSessionsCache = await window.julesApi.listSessions();
        renderMetrics();
        renderHistoryTable(window.julesSessionsCache);
        updateKanbanCounts(window.julesSessionsCache);
        updateNeuralHistory(window.julesSessionsCache);
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
        const duration = '---'; // Need actual duration logic if available
        const taskTitle = s.title || s.prompt || 'Sin título';

        return '<tr onclick="openDrawer(\'' + s.name + '\')">' +
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

    const recent = sessions.slice(0, 10);
    list.innerHTML = recent.map(s => {
        const sid = s.name.split('/').pop();
        const active = sid === localStorage.getItem('hy_neural_session_id');
        const title = '#' + sid + ': ' + (s.title || s.prompt || 'Sin título');
        return '<div class="repo-item' + (active ? ' active' : '') + '" onclick="openDrawer(\'' + s.name + '\')" title="' + title + '">' +
               '<span class="u-mono" style="font-size:10px; opacity:0.6">#' + sid + '</span>' +
               '<span>' + (s.title || s.prompt || 'Sin título').substring(0, 20) + '...</span>' +
               '</div>';
    }).join('');
}

function updateKanbanCounts(sessions) {
    const counts = { pending: 0, running: 0, done: 0, error: 0 };
    sessions.forEach(s => {
        if (['COMPLETED'].includes(s.state)) counts.done++;
        else if (['FAILED', 'ERROR', 'CANCELLED'].includes(s.state)) counts.error++;
        else if (['PLANNING', 'EXECUTING'].includes(s.state)) counts.running++;
        else counts.pending++;
    });

    Object.keys(counts).forEach(k => {
        const el = $('kb-count-' + k);
        if (el) el.innerText = counts[k];
    });
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
