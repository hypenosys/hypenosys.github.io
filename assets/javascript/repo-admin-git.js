/* ═══════════════════════════════
   GIT LOG
   ═══════════════════════════════ */
window.gitLog = async function() {
  const limit = parseInt(document.getElementById('gitLogLimit').value) || 30;
  const branch = document.getElementById('gitBranch').value.trim() || 'main';
  switchTab('gitlog');
  const list = document.getElementById('gitLogList');
  list.innerHTML = '<div class="ra-placeholder">Loading Git log...</div>';
  try {
    const data = await apiCall('git-log', { limit, branch });
    renderGitLog(data.commits || []);
    document.getElementById('statGitCommits').textContent = data.count || 0;
    log('success', `Loaded ${data.count} Git commits from ${branch}`);
    document.getElementById('dotGit').className = 'ra-chip-dot connected';
  } catch(e) {
    list.innerHTML = `<div class="ra-placeholder" style="color:var(--c-error)">${e.message}</div>`;
    log('error', e.message);
  }
}

window.renderGitLog = function(commits) {
  const list = document.getElementById('gitLogList');
  if (!commits.length) { list.innerHTML = '<div class="ra-placeholder">No commits found</div>'; return; }
  list.innerHTML = commits.map(c => `
    <div class="ra-log-entry" onclick="selectCommit('git', ${JSON.stringify(c).replace(/"/g,'&quot;')})">
      <div class="ra-log-header">
        <span class="ra-log-rev git">${c.hash}</span>
        <span class="ra-log-author">${c.author}</span>
        <span class="ra-log-date">${c.date}</span>
      </div>
      <div class="ra-log-msg">${c.message}</div>
    </div>
  `).join('');
}
