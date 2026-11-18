/* HypenOS 2.0 presentation model: pure selectors, no remote writes and no fake events.
 * Accepts only the tasks already authorized for the selected workspace.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HypenOSModel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const finished = new Set(['OK', 'FIXED', 'DONE', 'COMPLETED', 'RESOLVED', 'CLOSED']);
  const priority = { CRITICAL: 0, MAJOR: 1, HIGH: 1, MEDIUM: 2, MINOR: 3, LOW: 3 };
  function text(v) { return String(v == null ? '' : v).trim(); }
  function status(t) { return text(t && (t.estado || t.status || 'Pending')).toUpperCase(); }
  function isDone(t) { return !!t && finished.has(status(t)); }
  function isObsolete(t) { return status(t) === 'OBSOLETE'; }
  function id(t) { return text(t && t.id); }
  function unresolvedDependencies(t, tasks) {
    if (!t || !Array.isArray(t.blocked_by)) return [];
    const byId = new Map((tasks || []).map(item => [id(item), item]));
    return [...new Set(t.blocked_by.map(text).filter(Boolean))]
      .filter(depId => !isDone(byId.get(depId)));
  }
  function stage(t, tasks) {
    if (isObsolete(t)) return 'obsolete';
    if (isDone(t)) return 'done';
    if (unresolvedDependencies(t, tasks).length || status(t) === 'BLOCKED') return 'blocked';
    if (status(t) === 'IN REVIEW' || status(t) === 'REVIEW' || status(t) === '?' ||
        t.jules_loop_estado === 'esperando_validacion') return 'review';
    if (status(t) === 'WORKING' || status(t) === 'IN PROGRESS') return 'working';
    return 'pending';
  }
  function ordered(tasks) {
    return (tasks || []).slice().sort((a,b) => {
      const diff=(priority[text(a.prioridad).toUpperCase()] ?? 4)-(priority[text(b.prioridad).toUpperCase()] ?? 4);
      return diff || ((Number(a.id) || 0)-(Number(b.id) || 0));
    });
  }
  function summary(tasks) {
    const output={pending:0,working:0,review:0,blocked:0,done:0,obsolete:0};
    (tasks || []).forEach(t=>{output[stage(t,tasks)]++;});
    return output;
  }
  function activity(tasks, max=12) {
    const entries = [];
    (tasks || []).forEach(t=>{
      (Array.isArray(t.change_log) ? t.change_log : []).forEach(e=>{
        if (!e || !e.timestamp || !Number.isFinite(Date.parse(e.timestamp))) return;
        entries.push({
          type:'change', taskId:id(t), title:text(t.title||t.titulo),
          when:e.timestamp, actor:text(e.author_login||e.author||'No registrado'),
          label:'Cambio '+text(e.field||'de tarea'),
          detail:text(e.new_value).slice(0,160)
        });
      });
    });
    return entries.sort((x,y)=>Date.parse(y.when)-Date.parse(x.when)).slice(0,Math.min(Math.max(max,0),100));
  }
  function safeArtifact(url) {
    if (typeof url !== 'string') return null;
    try {
      const u = new URL(url);
      const host=u.hostname.toLowerCase();
      if (u.protocol !== 'https:' || u.username || u.password ||
          !['github.com','forgejo.hypenosys.com'].includes(host)) return null;
      if (host === 'github.com' && !/^\/[^/]+\/[^/]+\/(pull|commit)\/[^/?#]+\/?$/.test(u.pathname)) return null;
      if (host !== 'github.com' && !/^\/[^/]+\/[^/]+\/(pulls|commit)\/[^/?#]+\/?$/.test(u.pathname)) return null;
      return u.href;
    } catch { return null; }
  }
  function taskArtifacts(t) {
    const artifacts = [];
    const sess=t.jules_session || {};
    const candidates=[
      t.pull_request_url, t.pr_url, sess.pr_url, sess.pull_request_url,
      ...(Array.isArray(t.external_links)?t.external_links.map(x=>x && x.url):[])
    ];
    const seen=new Set();
    for (const raw of candidates) {
      const link=safeArtifact(raw);
      if (link&&!seen.has(link)) {
        seen.add(link);
        artifacts.push({url:link, label:link.includes('/pull')?'PR referenciada (merge no verificado)':'Commit referenciado'});
      }
    }
    return artifacts;
  }
  function taskEvents(t) {
    const events=[];
    const created=text(t.created_at||t.fecha);
    if(created && Number.isFinite(Date.parse(created))) {
      events.push({when:created,actor:'Registro de tarea',label:'Fecha registrada',detail:'Fecha declarada en Hypenosys',kind:'metadata'});
    }
    (Array.isArray(t.change_log)?t.change_log:[]).forEach(e=>{
      if (!e || !e.timestamp || !Number.isFinite(Date.parse(e.timestamp)))return;
      events.push({when:e.timestamp,actor:text(e.author_login||e.author||'Sin autor'),
        label:text(e.field||'actualización'),detail:'Anterior: '+text(e.old_value).slice(0,90)+' · Nuevo: '+text(e.new_value).slice(0,90),kind:'change'});
    });
    (Array.isArray(t.comments)?t.comments:[]).forEach(e=>{
      if (!e || !e.timestamp || !Number.isFinite(Date.parse(e.timestamp)))return;
      events.push({when:e.timestamp,actor:text(e.author_login||'Sin autor'),label:'Nota de tarea',
        detail:text(e.body||'').slice(0,260),kind:'note'});
    });
    return events.sort((a,b)=>Date.parse(a.when)-Date.parse(b.when));
  }
  return { status, isDone, isObsolete, unresolvedDependencies, stage, ordered, summary, activity, safeArtifact, taskArtifacts, taskEvents };
});
