/**
 * Reconciles Jules outputs with the canonical Hypenosys task record.
 * COMPLETED in Jules means execution finished, not that a PR was merged.
 * Only a verified GitHub merge into the task's configured develop/master target moves it to OK.
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


  // An implementation branch (task.rama) is NOT necessarily the integration base.
  // Honour explicit target fields, then the Dashboard's branch classification,
  // then the repository default (only develop/master are supported).
  function resolveTargetBranch(task, repositoryDefault = '') {
    const values = [
      task?.integration_branch, task?.merge_target_branch,
      task?.target_branch, task?.base_branch, task?.branch, task?.rama
    ];
    for (const raw of values) {
      const text = String(raw || '').trim();
      const labeled = /\\((develop|master)\\)\\s*$/i.exec(text);
      const candidate = (labeled ? labeled[1] : text).toLowerCase();
      if (candidate === 'develop' || candidate === 'master') return candidate;
    }
    const fallback = String(repositoryDefault || '').toLowerCase();
    return fallback === 'develop' || fallback === 'master' ? fallback : '';
  }

  function canAutoIntegrate(task) {
    const mode = String(task?.jules_session?.supervision || '').toLowerCase();
    // Manual supervision and explicitly disabled automatic merges remain gated.
    return ['auto', 'claude'].includes(mode) &&
      task?.auto_merge !== false && task?.jules_session?.auto_merge !== false;
  }

  function isJulesAuthored(prInfo, sid, repository) {
    const source = String(prInfo?.head?.repo?.full_name || '').toLowerCase();
    return source === repository.toLowerCase() &&
      String(prInfo?.body || '').includes('jules.google.com/task/' + sid);
  }

  function githubHeaders(token) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  async function githubRequest(pr, suffix, method = 'GET', payload = null) {
    const token = root.githubApi?.getAuthToken?.();
    if (method !== 'GET' && !token) throw new Error('GitHub OAuth requerido para integrar la PR');
    const response = await root.fetch('https://api.github.com/repos/' + pr.repository + suffix, {
      method, headers: {
        ...githubHeaders(token),
        ...(payload !== null ? { 'Content-Type': 'application/json' } : {})
      },
      ...(payload !== null ? { body: JSON.stringify(payload) } : {}),
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('GitHub ' + method + ' ' + suffix + ' HTTP ' + response.status);
    return response.status === 204 ? {} : response.json();
  }

  async function targetFromTask(task, pr) {
    const explicit = resolveTargetBranch(task);
    if (explicit) return explicit;
    const repo = await githubRequest(pr, '', 'GET');
    return resolveTargetBranch(task, repo.default_branch);
  }

  async function verifiedCI(pr, pull) {
    // Required evidence: at least one successful check, none pending/failed.
    // Prefer the PR merge-preview commit: its checks include the base branch.
    const sha = String(pull.merge_commit_sha || pull.head?.sha || '');
    if (!/^[0-9a-f]{40}$/i.test(sha)) return 'ci_pending';
    const checks = await githubRequest(pr, '/commits/' + sha + '/check-runs?per_page=100');
    const all = Array.isArray(checks?.check_runs) ? checks.check_runs : [];
    // Merge-preview checks can be absent in some repos. In that case use the
    // head checks, but only if performed after the PR's last update.
    let runs = all;
    if (!runs.length && pull.head?.sha && sha !== pull.head.sha) {
      const headChecks = await githubRequest(pr, '/commits/' + pull.head.sha + '/check-runs?per_page=100');
      const minTime = Date.parse(pull.updated_at || '') || 0;
      runs = (headChecks?.check_runs || []).filter(check =>
        Date.parse(check.started_at || '') >= minTime
      );
    }
    if (runs.some(check => check.status !== 'completed')) return 'ci_pending';
    if (runs.some(check => !['success', 'neutral', 'skipped'].includes(check.conclusion))) return 'ci_failed';
    if (runs.some(check => check.conclusion === 'success')) return 'ci_passed';
    return 'ci_pending';
  }

  async function integratePullRequest(pr, pull, task, sid, target) {
    if (!canAutoIntegrate(task) || !isJulesAuthored(pull, sid, pr.repository))
      return { pull, status: 'manual_review' };
    if (pull.state !== 'open' || pull.draft) return { pull, status: 'manual_review' };
    if (!root.githubApi?.getAuthToken?.()) return { pull, status: 'auth_required' };

    if (String(pull.base?.ref || '') !== target) {
      try {
        // Re-target Jules's PR without rebasing or overwriting its code.
        // GitHub recalculates mergeability against the new integration branch.
        await githubRequest(pr, '/pulls/' + pr.number, 'PATCH', { base: target });
        pull = await getPullRequest(pr);
      } catch (error) {
        console.warn('[Jules PR Sync] Retargeting failed:', error);
        return { pull, status: 'wrong_base' };
      }
      // Never merge in the same cycle as a base change: CI must re-run.
      return { pull, status: 'ci_pending' };
    }

    if (pull.mergeable !== true ||
      !['clean', 'unstable'].includes(String(pull.mergeable_state || ''))) {
      return { pull, status: 'merge_blocked' };
    }
    let ci;
    try { ci = await verifiedCI(pr, pull); }
    catch (error) {
      console.warn('[Jules PR Sync] CI unavailable:', error);
      return { pull, status: 'ci_pending' };
    }
    if (ci !== 'ci_passed') return { pull, status: ci };

    try {
      // The expected head SHA makes cross-tab races and new Jules commits safe.
      const result = await githubRequest(pr, '/pulls/' + pr.number + '/merge', 'PUT', {
        sha: pull.head.sha, merge_method: 'squash'
      });
      if (!result.merged) return { pull, status: 'merge_blocked' };
      pull = await getPullRequest(pr);
      return { pull, status: 'merged' };
    } catch (error) {
      console.warn('[Jules PR Sync] Merge refused:', error);
      return { pull, status: 'merge_blocked' };
    }
  }

  async function getPullRequest(pr) {
    const data = await githubRequest(pr, '/pulls/' + pr.number);
    if (Number(data?.number) !== pr.number ||
      String(data?.base?.repo?.full_name || '').toLowerCase() !== pr.repository.toLowerCase()) {
      throw new Error('La PR no pertenece al repositorio esperado.');
    }
    return data;
  }

  function prStage(prInfo, target = '') {
    if (!prInfo) return { status: 'verification_pending', merged: false, base: '' };
    const base = String(prInfo.base?.ref || '');
    const merged = prInfo.merged === true && Boolean(prInfo.merged_at) && Boolean(target) && base === target;
    return {
      status: merged ? 'merged' : (prInfo.state === 'closed' ? 'closed_unmerged' : base !== target ? 'wrong_base' : 'awaiting_merge'),
      merged, base
    };
  }

  function showStatus(task, pr, phase, target = '') {
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
      awaiting_merge: 'PR creada · pendiente de merge',
      verification_pending: 'PR creada · verificación de GitHub pendiente',
      wrong_base: 'PR creada · destino diferente a la rama de integración',
      closed_unmerged: 'PR cerrada sin merge · requiere revisión',
      ci_pending: 'PR lista · esperando comprobaciones CI',
      ci_failed: 'Comprobaciones CI fallidas · requiere revisión',
      merge_blocked: 'GitHub bloquea el merge · requiere revisión',
      auth_required: 'Conecta GitHub para integrar la PR',
      manual_review: 'PR creada · pendiente de aprobación humana',
      merged: 'PR fusionada · tarea completada'
    };
    notice.replaceChildren(document.createTextNode((labels[phase] || 'Sincronizando PR') +
      (target ? ' · ' + target : '')));
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
        if (String(session.state).toUpperCase() === 'COMPLETED') {
          showStatus(task, null, 'awaiting_pr');
          const current = String(task.estado || task.status || '').toUpperCase();
          if (!doneStates.has(current) &&
              (current !== 'REVIEW' || task.jules_session?.pr_sync_status !== 'awaiting_pr')) {
            if (workspace !== root.githubApi?.getActiveWorkspace?.()) return false;
            await root.taskOps.updateTask(task.id, {
              estado: 'REVIEW',
              jules_session: { ...(task.jules_session || {}), session_id: sid,
                status: 'COMPLETED', pr_sync_status: 'awaiting_pr' }
            });
            root.taskEngine?.notifyUpdate?.();
            if (typeof root.refreshDashboard === 'function') await root.refreshDashboard();
            if (typeof root.refreshDashboardData === 'function') await root.refreshDashboardData();
          }
        }
        return false;
      }

      let verified = null;
      let target = '';
      let syncPhase = '';
      try {
        verified = await getPullRequest(pr);
        target = await targetFromTask(task, pr);
        if (target && String(session.state || '').toUpperCase() === 'COMPLETED' &&
            verified.state === 'open') {
          const integration = await integratePullRequest(pr, verified, task, sid, target);
          verified = integration.pull;
          syncPhase = integration.status;
        }
      } catch (error) {
        console.warn('[Jules PR Sync] GitHub verification failed:', error);
      }
      const stage = prStage(verified, target);
      if (!stage.merged && stage.status === 'awaiting_merge' && syncPhase) stage.status = syncPhase;
      const oldPr = task.pull_request || {};
      const remoteState = String(session.state || '');
      const latestPr = {
        url: pr.url,
        number: pr.number,
        repository: pr.repository,
        title: pr.title,
        state: verified ? String(verified.state || '') : String(oldPr.state || 'unknown'),
        base: stage.base || String(oldPr.base || ''),
        target_branch: target || String(oldPr.target_branch || ''),
        sync_status: stage.status,
        merged_at: stage.merged ? verified.merged_at : null
      };
      const current = String(task.estado || task.status || '').toUpperCase();
      // A transient GitHub outage must not revert an already verified merge.
      if (!verified && oldPr.sync_status === 'merged' && oldPr.merged_at && doneStates.has(current)) {
        showStatus(task, pr, 'merged', oldPr.target_branch || target);
        return true;
      }
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
        pr_sync_status: stage.status,
        target_branch: target || previousSession.target_branch || ''
      };
      const changed = String(task.estado || '') !== String(nextStatus || '') ||
        JSON.stringify(task.pull_request || null) !== JSON.stringify(latestPr) ||
        JSON.stringify(previousSession) !== JSON.stringify(nextSession) ||
        links.length !== (Array.isArray(task.external_links) ? task.external_links.length : 0);
      showStatus(task, pr, stage.status, target);
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
      // Persistence is authoritative. UI refresh failures must not prevent the
      // orchestrator from advancing or cause a second GitHub write.
      if (stage.merged) {
        try { await root.HypenosysTaskOrchestrator?.handleTaskCompleted?.(task.id); }
        catch (error) { console.warn('[Jules PR Sync] Error avanzando la cola:', error); }
      }
      try {
        if (typeof root.refreshDashboard === 'function') await root.refreshDashboard();
        if (typeof root.refreshDashboardData === 'function') await root.refreshDashboardData();
      } catch (error) {
        console.warn('[Jules PR Sync] La actualización de la vista falló; los datos están guardados:', error);
      }
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
        const julesState = String(task.jules_session?.status || '').toUpperCase();
        return !doneStates.has(status) && (julesState === 'COMPLETED' || !!task.pull_request?.url) &&
          !['FAILED', 'CANCELLED'].includes(julesState);
      });
      pending.sort((a,b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0));
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
    parsePullRequest, selectPullRequest, resolveTargetBranch, canAutoIntegrate,
    prStage, reconcileSession, reconcileAll, start
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(window);
