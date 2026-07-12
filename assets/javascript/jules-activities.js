'use strict';

const JulesActivitiesModule = (() => {
  const API_BASE = 'https://jules.googleapis.com/v1alpha';
  let _sessionId = null;
  let _apiKey = null;
  let _pollInterval = null;
  let _renderedIds = new Set();
  const POLL_MS = 5000;

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
      const res = await fetch(`${API_BASE}/sessions/${_sessionId}/activities?pageSize=100`, {
        headers: { 'x-goog-api-key': _apiKey }
      });
      if (!res.ok) { console.warn('[JulesActivities] fetch error', res.status); return; }
      const data = await res.json();
      _renderActivities(data.activities || []);
      const done = (data.activities || []).some(a => a.sessionCompleted || a.sessionFailed);
      if (done) stopPolling();
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

    // Helper to decode entities once, escape, and parse code blocks safely
    const renderTextContent = (text) => {
      if (!text) return '';
      const decoded = window.decodeHtmlEntities ? window.decodeHtmlEntities(text) : text;
      let escaped = window.escapeHtml ? window.escapeHtml(decoded) : decoded;

      // Escape code inside ``` blocks safely
      escaped = escaped.replace(/```([\s\S]*?)```/g, function(match, code) {
        const lines = code.trim().split('\n');
        let lang = "";
        if (lines[0] && lines[0].length < 10 && !lines[0].includes(' ')) {
          lang = lines.shift();
        }
        const cleanCode = lines.join('\n');
        return `<pre class="code-block" data-lang="${lang}"><code>${cleanCode}</code></pre>`;
      });

      escaped = escaped.replace(/`([^`]+)`/g, '<code class="u-mono">$1</code>');

      const paragraphs = escaped.split('\n\n').map(p => {
        const lines = p.split('\n').map(line => {
            if (line.startsWith('- ') || line.startsWith('* ')) {
                return `<li>${line.substring(2)}</li>`;
            }
            return line;
        }).join('<br>');

        if (lines.includes('<li>')) {
            return `<ul>${lines}</ul>`;
        }
        return `<p>${lines}</p>`;
      }).join('');

      return paragraphs;
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
          <div class="activity-content entry-content">${content}</div>
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
      const res = await fetch(`${API_BASE}/sessions/${_sessionId}:sendMessage`, {
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
