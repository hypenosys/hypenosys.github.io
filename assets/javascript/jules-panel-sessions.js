/* ════════════════════════════════════════
   JULES PANEL SESSIONS & HISTORY rendering
   ════════════════════════════════════════ */

window.STATE_CONFIG = {
  'QUEUED':                  { label: 'En cola',           cls: 'queued',    icon: '⏸' },
  'PLANNING':                { label: 'Planificando',       cls: 'running',   icon: '🧠' },
  'AWAITING_PLAN_APPROVAL':  { label: 'Esperando aprobación', cls: 'waiting', icon: '⏳' },
  'AWAITING_USER_FEEDBACK':  { label: 'Esperando input',    cls: 'waiting',   icon: '💬' },
  'IN_PROGRESS':             { label: 'En progreso',        cls: 'running',   icon: '⚡' },
  'PAUSED':                  { label: 'Pausada',            cls: 'queued',    icon: '⏸' },
  'FAILED':                  { label: 'Fallida',            cls: 'failed',    icon: '❌' },
  'COMPLETED':               { label: 'Completada',         cls: 'completed', icon: '✅' },
};

window.getStateBadge = function(state) {
  const cfg = STATE_CONFIG[state] || { label: state || '—', cls: 'queued', icon: '◌' };
  return `<span class="session-badge session-badge--\${cfg.cls}">
    \${cfg.icon} \${cfg.label}
  </span>`;
}

window.getIdSafe = function(name) {
  return name ? name.split('/').pop() : '';
}

window.refreshActivities = async function(idSafe) {
    const currentSessions = window.julesSessionsCache || [];
    const sessionId = currentSessions.find(s => getIdSafe(s.name) === idSafe)?.name || 'sessions/' + idSafe;
    const log = document.getElementById("neural-jules-history");
    if (!log) return;

    try {
        const data = await window.julesApi.getActivities(sessionId, 50);
        const session = currentSessions.find(s => s.name === sessionId);

        // Update sticky badge
        const stickyBadge = document.getElementById(`sticky-badge-\${idSafe}`);
        if (stickyBadge && session) {
            stickyBadge.innerHTML = getStateBadge(session.state);
            stickyBadge.classList.remove('hidden');
        }

        let activities = (data.activities || [])
          .filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i);

        // Actualizar Working Indicator
        if (session && session.state === 'IN_PROGRESS') {
          const lastProgress = [...activities].reverse().find(a => a.progressUpdated);
          if (lastProgress) {
            let title = lastProgress.progressUpdated.title || '';
            title = title.replace(/^Reading\b/i, 'Leyendo').replace(/^Writing\b/i, 'Escribiendo');
            const card = document.getElementById('card-' + idSafe);
            const workingText = card?.querySelector('[data-role="working-text"]');
            if (workingText) {
              let text = title;
              if (text.length > 60) text = text.substring(0, 57) + '...';
              workingText.textContent = text.endsWith('...') ? text : text + '...';
            }
          }
        }

        // Guardar IDs ya renderizados
        const existingIds = new Set(
          [...log.querySelectorAll('[data-activity-id]')]
            .map(el => el.dataset.activityId)
        );

        // Quitar el placeholder "No hay eventos" si existen actividades reales
        const placeholder = log.querySelector('[data-placeholder]');
        if (placeholder && activities.length > 0) placeholder.remove();

        // Añadir SOLO las actividades nuevas
        let added = false;
        activities.forEach(activity => {
          if (existingIds.has(activity.id)) return;
          const html = renderActivity(activity);
          if (!html) return;
          const div = document.createElement('div');
            div.className = 'activity-entry';
          div.dataset.activityId = activity.id;
          div.innerHTML = html;
            div.onclick = (e) => toggleActivitySelection(div, activity);
          log.appendChild(div);
          added = true;
        });

        // Mostrar placeholder solo si el log sigue vacío después de intentar añadir
        if (log.querySelectorAll('[data-activity-id]').length === 0) {
          if (!log.querySelector('[data-placeholder]')) {
            const ph = document.createElement('div');
            ph.dataset.placeholder = 'true';
            ph.className = 'italic text-center opacity-40';
            ph.style.cssText = 'font-size:11px;padding:12px;color:#4b5563;';
            ph.textContent = 'No hay eventos todavía';
            log.appendChild(ph);
          }
        }

        // Scroll inteligente
        if (added) {
          const threshold = 40;
          const isAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < threshold;
          if (isAtBottom) log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
        }

        updateApprovalStatus(activities, sessionId);

        if (session && (session.state === 'COMPLETED' || session.state === 'FAILED')) {
          stopNeuralPolling();
        }
    } catch (e) {
        console.warn("refreshActivities error:", e);
    }
}

window.renderActivity = function(activity) {
  const currentSessions = window.julesSessionsCache || [];
  let html = '<div class="activity-selection-checkbox"></div>';

  let diffsHtml = '';
  if (activity.artifacts && activity.artifacts.length > 0) {
    activity.artifacts.forEach(artifact => {
      if (artifact.changeSet?.gitPatch?.unidiffPatch) {
        const patch = artifact.changeSet.gitPatch.unidiffPatch;
        const msg   = artifact.changeSet.gitPatch.suggestedCommitMessage || '';
        const lines = patch.split('\n');

        const MAX_LINES = 300;
        const visibleLines = lines.slice(0, MAX_LINES);
        const hiddenCount = lines.length - visibleLines.length;

        const diffLinesHtml = visibleLines.map(line => {
          let cls = 'dl';
          if (line.startsWith('+') && !line.startsWith('+++')) cls = 'dl dl-add';
          else if (line.startsWith('-') && !line.startsWith('---')) cls = 'dl dl-del';
          else if (line.startsWith('@@')) cls = 'dl dl-hunk';
          return `<div class="\${cls}">\${escapeHtml(line)}</div>`;
        }).join('');

        const session = currentSessions.find(s => s.name === activity.name?.split('/activities/')[0]);
        const moreHtml = hiddenCount > 0
          ? `<div style="font-size:10px;color:#6b7280;padding:6px;text-align:center;
               border-top:1px solid #2a2a35;">
               +\${hiddenCount} líneas más —
               <a href="\${session?.url || '#'}" target="_blank"
                  style="color:#8b5cf6;text-decoration:underline;">
                 ver completo en Jules
               </a>
             </div>`
          : '';

        diffsHtml += `
          <details style="margin-top:8px;" class="diff-viewer">
            <summary style="cursor:pointer;font-size:11px;color:#8b5cf6;
              font-weight:600;padding:4px 0;list-style:none;
              display:flex;align-items:center;gap:6px;">
              <span>📄</span>
              <span>Ver cambios en código</span>
              \${msg ? `<span style="color:#6b7280;font-weight:400;font-size:10px;">
                — \${escapeHtml(msg)}</span>` : ''}
            </summary>
            <div style="border:1px solid #2a2a35;border-radius:6px;
              overflow:hidden;max-height:250px;overflow-y:auto;">
              \${diffLinesHtml}
              \${moreHtml}
            </div>
          </details>`;
      }
    });
  }

  if (activity.planGenerated) {
    const steps = activity.planGenerated?.plan?.steps || [];
    const stepsHtml = steps
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .map(s => `
        <div style="padding:8px 0;border-bottom:1px solid #1e1e2a;">
          <div style="display:flex;gap:8px;">
            <span style="color:#7c3aed;font-weight:700;min-width:18px;">
              \${(s.index || 0) + 1}.
            </span>
            <div style="flex: 1;">
              <div style="color:#e2e8f0;font-size:12px;font-weight:500;">
                \${s.title || 'Sin título'}
              </div>
              \${s.description ? `
                <div style="color:#6b7280;font-size:11px;margin-top:2px;">
                  \${s.description}
                </div>` : ''}
            </div>
            <button class="btn-icon" title="Comentar en este paso" onclick="commentOnStep('\${activity.name?.split('/activities/')[0]}', \${(s.index || 0) + 1}, '\${escapeHtml(s.title)}')">
              <i class="fa-solid fa-comment-dots text-[10px]"></i>
            </button>
          </div>
        </div>
      `).join('');

    html = `
      <div class="activity-entry activity-entry--plan">
        <div style="font-size:10px;font-weight:700;color:#8b5cf6;
                    text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">
          📋 Plan generado (\${steps.length} pasos)
        </div>
        <div>\${stepsHtml || '<span style="color:#6b7280">Sin pasos</span>'}</div>
      </div>`;
  }
  else if (activity.planApproved) {
    html = `<div class="activity-entry" style="color:#10b981;font-size:11px;">
      ✅ Plan aprobado
    </div>`;
  }
  else if (activity.userMessaged) {
    const msg = activity.userMessaged.userMessage || '';
    const parsed = typeof marked !== 'undefined' ? marked.parse(msg) : escapeHtml(msg);
    html = `<div class="activity-entry activity-entry--user prose-invert" style="overflow-x: auto; max-width: 100%; word-break: break-word;">\${parsed}</div>`;
  }
  else if (activity.agentMessaged) {
    const msg = activity.agentMessaged.agentMessage || '';
    const parsed = typeof marked !== 'undefined' ? marked.parse(msg) : escapeHtml(msg);
    html = `<div class="activity-entry activity-entry--agent prose-invert" style="overflow-x: auto; max-width: 100%; word-break: break-word;">\${parsed}</div>`;
  }
  else if (activity.progressUpdated) {
    const title = activity.progressUpdated.title || '';
    const desc  = activity.progressUpdated.description || '';
    const parsedTitle = typeof marked !== 'undefined' ? marked.parse(title) : escapeHtml(title);
    const parsedDesc  = typeof marked !== 'undefined' && desc ? marked.parse(desc) : escapeHtml(desc);
    const bash = (activity.artifacts || [])
      .map(a => a.bashOutput).filter(Boolean)[0];

    html = `
      <div class="activity-entry activity-entry--progress">
        <div class="prose-invert" style="overflow-x:auto;max-width:100%;word-break:break-word;font-size:12px;">
          <span style="color:#8b5cf6;font-weight:700;">⚙️</span>
          \${parsedTitle}
          \${parsedDesc ? `<div style="color:#9ca3af;margin-top:4px;">\${parsedDesc}</div>` : ''}
        </div>
        \${bash ? `
          <details style="margin-top:6px;">
            <summary style="font-size:10px;color:#6b7280;cursor:pointer;">
              $ \${escapeHtml(bash.command || '')}
              <span style="color:\${bash.exitCode === 0 ? '#10b981' : '#ef4444'}">
                [exit \${bash.exitCode ?? '?'}]
              </span>
            </summary>
            <pre class="activity-code">\${escapeHtml(bash.output || "")}</pre>
          </details>` : ''}
      </div>`;
  }
  else if (activity.sessionCompleted) {
    const commitMsg = activity.sessionCompleted?.commitMessage ||
                      activity.sessionCompleted?.message || '';
    const parsed = typeof marked !== 'undefined' && commitMsg
      ? marked.parse(commitMsg)
      : '';

    html = `
      <div class="activity-entry" style="color:#10b981;font-size:11px;font-weight:600;">
        🏁 Sesión completada
        \${parsed ? `
          <div class="prose-invert" style="overflow-x:auto;max-width:100%;word-break:break-word;
               font-size:11px;font-weight:400;color:#d1d5db;margin-top:6px;
               border-top:1px solid #1e1e2a;padding-top:6px;">
            \${parsed}
          </div>` : ''}
      </div>`;
  }
  else if (activity.sessionFailed) {
    const reason = activity.sessionFailed.reason || 'Error desconocido';
    html = `<div class="activity-entry"
                     style="color:#ef4444;font-size:11px;">
      ❌ Sesión fallida: \${escapeHtml(reason)}
    </div>`;
  }

  if (!html) {
    const desc = activity.description || '';
    if (!desc && !diffsHtml) return '';
    if (desc) {
      html = `<div class="activity-entry" style="color:#4b5563;font-size:10px;
        font-style:italic;">
        \${escapeHtml(desc)}
      </div>`;
    }
  }
  return html + diffsHtml;
}

window.updateApprovalStatus = function(activities, sessionId) {
    const idSafe = sessionId.split('/').pop();
    const opsContainer = document.getElementById('neural-actions-ops');
    const v2Container = document.getElementById('neural-actions-v2');
    if (!opsContainer || !v2Container) return;

    const sorted = [...activities].sort((a, b) => new Date(a.createTime) - new Date(b.createTime));

    let needsApproval = false;
    for (let i = sorted.length - 1; i >= 0; i--) {
        const act = sorted[i];
        if (act.planApproved) {
            needsApproval = false;
            break;
        }
        if (act.planGenerated) {
            needsApproval = true;
            break;
        }
    }

    if (needsApproval) {
        const btnHtml = `
            <span style="font-size: 11px; color: var(--amber); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Plan pendiente de aprobación</span>
            <button onclick="approveJulesPlan('\${sessionId}')" class="btn btn-primary btn-sm" style="background: var(--amber); color: #000; box-shadow: 0 0 15px rgba(245, 158, 11, 0.4); min-height: 32px; padding: 4px 12px; border-radius: 6px; font-weight: 800;">
                <i class="fas fa-check mr-2"></i> APROBAR PLAN
            </button>
        `;
        opsContainer.innerHTML = btnHtml;
        v2Container.innerHTML = btnHtml;
        opsContainer.classList.remove('hidden');
        v2Container.classList.remove('hidden');
    } else {
        opsContainer.classList.add('hidden');
        v2Container.classList.add('hidden');
        opsContainer.innerHTML = '';
        v2Container.innerHTML = '';
    }
}

window.approveJulesPlan = async (sessionId) => {
    try {
        showToast("Aprobando plan...", "amber");
        await window.julesApi.approvePlan(sessionId);
        showToast("Plan aprobado con éxito", "green");
        const idSafe = sessionId.split('/').pop();
        refreshActivities(idSafe);
    } catch (e) {
        showToast("Error al aprobar plan: " + e.message, "red");
    }
};

window.refreshDashboard = async function() {
    if (window.JulesPanelState.isRefreshing) return;
    window.JulesPanelState.isRefreshing = true;
    try {
        const [sessionData, tasks, archiveRes] = await Promise.all([
            window.julesApi.getSessions(window.JulesPanelState.metricsWindow || 30).catch(e => { console.warn("Failed to fetch sessions", e); return { sessions: [] }; }),
            window.taskOps.getAllTasks().catch(e => { console.warn("Failed to fetch tasks", e); return []; }),
            window.githubApi.fetchFileWithSha('_data/jules_panel_state.json').catch(e => { console.warn("Global archive file not found or inaccessible", e); return null; })
        ]);

        if (archiveRes && archiveRes.content && !window.JulesPanelState.isSyncingArchive) {
            window.JulesPanelState.globalArchive = archiveRes.content.archive || {};
        }

        const sessions = sessionData.sessions || [];
        window.julesSessionsCache = sessions;
        window.JulesPanelState.tasks = tasks;

        renderHistoryTable(sessions);
        if (window.JulesPanelState.currentView === 'kanban') {
            loadJulesKanban(sessions);
        }
        updateStats();

        if (window.JulesPanelState.currentView === 'chat') {
            const activeSid = getLinkedJulesSessionId();
            if (activeSid && !window.neuralPollInterval) {
                startNeuralPolling(activeSid);
            }
        }

        if (sessions.length > 0) {
            const latest = sessions[0];
            const lastOutputStr = localStorage.getItem('jules_last_output');
            const lastOutput = lastOutputStr ? JSON.parse(lastOutputStr) : null;
            const sessionId = latest.name.split('/').pop();

            if (!lastOutput || lastOutput.session_id !== sessionId || lastOutput.status !== latest.state) {
                const payload = {
                    session_id: sessionId,
                    status: latest.state,
                    title: latest.title || latest.prompt,
                    repo: latest.sourceContext?.source?.split('/').pop() || '---',
                    timestamp: new Date().toISOString()
                };
                localStorage.setItem('jules_last_output', JSON.stringify(payload));

                if (['COMPLETED', 'FAILED'].includes(latest.state)) {
                    triggerAutomatedAnalysis(payload);
                }
            }
        }

        sessions.forEach(s => {
            if (s.state === 'AWAITING_PLAN_APPROVAL' || s.state === 'AWAITING_USER_FEEDBACK') {
                const idSafe = s.name.split('/').pop();
                if (!localStorage.getItem(`jules_notif_approval_${idSafe}`)) {
                    showToast(`Sesión ${idSafe} espera revisión. <button onclick="openDrawer('${s.name}')" style="background:none;border:none;color:#fff;text-decoration:underline;cursor:pointer;padding:0;margin-left:10px;">ABRIR</button>`, 'amber');
                    localStorage.setItem(`jules_notif_approval_${idSafe}`, Date.now());
                }
            }
        });
    } catch (e) { console.error('[Jules] refreshDashboard error:', e); }
    finally { window.JulesPanelState.isRefreshing = false; }
}

window.refreshSessions = async function() { await refreshDashboard(); }

window.updateStats = function() {
    const sessions = window.julesSessionsCache || [];
    const running = sessions.filter(s => ['IN_PROGRESS', 'PLANNING', 'AWAITING_PLAN_APPROVAL'].includes(s.state)).length;
    if($('s-active')) $('s-active').textContent = running;
    if($('s-repos'))  $('s-repos').textContent  = (window.julesSourcesCache || []).length;
    if($('s-total'))  $('s-total').textContent  = sessions.length;
    if($('kanban-badge')) $('kanban-badge').textContent = running;
}

window.renderHistoryTable = function(sessions) {
    const body = $('tbl-body'); if (!body) return;
    if (!sessions.length) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text3);">Sin sesiones</td></tr>'; return; }

    // Desktop Table
    body.innerHTML = sessions.map(s => {
        const statusLabel = { 'IN_PROGRESS': 'activo', 'COMPLETED': 'listo', 'FAILED': 'error', 'QUEUED': 'cola', 'PLANNING': 'planificando', 'AWAITING_PLAN_APPROVAL': 'esperando' }[s.state] || 'listo';
        return `<tr onclick="openDrawer('\${s.name}')"><td><span class="sid">\${s.name.split('/').pop()}</span></td><td class="tdesc">\${escapeHtml(s.title || s.prompt)}</td><td class="tmono">\${s.sourceContext?.source?.split('/').pop() || '---'}</td><td class="tmono">\${s.sourceContext?.githubRepoContext?.startingBranch || '---'}</td><td><span class="sbadge \${s.state.toLowerCase().replace(/_/g, '-')}"><span class="pulse-dot"></span>\${statusLabel}</span></td><td class="tmono">\${getTimeAgo(s.createTime)}</td><td class="tmono">\${new Date(s.createTime).toLocaleDateString()}</td></tr>`;
    }).join('');

    // Mobile compact list
    const mobList = $('mobile-history-list');
    if (mobList) {
      mobList.innerHTML = sessions.map(s => {
        const statusLabel = { 'IN_PROGRESS': 'activo', 'COMPLETED': 'listo', 'FAILED': 'error', 'QUEUED': 'cola', 'PLANNING': 'planificando', 'AWAITING_PLAN_APPROVAL': 'esperando' }[s.state] || 'listo';
        return `
          <div onclick="openDrawer('\${s.name}')" style="padding:14px; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:6px">
            <div style="display:flex; justify-content:space-between; align-items:center">
              <span class="sid">\${s.name.split('/').pop()}</span>
              <span class="sbadge \${s.state.toLowerCase().replace(/_/g, '-')}">\${statusLabel}</span>
            </div>
            <div style="font-weight:600; color:var(--text); font-size:13px" class="tdesc">\${escapeHtml(s.title || s.prompt)}</div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text3)">
              <span>\${s.sourceContext?.source?.split('/').pop() || '---'}</span>
              <span>\${getTimeAgo(s.createTime)}</span>
            </div>
          </div>
        `;
      }).join('');
    }
}

window.toggleActivitySelection = function(el, activity) {
    if (!window._historySelection) window._historySelection = new Map();
    const id = activity.id;
    if (window._historySelection.has(id)) {
        window._historySelection.delete(id);
        el.classList.remove('selected');
    } else {
        window._historySelection.set(id, activity);
        el.classList.add('selected');
    }
    updateSelectionToolbar();
}

window.updateSelectionToolbar = function() {
    const toolbar = document.getElementById('neural-selection-toolbar');
    const countEl = document.getElementById('selection-count');
    const count = window._historySelection ? window._historySelection.size : 0;

    if (count > 0) {
        toolbar.classList.add('active');
        countEl.textContent = count;
    } else {
        toolbar.classList.remove('active');
    }
}

window.clearHistorySelection = function() {
    if (window._historySelection) window._historySelection.clear();
    document.querySelectorAll('.activity-entry.selected').forEach(el => el.classList.remove('selected'));
    updateSelectionToolbar();
}

window.analyzeSelectedWithClaude = function() {
    if (!window._historySelection || window._historySelection.size === 0) return;

    const container = document.getElementById('neural-jules-history');
    const sortedEntries = Array.from(container.querySelectorAll('.activity-entry.selected'))
        .map(el => window._historySelection.get(el.dataset.activityId))
        .filter(Boolean);

    let combinedMessage = "He seleccionado estos fragmentos del historial de Jules para analizar:\n\n";

    sortedEntries.forEach((act, idx) => {
        let activityType = "Actividad";
        if (act.userMessaged) activityType = "Mensaje del Usuario";
        else if (act.agentMessaged) activityType = "Mensaje de Jules";
        else if (act.progressUpdated) activityType = `Progreso: \${act.progressUpdated.title}`;
        else if (act.planGenerated) activityType = "Plan Generado";
        else if (act.sessionCompleted) activityType = "Sesión Completada";
        else if (act.sessionFailed) activityType = "Sesión Fallida";
        else if (act.description) activityType = act.description;

        const separator = `\n--- Actividad: \${activityType} ---\n`;
        let content = "";

        if (act.userMessaged) {
            content += `\${act.userMessaged.userMessage}\n`;
        } else if (act.agentMessaged) {
            content += `\${act.agentMessaged.agentMessage}\n`;
        } else if (act.progressUpdated) {
            if (act.progressUpdated.description) content += `\${act.progressUpdated.description}\n`;
        } else if (act.planGenerated) {
            const steps = act.planGenerated.plan?.steps || [];
            content += `PASOS:\n\${steps.map(s => `\${(s.index || 0) + 1}. \${s.title}: \${s.description || ''}`).join('\n')}\n`;
        } else if (act.sessionCompleted) {
            content += `Commit: \${act.sessionCompleted.commitMessage || '---'}\n`;
        } else if (act.sessionFailed) {
            content += `Razón: \${act.sessionFailed.reason || 'Desconocida'}\n`;
        }

        if (act.artifacts) {
            act.artifacts.forEach(art => {
                if (art.changeSet?.gitPatch?.unidiffPatch) {
                    content += `\nCÓDIGO (DIFF):\n\`\`\`diff\n\${art.changeSet.gitPatch.unidiffPatch}\n\`\`\`\n`;
                }
                if (art.bashOutput) {
                    content += `\nCOMANDO: \${art.bashOutput.command}\nOUTPUT:\n\`\`\`\n\${art.bashOutput.output}\n\`\`\`\n`;
                }
            });
        }

        if (content) {
            combinedMessage += separator + content;
        }
    });

    combinedMessage += "\n\n¿Qué opinas de estos cambios o estados de Jules seleccionados arriba? ¿Hay algo que deba ajustar o corregir?";

    // Cambiar a vista chat y pre-poblar input
    switchView('chat');
    const input = $('v2-chat-input');
    if (input) {
        input.value = combinedMessage;
        input.style.height = 'auto';
        input.dispatchEvent(new Event('input'));
    }

    clearHistorySelection();
    showToast("Iniciando análisis con Claude...", "green");

    // Disparar envío automático
    setTimeout(() => {
        sendChatV2Msg();
    }, 300);
}

window.commentOnStep = function(sessionId, stepIndex, stepTitle) {
    const idSafe = getIdSafe(sessionId);
    const input = document.getElementById(`v2-chat-input`);
    if (input) {
        input.value = `Respecto al paso \${stepIndex} (\${stepTitle}): ` + input.value;
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.focus();
    }
}

/* ═══════════════════════════════
   DRAWER CONTROL
   ═══════════════════════════════ */
window.openDrawer = function(sessionId) {
    $('dr-sub').textContent = `Sesión: ${sessionId.split('/').pop()}`;
    $('dr-overlay').classList.add('open'); $('drawer').classList.add('open');
    refreshActivities(sessionId);
}

window.closeDrawer = function() {
    $('dr-overlay').classList.remove('open'); $('drawer').classList.remove('open');
}

window.switchDrawerTab = function(tab, el) {
    document.querySelectorAll('.dr-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dr-panel').forEach(p => p.classList.remove('active'));
    el.classList.add('active'); $(`dr-panel-${tab}`).classList.add('active');
}
