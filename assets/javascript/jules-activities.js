'use strict';

const JulesActivitiesModule = (() => {
  const API_BASE = 'https://jules.googleapis.com/v1alpha';
  let _sessionId = null;
  let _apiKey = null;
  let _pollInterval = null;
  let _renderedIds = new Set();
  const POLL_MS = 5000;
  const _reconciledTerminalSessions = new Set();

  function _escapeAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function _appendCompletionEvidence(task, pr) {
    const container = _getHistoryContainer();
    if (!container || !pr?.html_url) return;
    const evidenceId = 'jules-pr-evidence-' + _sessionId;
    if (document.getElementById(evidenceId)) return;

    const row = document.createElement('div');
    row.id = evidenceId;
    row.className = 'jules-activity-entry jules-timeline-entry jules-state-success';
    row.innerHTML = `
      <span class="entry-icon">🔗</span>
      <div class="entry-body">
        <div class="entry-header">
          <span class="activity-originator entry-originator">GITHUB</span>
          <span class="activity-time entry-time">PR #${pr.number}</span>
        </div>
        <div class="activity-content entry-content">
          Resultado de Jules listo para revisión:
          <a href="${_escapeAttr(pr.html_url)}" target="_blank" rel="noopener noreferrer"
             style="color:var(--accent2,#c084fc);font-weight:700;text-decoration:underline;">
            PR #${pr.number} ↗
          </a>
          ${task?.id ? ` · tarea #${task.id} movida a In Review` : ''}
        </div>
      </div>`;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
  }

  async function _findPullRequestForSession(task) {
    const repoFullName = String(task?.repository || task?.repo || '').replace('sources/github/', '');
    if (!repoFullName.includes('/')) return null;

    const token = window.githubApi?.getAuthToken?.();
    if (!token) return null;

    const sessionId = String(_sessionId || '');
    const taskId = task?.id ? String(task.id) : '';
    const url = `https://api.github.com/repos/${repoFullName}/pulls?state=all&per_page=50&sort=updated&direction=desc`;
    const res = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json'
      }
    });
    if (!res.ok) throw new Error(`GitHub PR lookup failed: HTTP ${res.status}`);

    const pulls = await res.json();
    return pulls.find(pr => {
      const body = String(pr.body || '');
      const title = String(pr.title || '');
      const head = String(pr.head?.ref || '');
      return (sessionId && (body.includes(sessionId) || head.includes(sessionId))) ||
             (taskId && title.includes('#' + taskId));
    }) || null;
  }

  async function _reconcileTerminalSession(terminalState) {
    if (!_sessionId || _reconciledTerminalSessions.has(_sessionId)) return;
    _reconciledTerminalSessions.add(_sessionId);

    try {
      const tasks = window.taskOps?.getAllTasks ? await window.taskOps.getAllTasks() : [];
      const task = (tasks || []).find(t => String(t.jules_session?.session_id || '') === String(_sessionId));
      if (!task) {
        console.warn('[JulesActivities] Terminal session has no linked task', _sessionId);
        return;
      }

      let pr = null;
      if (terminalState === 'COMPLETED') {
        try { pr = await _findPullRequestForSession(task); }
        catch (e) { console.warn('[JulesActivities] PR reconciliation failed', e); }
      }

      const now = new Date().toISOString();
      const currentJules = task.jules_session || {};
      const nextJules = {
        ...currentJules,
        session_id: String(_sessionId),
        status: terminalState,
        updated_at: now,
        completed_at: terminalState === 'COMPLETED' ? now : currentJules.completed_at,
        failed_at: terminalState === 'FAILED' ? now : currentJules.failed_at
      };

      if (pr) {
        nextJules.pr_number = pr.number;
        nextJules.pr_url = pr.html_url;
        nextJules.pr_state = pr.state;
        nextJules.branch = pr.head?.ref || nextJules.branch;
        nextJules.commit = pr.head?.sha || nextJules.commit;
      }

      const delta = { jules_session: nextJules };
      if (terminalState === 'COMPLETED' && pr) {
        // A PR abierta implica revisión, no finalización de la tarea.
        if (!['OK', 'Completed', 'Closed'].includes(task.estado)) delta.estado = 'In Review';
        const links = Array.isArray(task.external_links) ? [...task.external_links] : [];
        if (!links.some(l => l?.url === pr.html_url)) {
          links.push({ label: `Jules · PR #${pr.number}`, url: pr.html_url });
        }
        delta.external_links = links;
      } else if (terminalState === 'FAILED') {
        delta.estado = task.estado === 'Working' ? 'Pending' : task.estado;
      }

      if (window.taskOps?.updateTask) {
        await window.taskOps.updateTask(task.id, delta);
      }

      // Archive the finished Jules execution both locally and in the shared panel state.
      const cachedSession = (window.julesSessionsCache || []).find(s =>
        String(s.name || '').endsWith('/' + _sessionId) || String(s.name || '') === String(_sessionId)
      );
      const localArchive = JSON.parse(localStorage.getItem('hy_neural_archive') || '{}');
      localArchive[_sessionId] = {
        ...(cachedSession || { name: 'sessions/' + _sessionId }),
        state: terminalState === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
        taskId: task.id,
        prUrl: pr?.html_url || null,
        prNumber: pr?.number || null,
        archivedAt: now
      };
      localStorage.setItem('hy_neural_archive', JSON.stringify(localArchive));

      if (window.githubApi?.updateJulesGlobalArchive) {
        await window.githubApi.updateJulesGlobalArchive(_sessionId, {
          target: terminalState === 'COMPLETED' ? 'done' : 'error',
          realCol: terminalState === 'COMPLETED' ? 'done' : 'error',
          isTask: true,
          taskId: task.id,
          prUrl: pr?.html_url || null,
          prNumber: pr?.number || null,
          updatedAt: now
        });
      }

      if (pr) _appendCompletionEvidence(task, pr);
      if (window.refreshKanban) window.refreshKanban();
      if (window.refreshDashboard) await window.refreshDashboard();
      window.dispatchEvent(new CustomEvent('jules-session-reconciled', {
        detail: { sessionId: _sessionId, taskId: task.id, status: terminalState, pr }
      }));
    } catch (e) {
      _reconciledTerminalSessions.delete(_sessionId);
      console.error('[JulesActivities] terminal reconciliation failed', e);
    }
  }

  function _getApiKey() {
    return typeof window.getJulesApiKey === 'function' ? window.getJulesApiKey() : (localStorage.getItem('jules_api_key') || '');
  }

  function _getHistoryContainer() {
    // Selector para pages/jules-panel.html (tab Neural Chat)
    return document.querySelector('#v2-chat-messages');
  }

  function _getChatInput() {
    return document.querySelector('#v2-chat-input');
  }

  function _getChatSendBtn() {
    return document.querySelector('#v2-send-btn');
  }

  async function _fetchActivities() {
    if (!_sessionId || !_apiKey) return;
    try {
      const baseUrl = typeof window.getJulesBase === 'function' ? window.getJulesBase() : API_BASE;
      const res = await fetch(`${baseUrl}/sessions/${_sessionId}/activities?pageSize=100`, {
        headers: { 'x-goog-api-key': _apiKey }
      });
      if (!res.ok) { console.warn('[JulesActivities] fetch error', res.status); return; }
      const data = await res.json();
      _renderActivities(data.activities || []);
      const activities = data.activities || [];
      const completed = activities.some(a => a.sessionCompleted);
      const failed = activities.some(a => a.sessionFailed);
      if (completed || failed) {
        await _reconcileTerminalSession(completed ? 'COMPLETED' : 'FAILED');
        stopPolling();
      }
    } catch (e) {
      console.error('[JulesActivities] poll error', e);
    }
  }

  function _activityToHTML(act) {
    const time = new Date(act.createTime || new Date()).toLocaleTimeString('es-ES');
    const originator = act.originator || 'system';

    // Normalize originator / role to display JULES for agent, assistant, jules
    let displayName = originator.toUpperCase();
    if (displayName === 'AGENT' || displayName === 'ASSISTANT' || displayName === 'JULES') {
      displayName = 'JULES';
    }

    let iconHTML = '⚙️';
    if (displayName === 'JULES') iconHTML = '🤖';
    if (originator === 'user') iconHTML = '👤';

    // Apply Authenticated User Identity if originator is user
    if (originator === 'user') {
      const githubUser = window.githubApi ? window.githubApi.user : null;
      if (githubUser) {
        displayName = (githubUser.login || githubUser.name || 'USUARIO').toUpperCase();
        if (githubUser.avatar_url) {
          iconHTML = `<img src="${githubUser.avatar_url}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;" alt="Avatar">`;
        }
      }
    }

    // Render untrusted Jules output as readable text. Markdown is only enabled when
    // a sanitizer is available; otherwise use safe escaped text and preserve newlines.
    const renderTextContent = (value) => {
      const text = typeof value === 'string' ? value :
        (typeof window.extractJulesActivityText === 'function' ? window.extractJulesActivityText(value) : String(value ?? ''));
      if (!text.trim()) return '<span style="opacity:.65">Sin contenido de texto</span>';
      const decoded = window.decodeHtmlEntities ? window.decodeHtmlEntities(text) : text;
      const escaped = window.escapeHtml ? window.escapeHtml(decoded) :
        String(decoded).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      if (window.marked?.parse && window.DOMPurify?.sanitize) {
        try {
          return '<div class="jules-output-markdown" style="overflow-wrap:anywhere;word-break:normal;line-height:1.65">' +
            window.DOMPurify.sanitize(window.marked.parse(decoded, { breaks: true })) + '</div>';
        } catch (error) {
          console.warn('[JulesActivities] Markdown rendering failed; using escaped output', error);
        }
      }
      return '<div class="jules-output-text" style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65">' +
        escaped + '</div>';
    };

    let content = '';
    let extraHTML = '';

    if (act.sessionCompleted) {
      content = '✅ Sesión completada correctamente';
    } else if (act.sessionFailed) {
      const reason = window.decodeHtmlEntities(act.sessionFailed.reason || 'desconocido');
      content = `❌ Error: ${window.escapeHtml(reason)}`;
    } else if (act.planGenerated) {
      const steps = (act.planGenerated.plan?.steps || []);
      content = '📋 Plan generado';
      extraHTML = `<ol class="jules-plan-steps">${steps.map(s => {
        const stepTitle = window.decodeHtmlEntities(s.title || '');
        const stepDesc = window.decodeHtmlEntities(s.description || '');
        return `<li><strong>${window.escapeHtml(stepTitle)}</strong>${stepDesc ? ': ' + window.escapeHtml(stepDesc) : ''}</li>`;
      }).join('')}</ol>`;
    } else if (act.progressUpdated) {
      const p = act.progressUpdated;
      const title = window.decodeHtmlEntities(p.title || '');
      const desc = window.decodeHtmlEntities(p.description || '');
      content = `<strong>${window.escapeHtml(title)}</strong>${desc ? ' — ' + window.escapeHtml(desc) : ''}`;
    } else if (act.agentMessaged) {
      content = renderTextContent(act.agentMessaged.agentMessage || '');
    } else if (act.userMessaged) {
      content = renderTextContent(act.userMessaged.userMessage || '');
    } else {
      content = renderTextContent(act.description || '');
    }

    if (act.artifacts?.length) {
      act.artifacts.forEach(artifact => {
        if (artifact.changeSet?.gitPatch) {
          const msg = window.decodeHtmlEntities(artifact.changeSet.gitPatch.suggestedCommitMessage || '');
          extraHTML += `<div class="jules-artifact jules-artifact--diff">📄 <em>${window.escapeHtml(msg)}</em></div>`;
        }
        if (artifact.bashOutput) {
          const cmd = window.decodeHtmlEntities(artifact.bashOutput.command || '');
          const out = window.decodeHtmlEntities(artifact.bashOutput.output || '');
          extraHTML += `<div class="jules-artifact jules-artifact--bash">
            <code>$ ${window.escapeHtml(cmd)}</code>
            <pre class="code-block" style="max-height: 200px; overflow-y: auto;">${window.escapeHtml(out)}</pre>
          </div>`;
        }
      });
    }

    let stateClass = 'jules-state-info';
    if (act.sessionCompleted) {
      stateClass = 'jules-state-success';
      iconHTML = '✅';
    } else if (act.sessionFailed) {
      stateClass = 'jules-state-error';
      iconHTML = '❌';
    } else if (act.planGenerated || act.planApproved) {
      stateClass = 'jules-state-plan';
      iconHTML = '📋';
    } else if (act.progressUpdated) {
      stateClass = 'jules-state-prog';
      iconHTML = '⚙️';
    } else if (act.artifacts?.length) {
      stateClass = 'jules-state-prog';
      iconHTML = '📄';
    } else if (originator === 'user') {
      stateClass = 'jules-state-user';
      iconHTML = '👤';
    } else if (displayName === 'JULES') {
      stateClass = 'jules-state-purple';
      iconHTML = '🤖';
    }

    const isAgent = originator === 'agent' || displayName === 'JULES';
    const actionBtn = isAgent ? `
      <div class="entry-actions">
        <button class="btn btn-ghost btn-sm" style="font-size: 9px; padding: 2px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;" onclick="window.sendToJulesFromActivity('${act.id}')">
          <i class="fas fa-arrow-right"></i> → ENVIAR A JULES
        </button>
      </div>` : '';

    return `
      <div class="jules-activity-entry jules-timeline-entry ${stateClass}" data-activity-id="${act.id}">
        <span class="entry-icon">${iconHTML}</span>
        <div class="entry-body">
          <div class="entry-header">
            <span class="activity-originator entry-originator">${displayName}</span>
            <span class="activity-time entry-time">${time}</span>
          </div>
          <div class="activity-content entry-content" style="min-width:0;max-width:100%;overflow-wrap:anywhere;line-height:1.6">${content}</div>
          ${extraHTML ? `<div class="entry-extra">${extraHTML}</div>` : ''}
          ${actionBtn}
        </div>
      </div>`;
  }

  function _renderActivities(activities) {
    const container = _getHistoryContainer();
    if (!container) return;

    // Clear welcome screen if present
    const welcome = container.querySelector('#v2-welcome-screen');
    if (welcome && activities.length > 0) welcome.style.display = 'none';

    const newActivities = activities.filter(a => !_renderedIds.has(a.id));
    newActivities.forEach(act => {
      _renderedIds.add(act.id);
      const div = document.createElement('div');
      try {
        const html = _activityToHTML(act);
        div.innerHTML = html;
        const el = div.firstElementChild;
        if (el) {
          container.appendChild(el);
        } else {
          console.error('[JulesActivities] Failed to parse activity HTML', html);
        }
      } catch (e) {
        console.error('[JulesActivities] Error rendering activity', e, act);
      }
    });

    if (newActivities.length > 0) {
      container.scrollTop = container.scrollHeight;
    }
  }

  async function sendMessage(text) {
    if (!_sessionId || !_apiKey) {
      console.warn('[JulesActivities] No active session or API key to send message');
      return false;
    }
    try {
      const baseUrl = typeof window.getJulesBase === 'function' ? window.getJulesBase() : API_BASE;
      const res = await fetch(`${baseUrl}/sessions/${_sessionId}:sendMessage`, {
        method: 'POST',
        headers: {
          'x-goog-api-key': _apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: text })
      });
      if (!res.ok) {
        console.warn('[JulesActivities] sendMessage error', res.status);
        return false;
      }
      // Render user message locally immediately
      _renderActivities([{
        id: `local-${Date.now()}`,
        originator: 'user',
        description: text,
        createTime: new Date().toISOString(),
        userMessaged: { userMessage: text }
      }]);
      return true;
    } catch (e) {
      console.error('[JulesActivities] sendMessage exception', e);
      return false;
    }
  }

  function startPolling(sessionId) {
    if (!sessionId) return;
    _sessionId = sessionId;
    _apiKey = _getApiKey();
    _renderedIds = new Set();
    _reconciledTerminalSessions.delete(String(sessionId));
    if (!_apiKey) { console.warn('[JulesActivities] No API key'); return; }
    stopPolling();
    _fetchActivities();
    _pollInterval = setInterval(_fetchActivities, POLL_MS);
    _wireChatInput();
  }

  function stopPolling() {
    if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
  }

  function _wireChatInput() {
    const input = _getChatInput();
    const btn = _getChatSendBtn();
    if (!input || btn?._neuralWired) return;

    const doSend = async () => {
      const text = input.value.trim();
      if (!text) return;
      if (_sessionId) {
        const ok = await sendMessage(text);
        if (ok) input.value = '';
      } else {
        // No active session: route to OPS prompt textarea
        const promptTextarea = document.querySelector('#session-prompt');
        if (promptTextarea) {
          promptTextarea.value = text;
          input.value = '';
          _showToast('Prompt enviado al formulario de Jules ⚡');
        }
      }
    };

    btn.addEventListener('click', doSend);
    btn._neuralWired = true;
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
  }

  function _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'jules-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  window.sendToJulesFromActivity = (activityId) => {
    const entry = document.querySelector(`.jules-activity-entry[data-activity-id="${activityId}"]`);
    if (!entry) return;
    const content = entry.querySelector('.activity-content')?.innerText;
    if (!content) return;

    const promptTextarea = document.querySelector('#session-prompt');
    if (promptTextarea) {
      promptTextarea.value = content;
      // Switch view to Neural tab to show the pre-filled prompt
      if (window.switchView) window.switchView('neural');
      _showToast('Prompt cargado en Jules ⚡');
    }
  };

  return { startPolling, stopPolling, sendMessage, activityToHTML: _activityToHTML };
})();

window.JulesActivitiesModule = JulesActivitiesModule;
