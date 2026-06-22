/* ═══════════════════════════════
   UI HELPERS
   ═══════════════════════════════ */
window.switchTab = function(t) {
  document.querySelectorAll('.ra-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === t));
  document.querySelectorAll('.ra-tab-content').forEach(el => el.classList.toggle('hidden', el.id !== 'tab-' + t));
}

window.setStatus = function(state, label) {
  document.getElementById('globalDot').className = 'ra-status-dot ' + state;
  document.getElementById('globalLabel').textContent = label;
}

window.toggleSettings = function() {
  document.getElementById('settingsDrawer').classList.toggle('hidden');
}

window.toggleConsole = function() {
  ST.consoleCollapsed = !ST.consoleCollapsed;
  document.getElementById('raConsole').classList.toggle('collapsed', ST.consoleCollapsed);
}

window.clearConsole = function() {
  document.getElementById('consoleBody').innerHTML = '';
}

window.log = function(type, msg) {
  const body = document.getElementById('consoleBody');
  const line = document.createElement('div');
  const prefix = { info: '·', success: '✓', error: '✗', warn: '!', cmd: '$', data: '>' }[type] || '·';
  line.className = `ra-console-line ra-cl-${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${prefix} ${msg}`;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

window.escHtml = function(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window.showDetail = function(data) {
  const body = document.getElementById('detailBody');
  if (data.type === 'file') {
    body.innerHTML = `
      <div class="ra-detail-field"><div class="ra-detail-label">FILE</div><div class="ra-detail-value accent">${data.name}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">PATH</div><div class="ra-detail-value mono">${data.path}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">REVISION</div><div class="ra-detail-value mono" style="color:var(--c-svn)">r${data.revision}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">LAST AUTHOR</div><div class="ra-detail-value">${data.author}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">DATE</div><div class="ra-detail-value mono">${data.date}</div></div>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:6px">
        <button class="ra-mini-btn" style="width:100%" onclick="document.getElementById('diffPath').value='${data.path}';switchTab('diff')">View Diff</button>
        <button class="ra-mini-btn" style="width:100%" onclick="document.getElementById('svnLogAuthor').value='';svnLog()">File Log</button>
      </div>
    `;
  } else if (data.type === 'info') {
    body.innerHTML = `
      <div class="ra-detail-field"><div class="ra-detail-label">REVISION</div><div class="ra-detail-value mono" style="color:var(--c-svn)">r${data.revision}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">URL</div><div class="ra-detail-value mono">${data.url}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">LAST CHANGED REV</div><div class="ra-detail-value mono">r${data.last_changed_rev}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">LAST AUTHOR</div><div class="ra-detail-value">${data.last_changed_author}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">LAST DATE</div><div class="ra-detail-value mono">${data.last_changed_date}</div></div>
    `;
  } else if (data.type === 'svn') {
    body.innerHTML = `
      <div class="ra-detail-field"><div class="ra-detail-label">REVISION</div><div class="ra-detail-value mono" style="color:var(--c-svn)">r${data.revision}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">AUTHOR</div><div class="ra-detail-value accent">${data.author}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">DATE</div><div class="ra-detail-value mono">${data.date}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">MESSAGE</div><div class="ra-detail-value">${data.message}</div></div>
      ${data.paths?.length ? `<div class="ra-detail-field"><div class="ra-detail-label">CHANGED FILES (${data.paths.length})</div><div style="display:flex;flex-direction:column;gap:3px;margin-top:4px">${data.paths.map(p=>`<div class="ra-detail-value mono" style="font-size:10px"><span style="color:var(--c-svn)">${p.action}</span> ${p.path}</div>`).join('')}</div></div>` : ''}
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:6px">
        <button class="ra-mini-btn" style="width:100%" onclick="document.getElementById('diffRev1').value=${parseInt(data.revision)-1};document.getElementById('diffRev2').value=${data.revision};switchTab('diff');svnDiff()">Diff this revision</button>
      </div>
    `;
  } else if (data.type === 'git') {
    body.innerHTML = `
      <div class="ra-detail-field"><div class="ra-detail-label">COMMIT</div><div class="ra-detail-value mono" style="color:var(--c-git)">${data.fullHash || data.hash}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">AUTHOR</div><div class="ra-detail-value accent">${data.author}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">DATE</div><div class="ra-detail-value mono">${data.date}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">MESSAGE</div><div class="ra-detail-value">${data.message}</div></div>
      <div class="ra-detail-field"><div class="ra-detail-label">EMAIL</div><div class="ra-detail-value mono" style="font-size:10px">${data.email}</div></div>
    `;
  } else if (data.type === 'msg') {
    body.innerHTML = `<div class="ra-detail-field"><div class="ra-detail-label">${data.title}</div><div class="ra-detail-value" style="margin-top:8px">${data.body}</div></div>`;
  }
}

window.selectCommit = function(type, data) {
  document.querySelectorAll('.ra-log-entry').forEach(el => el.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  showDetail({ type, ...data });
}

window.clearDetail = function() {
  document.getElementById('detailBody').innerHTML = '<div class="ra-placeholder" style="padding:20px 0">Select a file or commit</div>';
}

window.refreshAll = async function() {
  log('info', 'Refreshing all...');
  await Promise.allSettled([svnList(currentPath), svnInfo()]);
}

/* ═══════════════════════════════
   INIT
   ═══════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  log('info', 'Repo Admin ready. Configure endpoints in Settings ⚙');
});

/* ═══════════════════════════════
   KEYBOARD
   ═══════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('settingsDrawer').classList.add('hidden');
  if ((e.metaKey || e.ctrlKey) && e.key === 'r') { e.preventDefault(); refreshAll(); }
});
