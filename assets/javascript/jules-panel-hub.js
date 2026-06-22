/* ════════════════════════════════════════
   JULES PANEL GITHUB HUB
   ════════════════════════════════════════ */

window.switchHubTab = async function(tabId, el) {
    localStorage.setItem('hypenosys_hub_active_tab', tabId);
    document.querySelectorAll('#view-hub .dr-tab').forEach(t => t.classList.remove('active'));
    if(el) el.classList.add('active');
    document.querySelectorAll('.hub-panel').forEach(p => p.style.display = 'none');
    const tabMap = { 'pull-requests': 'pr', 'issues': 'issues', 'branches': 'branches', 'actions': 'actions', 'notifications': 'notifs' };
    const panel = $(`panel-\${tabMap[tabId]}`);
    if(panel) panel.style.display = 'block';
    await loadHubContent(tabId);
}

window.loadHubContent = async function(tabId, force = false) {
    const repoVal = window.JulesPanelState.activeRepo; if (!repoVal) return;
    const parsed = window.parseSourceName(repoVal); if (!parsed) return;
    const tabMap = { 'pull-requests': 'pr', 'issues': 'issues', 'branches': 'branches', 'actions': 'actions', 'notifications': 'notifs' };
    const panel = $(`panel-\${tabMap[tabId]}`);
    const now = Date.now(), lastFetch = parseInt(panel.dataset.fetchedAt || '0', 10);
    if (!force && panel.dataset.loaded === 'true' && (now - lastFetch < 60000)) return;
    panel.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text3);">Cargando...</div>';
    try {
        if (tabId === 'pull-requests') await fetchHubPRs(parsed.owner, parsed.repo);
        else if (tabId === 'issues') await fetchHubIssues(parsed.owner, parsed.repo);
        else if (tabId === 'branches') await fetchHubBranches(parsed.owner, parsed.repo);
        else if (tabId === 'actions') await fetchHubActions(parsed.owner, parsed.repo);
        else if (tabId === 'notifications') await fetchHubNotifs();
        panel.dataset.loaded = 'true'; panel.dataset.fetchedAt = Date.now();
    } catch (e) { panel.innerHTML = `<div style="padding:20px; color:var(--red);">Error: \${e.message}</div>`; }
}

window.fetchHubPRs = async function(owner, repo) {
    const token = getGitHubToken();
    const res = await window.GHQueue.enqueue(() => fetch(`https://api.github.com/repos/\${owner}/\${repo}/pulls?state=open&per_page=20`, { headers: { Authorization: `Bearer \${token}` } }));
    const prs = await res.json();
    $('panel-pr').innerHTML = prs.map(pr => `<div style="padding:12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;"><div><div style="font-weight:600; color:var(--text);">\${pr.title}</div><div style="font-size:11px; color:var(--text3);">#\${pr.number} por \${pr.user.login} • \${getTimeAgo(pr.updated_at)}</div></div><a href="\${pr.html_url}" target="_blank" class="btn btn-ghost btn-sm">Ver ↗</a></div>`).join('') || '<div style="padding:40px; text-align:center; color:var(--text3);">Sin PRs</div>';
    $('pr-badge').textContent = prs.length;
}

window.fetchHubIssues = async function(owner, repo) {
    const token = getGitHubToken();
    const res = await window.GHQueue.enqueue(() => fetch(`https://api.github.com/repos/\${owner}/\${repo}/issues?state=open&per_page=20`, { headers: { Authorization: `Bearer \${token}` } }));
    const items = await res.json(); const issues = items.filter(i => !i.pull_request);
    $('panel-issues').innerHTML = issues.map(issue => `<div style="padding:12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;"><div><div style="font-weight:600; color:var(--text);">\${issue.title}</div><div style="font-size:11px; color:var(--text3);">#\${issue.number} • \${getTimeAgo(issue.created_at)}</div></div><a href="\${issue.html_url}" target="_blank" class="btn btn-ghost btn-sm">Ver ↗</a></div>`).join('') || '<div style="padding:40px; text-align:center; color:var(--text3);">Sin issues</div>';
    $('issues-badge').textContent = issues.length;
}

window.fetchHubBranches = async function(owner, repo) {
    const token = getGitHubToken();
    const res = await window.GHQueue.enqueue(() => fetch(`https://api.github.com/repos/\${owner}/\${repo}/branches?per_page=20`, { headers: { Authorization: `Bearer \${token}` } }));
    const branches = await res.json();
    $('panel-branches').innerHTML = branches.map(b => `<div style="padding:12px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px;"><span style="font-family:var(--font-mono); font-size:13px; color:var(--text2);">\${b.name}</span>\${b.protected ? '<span class="nav-badge" style="background:var(--surface-active); color:var(--accent2); font-size:9px;">🔒</span>' : ''}</div>`).join('');
}

window.fetchHubActions = async function(owner, repo) {
    const token = getGitHubToken();
    const res = await window.GHQueue.enqueue(() => fetch(`https://api.github.com/repos/\${owner}/\${repo}/actions/runs?per_page=20`, { headers: { Authorization: `Bearer \${token}` } }));
    const data = await res.json();
    $('panel-actions').innerHTML = (data.workflow_runs || []).map(run => {
        const color = run.conclusion === 'success' ? 'var(--green)' : run.conclusion === 'failure' ? 'var(--red)' : 'var(--amber)';
        return `<div style="padding:12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;"><div><div style="font-weight:600; color:var(--text);"><span style="color:\${color}">●</span> \${run.name} #\${run.run_number}</div><div style="font-size:11px; color:var(--text3);">\${run.head_branch} • \${getTimeAgo(run.updated_at)}</div></div><a href="\${run.html_url}" target="_blank" class="btn btn-ghost btn-sm">Logs ↗</a></div>`;
    }).join('') || '<div style="padding:40px; text-align:center; color:var(--text3);">Sin runs</div>';
}

window.fetchHubNotifs = async function() {
    const token = getGitHubToken();
    const res = await window.GHQueue.enqueue(() => fetch(`https://api.github.com/notifications?per_page=20`, { headers: { Authorization: `Bearer \${token}` } }));
    const notifs = await res.json();
    $('panel-notifs').innerHTML = notifs.map(n => `<div style="padding:12px; border-bottom:1px solid var(--border);"><div style="font-size:10px; color:var(--text3);">\${n.repository.name}</div><div style="font-weight:600; color:var(--text);">\${n.subject.title}</div></div>`).join('') || '<div style="padding:40px; text-align:center; color:var(--text3);">Estás al día</div>';
    $('notif-badge-hub').textContent = notifs.length;
}
