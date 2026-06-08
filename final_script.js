    <div class="modal-foot" style="justify-content:space-between">
      <span style="font-size:11px;color:var(--text3)">Powered by Anthropic</span>
      <button class="btn btn-ghost btn-sm" onclick="window.open('https://claude.ai','_blank')">Abrir Claude.ai ↗</button>
    </div>
  </div>
</div>

<!-- ══ TOAST ══ -->
<div class="toast-wrap" id="toast-wrap"></div>
<!-- ══ REPO CONFIG MODAL ══ -->
<div class="modal-overlay" id="repo-config-modal-overlay">
  <div class="modal-card glass" style="background:var(--surface-opaque); max-width: 550px;">
    <div class="modal-head">
      <div style="display:flex; align-items:center; gap:12px">
        <div id="repo-modal-icon" style="font-size:1.4em; color:var(--accent2)">📁</div>
        <div>
          <h3 class="modal-title" id="repo-modal-title">Configurar Repositorio</h3>
          <div id="repo-modal-real-name" style="font-size:10px; color:var(--text3); font-family:var(--font-mono)"></div>
        </div>
      </div>
      <button class="icon-btn" onclick="closeRepoModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="mrow">
        <label class="cfg-label">Alias Visual</label>
        <div style="display:flex; gap:8px">
          <input type="text" id="repo-alias-input" class="cfg-input" placeholder="Nombre personalizado...">
          <button class="btn btn-ghost btn-sm" id="repo-alias-reset">Restaurar</button>
        </div>
      </div>
      <div class="mrow">
        <label class="cfg-label">Categorías</label>
        <div id="repo-tags-grid" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:5px"></div>
      </div>
      <div class="mrow">
        <label class="cfg-label">Icono</label>
        <div id="repo-icons-grid" style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 5px"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" onclick="closeRepoModal()">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="repo-modal-save">Guardar cambios</button>
    </div>
  </div>
</div>

<script>
    window.JulesPanelState = {
        activeRepo:          localStorage.getItem('hypenosys_active_repo') || null,
        activeBranch:        localStorage.getItem('hypenosys_active_branch') || null,
        activeSession:       null,
        pollingTimer:        null,
        hubActiveTab:        localStorage.getItem('hypenosys_hub_active_tab') || 'pull-requests',
        rateLimitRemaining:  999,
        requestQueue:        [],
        isDispatching:       false,
        currentView:         'dashboard',
        metricsWindow:       30,
        notifications:       [],
        unreadCount:         0
        filter:              {status:"all", search:""},
        draggedId:           null,
        newTaskStatus:       "pending",
        runSimInterval:      null
    };

    class GHAPIQueue {
        constructor() {
            this.queue = [];
            this.running = false;
            this.minInterval = 300;
        }

        enqueue(fn, priority = 1) {
            return new Promise((resolve, reject) => {
                this.queue.push({ fn, priority, resolve, reject });
                this.queue.sort((a, b) => a.priority - b.priority);
                this.dispatch();
            });
        }

        async dispatch() {
            if (this.running) return;
            if (!this.queue.length) return;

            if (window.JulesPanelState.rateLimitRemaining <= 5) {
                const next = this.queue[0];
                if (next.priority > 0) return;
            }

            this.running = true;
            const { fn, resolve, reject } = this.queue.shift();
            try {
                const result = await fn();
                resolve(result);
            } catch(e) {
                reject(e);
            }
            this.running = false;
            setTimeout(() => this.dispatch(), this.minInterval);
        }
    }

    window.GHQueue = new GHAPIQueue();

    function getGitHubToken() {
        if (window.githubContext && window.githubContext.getAuthToken) {
            return window.githubContext.getAuthToken();
        }
        return sessionStorage.getItem('gh_access_token')
            || localStorage.getItem('gh_access_token')
            || localStorage.getItem('github_token')
            || null;
    }

    function updateRateLimit(remaining) {
        if (remaining === null || remaining === undefined) return;
        const count = parseInt(remaining, 10);
        window.JulesPanelState.rateLimitRemaining = count;

        if (count <= 10 && count > 0) {
            showToast(`⚠️ GitHub API: ${count} peticiones restantes`, 'amber');
        } else if (count === 0) {
            showToast(`🚫 GitHub API: Rate limit alcanzado`, 'red');
        }
        window.dispatchEvent(new CustomEvent('ghRateLimitUpdate', { detail: { remaining: count } }));
    }

    function escapeHtml(str) {
      return String(str ?? '')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
    }

    function getTimeAgo(dateStr) {
        if (!dateStr) return '---';
        const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return `hace ${Math.floor(interval)} años`;
        interval = seconds / 2592000;
        if (interval > 1) return `hace ${Math.floor(interval)} meses`;
        interval = seconds / 86400;
        if (interval > 1) return `hace ${Math.floor(interval)} días`;
        interval = seconds / 3600;
        if (interval > 1) return `hace ${Math.floor(interval)} horas`;
        interval = seconds / 60;
        if (interval > 1) return `hace ${Math.floor(interval)} min`;
        return 'hace unos segundos';
    }

function $(id){return document.getElementById(id)}

function showToast(msg,type='green'){
  const t=document.createElement('div');
  t.className='toast';t.style.borderColor=`var(--${type})`;
  t.innerHTML=`<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>${msg}</span>`;
  $('toast-wrap').appendChild(t);
  requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add('show')));
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300)},3200);
}

function addTel(tag,msg,type='info'){
  const d=new Date();
  const ts=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  const box=$('tel-box');
  if(!box) return;
  const line=document.createElement('div');
  line.className=`tel-line ${type}`;
  line.innerHTML=`<div class="tel-head"><span class="tel-time">${ts}</span><span class="tel-tag ${type}">${tag}</span></div><div class="tel-msg">${msg}</div>`;
  box.appendChild(line);
  box.scrollTop=box.scrollHeight;
}

function showAuthCard(id) {
    document.querySelectorAll(".auth-card").forEach(c => c.classList.add("hidden"));
    $(id).classList.remove("hidden");
    $("auth-overlay").classList.add("show");
}

function forceOpenPanel() {
    $("auth-overlay").classList.remove("show");
    $("app-root").classList.remove("locked");
    initRealPanel(null);
}

function handleGlobalAuthError() {
    showAuthCard("auth-card-login");
    $("app-root").classList.add("locked");
}



async function switchHubTab(tabId, el) {
    localStorage.setItem('hypenosys_hub_active_tab', tabId);

    document.querySelectorAll('.view-hub .dr-tab').forEach(t => t.classList.remove('active'));
    if(el) el.classList.add('active');

    document.querySelectorAll('.hub-panel').forEach(p => p.style.display = 'none');
    const panelId = {
        'pull-requests': 'panel-pr',
        'issues': 'panel-issues',
        'branches': 'panel-branches',
        'actions': 'panel-actions',
        'notifications': 'panel-notifs'
    }[tabId];

    const panel = $(panelId);
    if(panel) panel.style.display = 'block';

    await loadHubContent(tabId);
}

async function loadHubContent(tabId, force = false) {
    const repoVal = window.JulesPanelState.activeRepo;
    if (!repoVal) return;

    const parsed = window.parseSourceName(repoVal);
    if (!parsed) return;

    const panelId = {
        'pull-requests': 'panel-pr',
        'issues': 'panel-issues',
        'branches': 'panel-branches',
        'actions': 'panel-actions',
        'notifications': 'panel-notifs'
    }[tabId];

    const panel = $(panelId);
    const now = Date.now();
    const lastFetch = parseInt(panel.dataset.fetchedAt || '0', 10);

    if (!force && panel.dataset.loaded === 'true' && (now - lastFetch < 60000)) return;

    panel.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text3);">Cargando...</div>';

    try {
        if (tabId === 'pull-requests') await fetchHubPRs(parsed.owner, parsed.repo);
        else if (tabId === 'issues') await fetchHubIssues(parsed.owner, parsed.repo);
        else if (tabId === 'branches') await fetchHubBranches(parsed.owner, parsed.repo);
        // Actions and Notifs implementation skipped for brevity in this block, but structure remains
        panel.dataset.loaded = 'true';
        panel.dataset.fetchedAt = Date.now();
    } catch (e) {
        panel.innerHTML = `<div style="padding:20px; color:var(--red);">Error: ${e.message}</div>`;
    }
}

async function fetchHubPRs(owner, repo) {
    const token = getGitHubToken();
    const res = await window.GHQueue.enqueue(() => fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=20`,
        { headers: { Authorization: `Bearer ${token}` } }
    ));
    updateRateLimit(res.headers.get('X-RateLimit-Remaining'));
    const prs = await res.json();
    const panel = $('panel-pr');

    if (!prs.length) {
        panel.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text3);">No hay PRs abiertos</div>';
        return;
    }

    panel.innerHTML = prs.map(pr => `
        <div style="padding:12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="font-weight:600; color:var(--text);">${pr.title}</div>
                <div style="font-size:11px; color:var(--text3);">#${pr.number} por ${pr.user.login} • ${getTimeAgo(pr.updated_at)}</div>
            </div>
            <a href="${pr.html_url}" target="_blank" class="btn btn-ghost btn-sm">Ver PR ↗</a>
        </div>
    `).join('');
    $('pr-badge').textContent = prs.length;
}

async function fetchHubIssues(owner, repo) {
    const token = getGitHubToken();
    const res = await window.GHQueue.enqueue(() => fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=20`,
        { headers: { Authorization: `Bearer ${token}` } }
    ));
    const items = await res.json();
    const issues = items.filter(i => !i.pull_request);
    const panel = $('panel-issues');

    panel.innerHTML = issues.map(issue => `
        <div style="padding:12px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="font-weight:600; color:var(--text);">${issue.title}</div>
                <div style="font-size:11px; color:var(--text3);">#${issue.number} • ${getTimeAgo(issue.created_at)}</div>
            </div>
            <a href="${issue.html_url}" target="_blank" class="btn btn-ghost btn-sm">Ver Issue ↗</a>
        </div>
    `).join('') || '<div style="padding:40px; text-align:center; color:var(--text3);">No hay issues abiertos</div>';
    $('issues-badge').textContent = issues.length;
}

async function fetchHubBranches(owner, repo) {
    const token = getGitHubToken();
    const res = await window.GHQueue.enqueue(() => fetch(
        `https://api.github.com/repos/${owner}/${repo}/branches?per_page=20`,
        { headers: { Authorization: `Bearer ${token}` } }
    ));
    const branches = await res.json();
    const panel = $('panel-branches');

    panel.innerHTML = branches.map(b => `
        <div style="padding:12px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px;">
            <svg width="14" height="14" fill="none" stroke="var(--text3)" viewBox="0 0 24 24"><path d="M12 21a9 9 0 100-18 9 9 0 000 18z"/><path d="M12 8v4l3 3"/></svg>
            <span style="font-family:var(--font-mono); font-size:13px; color:var(--text2);">${b.name}</span>
            ${b.protected ? '<span class="nav-badge" style="background:var(--surface-active); color:var(--accent2); font-size:9px;">PROTEGIDA</span>' : ''}
        </div>
    `).join('');
}

function switchView(view, navEl) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));

    const target = $(`view-${view}`);
    if (target) target.classList.add('active');
    if (navEl) navEl.classList.add('active');

    window.JulesPanelState.currentView = view;

    if (view === 'kanban') refreshSessions();
    if (view === 'metrics') renderMetrics();
    if (view === 'hub') {
        const activeTab = localStorage.getItem('hypenosys_hub_active_tab') || 'pull-requests';
        const tabEl = document.querySelector(`.dr-tab[data-tab="${activeTab}"]`);
        switchHubTab(activeTab, tabEl);
    }
}

async function initRealPanel(user) {
    if (!user && !getGitHubToken()) {
        showAuthCard("auth-card-login");
        return;
    }

    $("auth-overlay").classList.remove("show");
    $("app-root").classList.remove("locked");

    addTel("SYSTEM", `Iniciado como ${user ? user.login : "Invitado"}`, "success");
    await initializeRepoSelector();
    await refreshSessions();
    startPolling();
}

let sessionPollInterval = null;

function startPolling() {
    stopPolling();
    sessionPollInterval = setInterval(() => {
        if (!document.hidden) {
            refreshSessions();
        }
    }, 15000);
}

function stopPolling() {
    if (sessionPollInterval) clearInterval(sessionPollInterval);
}

document.addEventListener('visibilitychange', () => {
    document.hidden ? stopPolling() : startPolling();
});

window.addEventListener('beforeunload', stopPolling);
async function onRepoSelected(sourceName, sourceObject) {
    const branchSelect  = $('branch-sel');
    const branchMeta    = $('branch-meta');
    const cfgPath       = $('cfg-path');
    const aliasIn       = $('alias-in');
    const sessCtx       = $('sess-ctx');

    if (!sourceName) return;

    const parsed = window.parseSourceName(sourceName);
    const repoName = parsed ? parsed.repo : sourceName;
    const repoOwner = parsed ? parsed.owner : null;

    if(cfgPath) cfgPath.textContent = sourceName;
    const displayLabel = sourceObject?.displayName || repoName;
    if(aliasIn) aliasIn.value = window.getRepoAlias(sourceName) || displayLabel;
    if(sessCtx) sessCtx.textContent = `${displayLabel}: cargando...`;

    branchSelect.disabled = true;
    branchSelect.innerHTML = '<option value="">Cargando ramas...</option>';

    try {
        const branches = await window.githubContext.getBranches(repoName, repoOwner || undefined);
        const repoData = (await window.githubContext.getRepos()).find(r => r.name === repoName && (repoOwner ? r.owner === repoOwner : true));
        const defaultBranch = repoData ? repoData.default_branch : 'main';

        branchSelect.innerHTML = branches.map(b => {
            const isDefault = b.name === defaultBranch;
            return `<option value="${b.name}" ${isDefault ? 'selected' : ''}>${b.name}${isDefault ? ' ★' : ''}</option>`;
        }).join('');

        const lastSelected = localStorage.getItem('jules_selected_branch');
        if (lastSelected && branches.some(b => b.name === lastSelected)) {
            branchSelect.value = lastSelected;
        }

        if(branchMeta) branchMeta.innerHTML = `<span class="u-dot"></span><span>${branches.length} ramas</span>`;
        const activeBranch = branchSelect.value;
        if(sessCtx) sessCtx.textContent = `${displayLabel}: ${activeBranch}`;
        window.JulesPanelState.activeBranch = activeBranch;

    } catch (e) {
        branchSelect.innerHTML = '<option value="main">main</option>';
    } finally {
        branchSelect.disabled = false;
    }
}

async function initializeRepoSelector() {
    try {
        const githubRepos = await window.githubContext.getRepos();
        const sources = githubRepos.map(r => ({
            name: `sources/github/${r.full_name}`,
            githubRepo: { owner: r.owner, repo: r.name },
            displayName: r.name
        }));

        window.julesSourcesCache = sources;
        renderRepos(sources);
        populateContextSelector(sources);

    } catch (e) {
        console.error('[Jules] Repo init failed:', e);
    }
}

function renderRepos(sources) {
    const list = $('repo-list');
    if (!list) return;
    list.innerHTML = '';
    const current = window.JulesPanelState.activeRepo;

    sources.forEach(s => {
        const repoShort = s.name.split('/').pop();
        const el = document.createElement('div');
        el.className = `repo-item ${s.name === current ? 'selected' : ''}`;
        el.innerHTML = `<span class="repo-dot"></span><span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${s.displayName || repoShort}</span>`;
        el.onclick = () => switchRepo(s.name, s);
        list.appendChild(el);
    });
}

function switchRepo(sourceName, sourceObj) {
    window.JulesPanelState.activeRepo = sourceName;
    localStorage.setItem('hypenosys_active_repo', sourceName);
    renderRepos(window.julesSourcesCache || []);
    onRepoSelected(sourceName, sourceObj);
    addTel("SYSTEM", `Contexto: ${sourceName.split('/').pop()}`, "info");
}

async function populateContextSelector(sources) {
    const menu = $('repo-menu');
    const container = $('repo-items-container');
    const trigger = $('repo-trigger');
    const label = $('repo-label');
    const searchInput = $('repo-search');

    function renderItems(filter = '') {
        container.innerHTML = '';
        const filtered = sources.filter(s => (s.displayName || s.name).toLowerCase().includes(filter.toLowerCase()));
        filtered.forEach(s => {
            const item = document.createElement('div');
            item.className = 'custom-dropdown-item';
            item.innerHTML = `<span>${s.displayName || s.name.split('/').pop()}</span>`;
            item.onclick = (e) => {
                e.stopPropagation();
                select(s.name, s);
                menu.style.display = 'none';
            };
            container.appendChild(item);
        });
    }

    function select(name, obj) {
        label.textContent = obj?.displayName || name.split('/').pop();
        switchRepo(name, obj);
    }

    trigger.onclick = (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    };
    searchInput.oninput = (e) => renderItems(e.target.value);
    renderItems();
}
async function refreshSessions() {
    try {
        const data = await window.julesApi.getSessions(window.JulesPanelState.metricsWindow || 30);
        const sessions = data.sessions || [];
        window.julesSessionsCache = sessions;

        renderHistoryTable(sessions);

        // Notification for awaiting approval
        sessions.forEach(s => {
            if (s.state === 'AWAITING_PLAN_APPROVAL' || s.state === 'AWAITING_USER_FEEDBACK') {
                const idSafe = s.name.split('/').pop();
                const lastNotif = localStorage.getItem(`jules_notif_approval_${idSafe}`);
                if (!lastNotif) {
                    showToast(`Sesión ${idSafe} espera tu revisión. <button onclick="openDrawer('${s.name}')" style="background:none; border:none; color:#fff; text-decoration:underline; cursor:pointer; padding:0; margin-left:10px;">ABRIR DRAWER</button>`, 'amber');
                    localStorage.setItem(`jules_notif_approval_${idSafe}`, Date.now());
                }
            }
        });

        renderKanban(sessions);
        updateStats();

    } catch (e) {
        console.error('[Jules] Error refreshing sessions:', e);
    }
}

function renderHistoryTable(sessions) {
    const body = $('tbl-body');
    if (!body) return;

    if (sessions.length === 0) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text3);">Sin sesiones</td></tr>';
        return;
    }

    body.innerHTML = sessions.map(s => {
        const statusLabel = {
            'IN_PROGRESS': 'activo',
            'COMPLETED': 'listo',
            'FAILED': 'error',
            'QUEUED': 'cola',
            'PLANNING': 'planificando',
            'AWAITING_PLAN_APPROVAL': 'esperando'
        }[s.state] || 'listo';

        const statusClass = s.state.toLowerCase().replace(/_/g, '-');

        return `<tr onclick="openDrawer('${s.name}')">
            <td><span class="sid">${s.name.split('/').pop()}</span></td>
            <td class="tdesc">${escapeHtml(s.title || s.prompt)}</td>
            <td class="tmono">${s.sourceContext?.source?.split('/').pop() || '---'}</td>
            <td class="tmono">${s.sourceContext?.githubRepoContext?.startingBranch || '---'}</td>
            <td><span class="sbadge ${statusClass}"><span class="pulse-dot"></span>${statusLabel}</span></td>
            <td class="tmono">${getTimeAgo(s.createTime)}</td>
            <td class="tmono">${new Date(s.createTime).toLocaleDateString()}</td>
        </tr>`;
    }).join('');
}

function renderKanban(sessions) {
    const columns = {
        'pending': ['QUEUED', 'PLANNING'],
        'running': ['IN_PROGRESS', 'AWAITING_PLAN_APPROVAL', 'AWAITING_USER_FEEDBACK'],
        'done':    ['COMPLETED'],
        'error':   ['FAILED']
    };

    Object.keys(columns).forEach(colId => {
        const colEl = $(`kb-${colId}`);
        const countEl = $(`kb-count-${colId}`);
        if (!colEl) return;

        const items = sessions.filter(s => columns[colId].includes(s.state));
        if (countEl) countEl.textContent = items.length;

        colEl.innerHTML = items.map(s => `
            <div class="kb-card ${colId}" onclick="openDrawer('${s.name}')">
                <div class="kb-card-id">${s.name.split('/').pop()}</div>
                <div class="kb-card-task">${escapeHtml(s.title || s.prompt)}</div>
                <div class="kb-card-meta">
                    <span class="kb-card-repo">${s.sourceContext?.source?.split('/').pop() || '---'}</span>
                    <span class="kb-card-time">${getTimeAgo(s.createTime)}</span>
                </div>
            </div>
        `).join('');
    });
}

function updateStats() {
    const sessions = window.julesSessionsCache || [];
    const running = sessions.filter(s => ['IN_PROGRESS', 'PLANNING', 'AWAITING_PLAN_APPROVAL'].includes(s.state)).length;

    if($('s-active')) $('s-active').textContent = running;
    if($('s-repos'))  $('s-repos').textContent  = (window.julesSourcesCache || []).length;
    if($('s-total'))  $('s-total').textContent  = sessions.length;
    if($('kanban-badge')) $('kanban-badge').textContent = running;
}

async function launchSession() {
    const prompt = $('session-prompt').value.trim();
    if (!prompt) {
        $('session-prompt').focus();
        showToast("Escribe una tarea para Jules", "red");
        return;
    }

    const source = window.JulesPanelState.activeRepo;
    const branch = window.JulesPanelState.activeBranch || 'master';

    if (!source) {
        showToast("Selecciona un repositorio", "red");
        return;
    }

    const btn = $('launch-btn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Iniciando...';

    try {
        const body = {
            prompt,
            sourceContext: {
                source,
                githubRepoContext: { startingBranch: branch }
            }
        };

        // Add options based on pills (simplification for Bloque B)
        if ($('opt-review').classList.contains('active')) body.requirePlanApproval = true;

        const res = await window.julesApi.createSession(body);
        showToast("Sesión iniciada correctamente", "green");
        addTel("JULES", `Sesión iniciada: ${res.name.split('/').pop()}`, "success");

        $('session-prompt').value = '';
        await refreshSessions();

    } catch (e) {
        showToast(e.message || "Error al lanzar sesión", "red");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}


function init(){
  let arrancado = false;

  function boot(user) {
    if (arrancado) return;
    arrancado = true;
    initRealPanel(user);
  }

  document.addEventListener("authReady", (e) => boot(e.detail?.user));

  setTimeout(() => {
    if (!arrancado) {
      if (getGitHubToken()) {
        boot(window.githubApi?.user);
      } else {
        showAuthCard("auth-card-error");
      }
    }
  }, 5000);
}

window.onload = init;

function openMobileSidebar(){
  $('app-sidebar').classList.add('mob-open');
  $('sidebar-backdrop').classList.add('open');
}
function closeMobileSidebar(){
  $('app-sidebar').classList.remove('mob-open');
  $('sidebar-backdrop').classList.remove('open');
}
function openDrawer(sessionId) {
async function refreshActivities(sessionId) {
    const container = $('dr-term');
    if (!container) return;

    try {
        const data = await window.julesApi.getActivities(sessionId, 50);
        const activities = data.activities || [];

        container.innerHTML = activities.map(a => {
            let cls = 'tline ';
            let txt = a.description || '';

            if (a.progressUpdated) { cls += 'agent'; txt = a.progressUpdated.title; }
            else if (a.planGenerated) { cls += 'sys'; txt = 'Plan generado'; }
            else if (a.planApproved) { cls += 'git'; txt = 'Plan aprobado'; }
            else if (a.sessionFailed) { cls += 'err'; txt = `ERROR: ${a.sessionFailed.reason}`; }

            return `<div class="${cls}">${escapeHtml(txt)}</div>`;
        }).join('') || '<div class="tline sys">Sin actividades registradas</div>';

    refreshActivities(sessionId);
    } catch (e) {
        container.innerHTML = `<div class="tline err">Error al cargar actividades: ${e.message}</div>`;
    }
}
    $('dr-sub').textContent = `Sesión: ${sessionId.split('/').pop()}`;
    $('dr-overlay').classList.add('open');
    $('drawer').classList.add('open');
    // Activities and Diffs will be implemented in Step 5
}
function closeDrawer() {
    $('dr-overlay').classList.remove('open');
    $('drawer').classList.remove('open');
}
</script></body></html>
function renderMetrics() {
    const sessions = window.julesSessionsCache || [];
    if (!sessions.length) return;

    const windowSize = window.JulesPanelState.metricsWindow || 30;
    const sample = sessions.slice(0, windowSize);

    const total = sample.length;
    const success = sample.filter(s => s.state === 'COMPLETED').length;
    const successRate = Math.round((success / total) * 100);

    const tokens = sample.reduce((acc, s) => acc + (s.usage?.totalTokens || 0), 0);

    if($('m-success-rate')) $('m-success-rate').textContent = `${successRate}%`;
    if($('m-tokens')) $('m-tokens').textContent = `${Math.round(tokens/1000)}k`;

    // Dist breakdown
    const states = {
        'done': sample.filter(s => s.state === 'COMPLETED').length,
        'running': sample.filter(s => s.state === 'IN_PROGRESS').length,
        'error': sample.filter(s => s.state === 'FAILED').length,
        'pending': sample.filter(s => s.state === 'QUEUED' || s.state === 'PLANNING').length
    };

    if($('leg-done')) $('leg-done').textContent = states.done;
    if($('leg-running')) $('leg-running').textContent = states.running;
    if($('leg-error')) $('leg-error').textContent = states.error;
    if($('leg-pending')) $('leg-pending').textContent = states.pending;
}
</script></body></html>
