/* ═══════════════════════════════
   SVN LIST
   ═══════════════════════════════ */
window.svnList = async function(path, goUp) {
  if (goUp) {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    path = parts.join('/');
  }
  currentPath = path || '';
  updateBreadcrumb();
  const tree = document.getElementById('svnFileTree');
  tree.innerHTML = '<div class="ra-placeholder">Loading...</div>';
  try {
    const data = await apiCall('svn-list', { path: currentPath });
    renderFileTree(data.entries || []);
    document.getElementById('dotSvn').className = 'ra-chip-dot connected';
    log('success', `Listed ${(data.entries||[]).length} entries at /${currentPath || 'root'}`);
    document.getElementById('svnInfoText').textContent = `${(data.entries||[]).length} items`;
  } catch(e) {
    tree.innerHTML = `<div class="ra-empty-state"><span class="ra-empty-icon">✕</span><p style="color:var(--c-error)">${e.message}</p><button class="ra-connect-btn" onclick="svnList('')">Retry</button></div>`;
    log('error', e.message);
    setStatus('error', 'Error');
  }
}

window.renderFileTree = function(entries) {
  const tree = document.getElementById('svnFileTree');
  if (!entries.length) {
    tree.innerHTML = '<div class="ra-placeholder">Empty directory</div>';
    return;
  }
  tree.innerHTML = entries.map(e => `
    <div class="ra-file-item ${e.kind === 'dir' ? 'ra-file-dir' : ''}" onclick="${e.kind === 'dir' ? `svnList('${currentPath ? currentPath+'/' : ''}${e.name}')` : `selectFile('${e.name}', '${e.revision}', '${e.author}', '${e.date}')`}">
      <span class="ra-file-icon">${e.kind === 'dir' ? '📁' : getFileIcon(e.name)}</span>
      <span class="ra-file-name">${e.name}${e.kind === 'dir' ? '/' : ''}</span>
      <span class="ra-file-meta">r${e.revision}</span>
    </div>
  `).join('');
  document.getElementById('svnInfoText').textContent = `${entries.length} items · /${currentPath || 'root'}`;
  document.getElementById('svnRevBadge').textContent = `r${entries[0]?.revision || '—'}`;
}

window.getFileIcon = function(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = { uasset:'🎮', umap:'🗺', cpp:'📄', h:'📄', cs:'📄', ini:'⚙', cfg:'⚙', png:'🖼', jpg:'🖼', wav:'🎵', mp3:'🎵', fbx:'📐', obj:'📐', json:'📋', md:'📝', txt:'📝', uplugin:'🔌', uproject:'🎯' };
  return map[ext] || '📄';
}

window.updateBreadcrumb = function() {
  const parts = currentPath ? currentPath.split('/').filter(Boolean) : [];
  let html = `<span class="ra-bc-item" onclick="svnList('')">trunk/Hypenosys</span>`;
  let acc = '';
  parts.forEach((p, i) => {
    acc += (i === 0 ? '' : '/') + p;
    const path = acc;
    html += `<span class="ra-bc-sep">/</span><span class="ra-bc-item" onclick="svnList('${path}')">${p}</span>`;
  });
  document.getElementById('svnBreadcrumb').innerHTML = html;
}

window.selectFile = function(name, rev, author, date) {
  document.querySelectorAll('.ra-file-item').forEach(el => el.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  const fullPath = currentPath ? `${currentPath}/${name}` : name;
  showDetail({ type: 'file', name, path: fullPath, revision: rev, author, date });
  log('data', `Selected: ${fullPath} (r${rev} by ${author})`);
}

/* ═══════════════════════════════
   SVN LOG
   ═══════════════════════════════ */
window.svnLog = async function(limitOverride) {
  const limit = limitOverride || parseInt(document.getElementById('svnLogLimit').value) || 20;
  const filterAuthor = document.getElementById('svnLogAuthor')?.value.trim() || '';
  switchTab('svnlog');
  const list = document.getElementById('svnLogList');
  list.innerHTML = '<div class="ra-placeholder">Loading SVN log...</div>';
  try {
    const data = await apiCall('svn-log', { path: currentPath, limit });
    if (data.error) throw new Error(data.error);
    let entries = data.log || [];
    if (filterAuthor) entries = entries.filter(e => e.author.includes(filterAuthor));
    renderSvnLog(entries);
    log('success', `Loaded ${entries.length} SVN commits`);
  } catch(e) {
    list.innerHTML = `<div class="ra-placeholder" style="color:var(--c-error)">${e.message}</div>`;
    log('error', e.message);
  }
}

window.renderSvnLog = function(entries) {
  const list = document.getElementById('svnLogList');
  if (!entries.length) { list.innerHTML = '<div class="ra-placeholder">No commits found</div>'; return; }
  list.innerHTML = entries.map(e => `
    <div class="ra-log-entry" onclick="selectCommit('svn', ${JSON.stringify(e).replace(/"/g,'&quot;')})">
      <div class="ra-log-header">
        <span class="ra-log-rev">r${e.revision}</span>
        <span class="ra-log-author">${e.author}</span>
        <span class="ra-log-date">${e.date}</span>
      </div>
      <div class="ra-log-msg">${e.message || '(no message)'}</div>
      ${e.paths?.length ? `<div class="ra-log-files">${e.paths.slice(0,5).map(p => `<span class="ra-log-file-tag">${p.action} ${p.path.split('/').pop()}</span>`).join('')}${e.paths.length > 5 ? `<span class="ra-log-file-tag">+${e.paths.length-5} more</span>` : ''}</div>` : ''}
    </div>
  `).join('');
  document.getElementById('statSvnRev').textContent = entries[0]?.revision ? `r${entries[0].revision}` : '—';
  document.getElementById('statLastAuthor').textContent = entries[0]?.author || '—';
  document.getElementById('statLastDate').textContent = entries[0]?.date || '—';
}

/* ═══════════════════════════════
   SVN INFO
   ═══════════════════════════════ */
window.svnInfo = async function() {
  try {
    const data = await apiCall('svn-info', {});
    showDetail({ type: 'info', ...data });
    log('success', `SVN info loaded · r${data.revision}`);
    document.getElementById('svnRevBadge').textContent = `r${data.revision}`;
    document.getElementById('statSvnRev').textContent = `r${data.revision}`;
  } catch(e) {
    log('error', e.message);
  }
}

/* ═══════════════════════════════
   SVN STATUS
   ═══════════════════════════════ */
window.svnStatus = async function() {
  log('warn', 'svn status requires a local working copy — not available via remote SVN URL');
  showDetail({ type: 'msg', title: 'SVN Status', body: 'svn status works on a local working copy. Use svn list to browse the remote repository instead.' });
}

/* ═══════════════════════════════
   SVN DIFF
   ═══════════════════════════════ */
window.svnDiff = async function() {
  const path = document.getElementById('diffPath').value.trim();
  const rev1 = document.getElementById('diffRev1').value || 'PREV';
  const rev2 = document.getElementById('diffRev2').value || 'HEAD';
  const view = document.getElementById('diffView');
  view.innerHTML = '<div class="ra-placeholder">Loading diff...</div>';
  try {
    const data = await apiCall('svn-diff', { path, rev1, rev2 });
    renderDiff(data.diff || '', path, rev1, rev2);
    log('success', `Diff r${rev1}→r${rev2} ${path || 'root'}`);
  } catch(e) {
    view.innerHTML = `<div class="ra-placeholder" style="color:var(--c-error)">${e.message}</div>`;
    log('error', e.message);
  }
}

window.renderDiff = function(text, path, r1, r2) {
  const view = document.getElementById('diffView');
  if (!text.trim()) { view.innerHTML = '<div class="ra-placeholder">No differences found</div>'; return; }
  const lines = text.split('\n').map(line => {
    if (line.startsWith('+++') || line.startsWith('---')) return `<span class="ra-diff-ctx">${escHtml(line)}</span>`;
    if (line.startsWith('+')) return `<span class="ra-diff-add">${escHtml(line)}</span>`;
    if (line.startsWith('-')) return `<span class="ra-diff-del">${escHtml(line)}</span>`;
    if (line.startsWith('@@')) return `<span class="ra-diff-hunk">${escHtml(line)}</span>`;
    return `<span class="ra-diff-ctx">${escHtml(line)}</span>`;
  });
  view.innerHTML = lines.join('\n');
}

window.loadStats = async function() {
  try {
    await svnInfo();
  } catch(e) {}
}
