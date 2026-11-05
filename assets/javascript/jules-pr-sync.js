/**
 * Reconciles Jules outputs with the canonical Hypenosys task record.
 * COMPLETED in Jules means execution finished, not that a PR was merged.
 * Only a verified GitHub merge into develop automatically moves a task to OK.
 */
(function (root) {
  'use strict';

  const INTERVAL_MS = 45000;
  const inflight = new Set();
  let sweeping = false;
  let timer = null;
  const doneStates = new Set(['OK', 'DONE', 'COMPLETED', 'CLOSED', 'RESOLVED']);

  function sessionId(value) {
    return String(value || '').replace(/^sessions\//, '');
  }

  function parsePullRequest(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' ||
          parsed.username || parsed.password || parsed.search || parsed.hash) return null;
      const match = /^\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/pull\/([1-9]\d*)\/?$/.exec(parsed.pathname);
      if (!match) return null;
      return {
        repository: match[1] + '/' + match[2],
        number: Number(match[3]),
        url: 'https://github.com/' + match[1] + '/' + match[2] + '/pull/' + match[3]
      };
    } catch (_) {
      return null;
    }
  }

  function selectPullRequest(session, task) {
    const expectedRepo = String(task?.repository || task?.repo || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').toLowerCase();
    const outputs = Array.isArray(session?.outputs) ? session.outputs : [];
    for (const output of outputs) {
      const pr = parsePullRequest(output?.pullRequest?.url);
      if (pr && expectedRepo && pr.repository.toLowerCase() === expectedRepo) {
        return { ...pr, title: String(output.pullRequest.title || '').slice(0, 180) };
      }
    }
    return null;
  }

  async function getPullRequest(pr) {
    const token = root.githubApi?.getAuthToken?.();
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await root.fetch('https://api.github.com/repos/' + pr.repository + '/pulls/' + pr.number, {
      method: 'GET', headers, cache: 'no-store'
    });
    if (!response.ok) throw new Error('GitHub PR HTTP ' + response.status);
    const data = await response.json();
    if (Number(data?.number) !== pr.number ||
        String(data?.base?.repo?.full_name || '').toLowerCase() !== pr.repository.toLowerCase()) {
      throw new Error('La PR no pertenece al repositorio esperado.');
    }
    return data;
  }

  function prStage(prInfo) {
    if (!prInfo) return { status: 'verification_pending', merged: false, base: '' };
    const base = String(prInfo.base?.ref || '');
    const merged = prInfo.merged === true && Boolean(prInfo.merged_at) && base === 'develop';
    return {
      status: merged ? 'merged' : (prInfo.state === 'closed' ? 'closed_unmerged' : base !== 'develop' ? 'wrong_base' : 'awaiting_merge'),
      merged, base
    };
  }

  function showStatus(task, pr, phase) {
    if (typeof document === 'undefined') return;
    const context = (() => { try { return JSON.parse(localStorage.getItem('hy_neural_task_context') || 'null'); } catch (_) { return null; } })();
    if (String(context?.id || '') !== String(task?.id || '')) return;
    const host = document.getElementById('neural-task-overview') || document.getElementById('jules-task-supervisor');
    if (!host) return;
    let notice = document.getElementById('hy-jules-pr-status');
    if (!notice || notice.parentElement !== host) {
      notice?.remove();
      notice = document.createElement('div');
      notice.id = 'hy-jules-pr-status';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.style.cssText = 'margin-top:9px;padding:8px;border-radius:7px;border:1px solid rgba(189,147,249,.25);font-size:11px;overflow-wrap:anywhere';
      host.appendChild(notice);
    }
    const labels = {
      awaiting_pr: 'Jules ha terminado; esperando la PR.',
      awaiting_merge: 'PR creada · pendiente de merge en develop',
      verification_pending: 'PR creada · verificación de GitHub pendiente',
      wrong_base: 'PR creada · la rama destino no es develop',
      closed_unmerged: 'PR cerrada sin merge · requiere revisión',
      merged: 'PR fusionada en develop · tarea completada'
    };
    notice.replaceChildren(document.createTextNode(labels[phase] || 'Sincronizando PR'));
    if (pr) {
      notice.appendChild(document.createTextNode(' · '));
      const link = document.createElement('a');
      link.href = pr.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Ver PR #' + pr.number;
      link.style.color = '#bd93f9';
      notice.appendChild(link);
    }
  }

  function taskForSession(tasks, sid) {
    return (tasks || []).find(task =>
      sessionId(task?.jules_session?.session_id || task?.jules_session_id) === sid
    );
  }

  async function reconcileSession(id, suppliedSession) {
    const sid = sessionId(id);
    if (!sid || inflight.has(sid)) return false;
    if (!root.taskOps?.getAllTasks || !root.taskOps?.updateTask || !root.julesApi?.getSession) return false;
    inflight.add(sid);
    try {
      const workspace = root.githubApi?.getActiveWorkspace?.();
      const tasks = await root.taskOps.getAllTasks();
      const task = taskForSession(tasks, sid);
      if (!task || (task.organizationId && workspace && task.organizationId !== workspace)) return false;
      const session = suppliedSession || await root.julesApi.getSession('sessions/' + sid);
      if (sessionId(session?.name) !== sid) return false;
      const pr = selectPullRequest(session, task);
      if (!pr) {
        if (String(session.state).toUpperCase() === 'COMPLETED') showStatus(task, null, 'awaiting_pr');
        return false;
      }

      let verified = null;
      try {
        verified = await getPullRequest(pr);
      } catch (error) {
        console.warn('[Jules PR Sync] No se pudo verificar el estado de la PR:', error.message);
      }
      const stage = prStage(verified);
      const oldPr = task.pull_request || {};
      const remoteState = String(session.state || '');
      const latestPr = {
        url: pr.url,
        number: pr.number,
        repository: pr.repository,
        title: pr.title,
        state: verified ? String(verified.state || '') : String(oldPr.state || 'unknown'),
        base: stage.base || String(oldPr.base || ''),
        sync_status: stage.status,
        merged_at: stage.merged ? verified.merged_at : null
      };
      const current = String(task.estado || task.status || '').toUpperCase();
      // Never silently downgrade a manually completed task; do correct legacy auto-completions.
      const protectManualCompletion = doneStates.has(current) && task.updated_by_agent_supervisor !== true;
      const nextStatus = stage.merged ? 'OK' : (protectManualCompletion ? task.estado : 'REVIEW');
      const links = Array.isArray(task.external_links) ? task.external_links.slice() : [];
      if (!links.some(link => link?.url === pr.url)) {
        links.push({ label: 'Jules PR #' + pr.number, url: pr.url });
      }
      const previousSession = task.jules_session || {};
      const nextSession = {
        ...previousSession,
        session_id: sid,
        status: remoteState,
        pr_url: pr.url,
        pr_number: pr.number,
        pr_sync_status: stage.status
      };
      const changed = String(task.estado || '') !== String(nextStatus || '') ||
        JSON.stringify(task.pull_request || null) !== JSON.stringify(latestPr) ||
        JSON.stringify(previousSession) !== JSON.stringify(nextSession) ||
        links.length !== (Array.isArray(task.external_links) ? task.external_links.length : 0);
      showStatus(task, pr, stage.status);
      if (!changed) return stage.merged;

      // No writes when the user has switched workspace during the API request.
      if (workspace !== root.githubApi?.getActiveWorkspace?.()) return false;
      await root.taskOps.updateTask(task.id, {
        estado: nextStatus,
        pull_request: latestPr,
        jules_session: nextSession,
        external_links: links,
        updated_by_agent_supervisor: true,
        ...(stage.merged ? { completitud: 1 } : {})
      });

      try {
        const context = JSON.parse(localStorage.getItem('hy_neural_task_context') || 'null');
        if (String(context?.id || '') === String(task.id)) {
          localStorage.setItem('hy_neural_task_context', JSON.stringify({
            ...context, estado: nextStatus, pull_request: latestPr, jules_session: nextSession, external_links: links
          }));
        }
      } catch (_) { /* local cache is non-authoritative */ }
      root.taskEngine?.notifyUpdate?.();
      root.dispatchEvent?.(new CustomEvent('hy:jules-pr-synced', {
        detail: { taskId: task.id, sessionId: sid, pullRequest: latestPr, status: nextStatus }
      }));
      if (typeof root.refreshDashboard === 'function') await root.refreshDashboard();
      if (stage.merged) await root.HypenosysTaskOrchestrator?.handleTaskCompleted?.(task.id);
      return stage.merged;
    } catch (error) {
      console.warn('[Jules PR Sync] Error en reconciliación:', error);
      return false;
    } finally {
      inflight.delete(sid);
    }
  }

  async function reconcileAll() {
    if (sweeping || typeof document !== 'undefined' && document.hidden) return;
    if (!root.taskOps?.getAllTasks || !root.julesApi?.getSession) return;
    sweeping = true;
    try {
      const tasks = await root.taskOps.getAllTasks();
      const pending = (tasks || []).filter(task => {
        if (!sessionId(task?.jules_session?.session_id || task?.jules_session_id)) return false;
        const status = String(task.estado || task.status || '').toUpperCase();
        return !doneStates.has(status) &&
          !['FAILED', 'CANCELLED'].includes(String(task.jules_session?.status || '').toUpperCase());
      });
      for (const task of pending.slice(0, 12)) {
        await reconcileSession(task.jules_session?.session_id || task.jules_session_id);
      }
    } catch (error) {
      console.warn('[Jules PR Sync] No se pudo recorrer las tareas:', error);
    } finally {
      sweeping = false;
    }
  }

  function start() {
    if (timer || typeof document === 'undefined') return;
    timer = root.setInterval(() => { void reconcileAll(); }, INTERVAL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void reconcileAll(); });
    root.addEventListener?.('focus', () => { void reconcileAll(); });
    void reconcileAll();
  }

  root.HypenosysJulesPrSync = {
    parsePullRequest, selectPullRequest, prStage, reconcileSession, reconcileAll, start
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(window);
