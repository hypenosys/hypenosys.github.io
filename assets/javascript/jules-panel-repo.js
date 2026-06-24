/**
 * Jules Panel - Repositories & Context
 * Handles repo listing, selection, grouping and branch selection.
 */

window.JulesPanelState = window.JulesPanelState || {};

function initializeRepoSelector() {
    const btn = $('launch-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Cargando fuentes...';
    }
    // We trigger source fetching from auth.js but we ensure this exists
}

async function fetchJulesSources() {
    try {
        const julesSources = await window.julesApi.getSources();
        window.julesSourcesCache = julesSources; // Populate the cache
        const githubRepos = await window.githubApi.getRepos();

        const mappedRepos = githubRepos.map(r => {
            const sourceName = 'sources/github/' + r.full_name;
            const julesSource = julesSources.find(s => s.name === sourceName || s.name === 'sources/github-' + r.owner + '-' + r.name);
            return {
                ...r,
                jules_name: julesSource ? julesSource.name : null,
                is_installed: !!julesSource
            };
        });

        renderRepos(mappedRepos);

        const activeRepo = localStorage.getItem('hypenosys_active_repo');
        if (activeRepo) {
            selectRepo(activeRepo);
        }
    } catch (e) {
        console.error('Error fetching sources:', e);
        addTel('SYSTEM', 'Error al cargar repositorios', 'error');
    }
}

function renderRepos(repos) {
    const list = $('repo-list');
    if (!list) return;

    // Group repos by organization/owner
    const groups = {};
    repos.forEach(r => {
        const org = r.full_name.split('/')[0];
        if (!groups[org]) groups[org] = [];
        groups[org].push(r);
    });

    const collapsedGroups = JSON.parse(localStorage.getItem('hy_repo_groups_collapsed') || '{}');
    const activeRepo = localStorage.getItem('hypenosys_active_repo');
    const activeOrg = activeRepo ? activeRepo.split('/')[0] : null;

    list.innerHTML = '';

    Object.keys(groups).sort().forEach(org => {
        const orgRepos = groups[org].sort((a, b) => a.name.localeCompare(b.name));
        const isCollapsed = collapsedGroups[org] === true && org !== activeOrg;

        const groupEl = document.createElement('div');
        groupEl.className = 'repo-group' + (isCollapsed ? ' collapsed' : '');
        groupEl.setAttribute('data-org', org);

        const header = document.createElement('div');
        header.className = 'repo-group-header';
        header.title = org;
        header.innerHTML = '<i class="fas fa-chevron-down"></i><span>' + org + '</span>';
        header.onclick = () => toggleRepoGroup(org);

        const content = document.createElement('div');
        content.className = 'repo-group-content';

        orgRepos.forEach(repo => {
            const item = document.createElement('div');
            item.className = 'repo-item' + (repo.full_name === activeRepo ? ' active' : '');
            item.setAttribute('data-id', repo.full_name);
            item.setAttribute('data-jules', repo.jules_name || '');

            const alias = localStorage.getItem('hy_repo_alias_' + repo.full_name) || repo.name;
            item.title = alias;

            item.innerHTML = (repo.is_installed ? '<i class="fas fa-check-circle text-success"></i>' : '<i class="fas fa-circle-notch"></i>') +
                             '<span>' + alias + '</span>';

            item.onclick = () => selectRepo(repo.full_name);
            content.appendChild(item);
        });

        groupEl.appendChild(header);
        groupEl.appendChild(content);
        list.appendChild(groupEl);
    });

    const skeletons = list.querySelectorAll('.skeleton');
    skeletons.forEach(s => s.classList.remove('skeleton', 'skeleton--loading'));
}

function toggleRepoGroup(org) {
    const groupEl = document.querySelector('.repo-group[data-org="' + org + '"]');
    if (!groupEl) return;

    const isCollapsed = groupEl.classList.toggle('collapsed');

    const collapsedGroups = JSON.parse(localStorage.getItem('hy_repo_groups_collapsed') || '{}');
    collapsedGroups[org] = isCollapsed;
    localStorage.setItem('hy_repo_groups_collapsed', JSON.stringify(collapsedGroups));
}

async function selectRepo(repoFullName) {
    if (!repoFullName) return;

    const items = document.querySelectorAll('.repo-item');
    items.forEach(i => i.classList.remove('active'));

    const selectedItem = Array.from(items).find(i => i.getAttribute('data-id') === repoFullName);
    const sourceName = selectedItem ? selectedItem.getAttribute('data-jules') : (repoFullName.startsWith('sources/') ? repoFullName : 'sources/github/' + repoFullName);

    if (selectedItem) selectedItem.classList.add('active');

    const oldRepo = localStorage.getItem('hypenosys_active_repo');
    localStorage.setItem('hypenosys_active_repo', repoFullName);
    window.JulesPanelState.activeRepo = sourceName;

    // Auto-expand group
    const org = repoFullName.split('/')[0];
    const groupEl = document.querySelector('.repo-group[data-org="' + org + '"]');
    if (groupEl && groupEl.classList.contains('collapsed')) {
        toggleRepoGroup(org);
    }

    if (oldRepo && oldRepo !== repoFullName) addTel("REPO", "Contexto cambiado → " + repoFullName.split('/').pop(), "info");
    else if (repoFullName) addTel("SYSTEM", "Contexto: " + repoFullName.split('/').pop(), "info");

    const launchBtn = $('launch-btn');
    if (launchBtn) {
        launchBtn.disabled = !sourceName;
        launchBtn.innerText = sourceName ? 'Iniciar Ejecución' : 'Repo No Conectado';
    }

    const sessCtx = $('sess-ctx');
    if (sessCtx) {
        const alias = localStorage.getItem('hy_repo_alias_' + repoFullName) || repoFullName.split('/').pop();
        sessCtx.textContent = alias + ': ' + (window.JulesPanelState.activeBranch || '...');
    }

    if (sourceName) {
        loadBranches(repoFullName);
        updateRepoConfigUI(repoFullName);
    }
}

async function loadBranches(repoFullName) {
    const branchSelect = $('branch-sel') || $('branch-selector');
    const branchMeta = $('branch-meta');
    if (!branchSelect) return;

    try {
        branchSelect.innerHTML = '<option>Cargando...</option>';
        const branches = await window.githubApi.getBranches(repoFullName);
        const repoInfo = await window.githubApi.getRepo(repoFullName);
        const defaultBranch = repoInfo.default_branch;

        branchSelect.innerHTML = branches.map(b => '<option value="' + b.name + '" ' + (b.name === defaultBranch ? 'selected' : '') + '>' + b.name + (b.name === defaultBranch ? ' ★' : '') + '</option>').join('');

        const activeBranch = window.JulesPanelState.activeBranch || defaultBranch;
        branchSelect.value = activeBranch;
        window.JulesPanelState.activeBranch = activeBranch;

        if (branchMeta) {
            branchMeta.innerHTML = '<span class="u-dot"></span><span>' + branches.length + ' ramas cargadas</span>';
            branchMeta.classList.remove('skeleton', 'skeleton--loading', 'skeleton-text');
        }

        branchSelect.onchange = (e) => {
            window.JulesPanelState.activeBranch = e.target.value;
            localStorage.setItem('hypenosys_active_branch', e.target.value);
            const sessCtx = $('sess-ctx');
            if (sessCtx) {
                const alias = localStorage.getItem('hy_repo_alias_' + repoFullName) || repoFullName.split('/').pop();
                sessCtx.textContent = alias + ': ' + e.target.value;
            }
            if (window.checkBranchWarning) window.checkBranchWarning();
        };

        const sessCtx = $('sess-ctx');
        if (sessCtx) {
            const alias = localStorage.getItem('hy_repo_alias_' + repoFullName) || repoFullName.split('/').pop();
            sessCtx.textContent = alias + ': ' + activeBranch;
        }

    } catch (e) {
        console.error('Error loading branches:', e);
        branchSelect.innerHTML = '<option>Error</option>';
    }
}

function updateRepoConfigUI(repoFullName) {
    // Both Config View and optional Modal
    const configView = $('view-config');
    const pathEl = $('cfg-path');
    const aliasIn = $('alias-in');
    const repoLabel = $('repo-label');
    const branchSel = $('branch-sel');

    if (pathEl) {
        pathEl.innerText = 'sources/github/' + repoFullName;
        pathEl.classList.remove('skeleton');
    }

    if (aliasIn) {
        const alias = localStorage.getItem('hy_repo_alias_' + repoFullName) || repoFullName.split('/').pop();
        aliasIn.value = alias;
        aliasIn.classList.remove('skeleton');
        aliasIn.onchange = (e) => {
            const newAlias = e.target.value.trim();
            if (newAlias) {
                localStorage.setItem('hy_repo_alias_' + repoFullName, newAlias);
                showToast("Alias guardado: " + newAlias, "green");
                if (repoLabel) repoLabel.innerText = newAlias;
                const sessCtx = $('sess-ctx');
                if (sessCtx) sessCtx.textContent = newAlias + ': ' + (window.JulesPanelState.activeBranch || '...');
                // Update in sidebar if possible
                const sidebarItem = document.querySelector('.repo-item[data-id="' + repoFullName + '"] span');
                if (sidebarItem) sidebarItem.innerText = newAlias;
            }
        };
    }

    if (repoLabel) {
        repoLabel.innerText = localStorage.getItem('hy_repo_alias_' + repoFullName) || repoFullName.split('/').pop();
        repoLabel.classList.remove('skeleton', 'skeleton-text');
    }

    if (branchSel) {
        branchSel.classList.remove('skeleton');
    }

    renderRepoCommitChart(repoFullName);
}

async function renderRepoCommitChart(repoFullName) {
    const chart = $('repo-chart');
    if (!chart) return;
    const path = chart.querySelector('path');
    if (!path) return;

    try {
        const [owner, repo] = repoFullName.split('/');
        const stats = await window.githubApi.getRepoStats(owner, repo);
        // window.githubApi.getRepoStats might not exist, check or use generic
        const res = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/stats/participation', {
            headers: { 'Authorization': 'Bearer ' + getGitHubToken() }
        });
        const data = await res.json();
        const commits = data.all || [];
        const last10 = commits.slice(-10);

        if (last10.length === 0) return;

        const max = Math.max(...last10, 5);
        const width = 200;
        const height = 56;
        const step = width / (last10.length - 1);

        let d = 'M';
        last10.forEach((v, i) => {
            const x = i * step;
            const y = height - (v / max * height);
            d += (i === 0 ? '' : ' L') + x + ' ' + y;
        });

        path.setAttribute('d', d);
        // Trigger animation
        path.style.strokeDasharray = path.getTotalLength();
        path.style.strokeDashoffset = path.getTotalLength();
        path.getBoundingClientRect();
        path.style.transition = 'stroke-dashoffset 1.5s ease-in-out';
        path.style.strokeDashoffset = '0';

    } catch (e) {
        console.warn("Failed to render commit chart", e);
    }
}

function initSourceDropdown(sources) {
    const list = $('sources-list');
    if (!list) return;

    list.innerHTML = '';
    sources.forEach(s => {
        const item = document.createElement('div');
        const isInstalled = s.name.startsWith('sources/github/');
        item.className = 'custom-dropdown-item' + (!isInstalled ? ' disabled' : '');
        item.onclick = () => {
            if (isInstalled) {
                $('selected-source-name').innerText = s.displayName || s.name.split('/').pop();
                list.parentElement.classList.remove('active');
            }
        };
        item.innerHTML = '<span>' + (s.displayName || s.name.split('/').pop()) + '</span>' + (!isInstalled ? ' <i class="fas fa-lock" style="font-size:10px; float:right; margin-top:3px"></i>' : '');
        list.appendChild(item);
    });
}

// Export functions to global scope
window.initializeRepoSelector = initializeRepoSelector;
window.fetchJulesSources = fetchJulesSources;
window.selectRepo = selectRepo;
