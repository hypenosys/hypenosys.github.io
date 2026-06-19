'use strict';

const JulesActivitiesModule = (() => {
  const API_BASE = 'https://jules.googleapis.com/v1alpha';
  let _sessionId = null;
  let _apiKey = null;
  let _pollInterval = null;
  let _renderedIds = new Set();
  const POLL_MS = 5000;

  function _getApiKey() {
    return localStorage.getItem('jules_api_key') || '';
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
    const time = new Date(act.createTime).toLocaleTimeString('es-ES');
    const orig = (act.originator || 'system').toUpperCase();
    let icon = '⚙️';
    if (act.originator === 'agent') icon = '🤖';
    if (act.originator === 'user') icon = '👤';

    let content = act.description || '';
    let extraHTML = '';

    if (act.agentMessaged) content = act.agentMessaged.agentMessage || '';
    if (act.userMessaged) content = act.userMessaged.userMessage || '';
    if (act.progressUpdated) {
      const p = act.progressUpdated;
      content = `<strong>${p.title || ''}</strong>${p.description ? ' — ' + p.description : ''}`;
    }
    if (act.planGenerated) {
      const steps = (act.planGenerated.plan?.steps || []);
      content = '📋 Plan generado';
      extraHTML = `<ol class="jules-plan-steps">${steps.map(s =>
        `<li><strong>${s.title}</strong>${s.description ? ': ' + s.description : ''}</li>`
      ).join('')}</ol>`;
    }
    if (act.sessionCompleted) content = '✅ Sesión completada correctamente';
    if (act.sessionFailed) content = `❌ Error: ${act.sessionFailed.reason || 'desconocido'}`;

    if (act.artifacts?.length) {
      act.artifacts.forEach(artifact => {
        if (artifact.changeSet?.gitPatch) {
          const msg = artifact.changeSet.gitPatch.suggestedCommitMessage || '';
          extraHTML += `<div class="jules-artifact jules-artifact--diff">📄 <em>${msg}</em></div>`;
        }
        if (artifact.bashOutput) {
          extraHTML += `<div class="jules-artifact jules-artifact--bash">
            <code>$ ${artifact.bashOutput.command || ''}</code>
            <pre>${artifact.bashOutput.output || ''}</pre>
          </div>`;
        }
      });
    }

    return `
      <div class="jules-activity-entry jules-activity-entry--${act.originator || 'system'}">
        <span class="activity-icon">${icon}</span>
        <div class="activity-body">
          <div class="activity-header">
            <span class="activity-originator">${orig}</span>
            <span class="activity-time">${time}</span>
          </div>
          <div class="activity-content">${content}</div>
          ${extraHTML}
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
      div.innerHTML = _activityToHTML(act);
      container.appendChild(div.firstElementChild);
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

  return { startPolling, stopPolling, sendMessage };
})();

window.JulesActivitiesModule = JulesActivitiesModule;
