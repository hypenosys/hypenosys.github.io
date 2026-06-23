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
}

async function fetchJulesSources() {
    try {
        const julesSources = await window.julesApi.getSources();
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
            item.title = repo.name;

            item.innerHTML = (repo.is_installed ? '<i class="fas fa-check-circle text-success"></i>' : '<i class="fas fa-circle-notch"></i>') +
                             '<span>' + repo.name + '</span>';

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
    const items = document.querySelectorAll('.repo-item');
    items.forEach(i => i.classList.remove('active'));

    const selectedItem = Array.from(items).find(i => i.getAttribute('data-id') === repoFullName);
    const sourceName = selectedItem ? selectedItem.getAttribute('data-jules') : null;

    if (selectedItem) selectedItem.classList.add('active');

    const oldRepo = localStorage.getItem('hypenosys_active_repo');
    localStorage.setItem('hypenosys_active_repo', repoFullName);

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

    if (sourceName) {
        loadBranches(repoFullName);
        updateRepoConfigUI(repoFullName);
    }
}

async function loadBranches(repoFullName) {
    const branchSelect = $('branch-selector');
    const branchMeta = $('branch-meta');
    if (!branchSelect) return;

    try {
        branchSelect.innerHTML = '<option>Cargando...</option>';
        const branches = await window.githubApi.getBranches(repoFullName);
        const repoInfo = await window.githubApi.getRepo(repoFullName);
        const defaultBranch = repoInfo.default_branch;

        branchSelect.innerHTML = branches.map(b => '<option value="' + b.name + '" ' + (b.name === defaultBranch ? 'selected' : '') + '>' + b.name + (b.name === defaultBranch ? ' ★' : '') + '</option>').join('');

        if (branchMeta) {
            branchMeta.innerHTML = '<span class="u-dot"></span><span>' + branches.length + ' ramas</span>';
            branchMeta.classList.remove('skeleton', 'skeleton--loading');
        }
    } catch (e) {
        console.error('Error loading branches:', e);
        branchSelect.innerHTML = '<option>Error</option>';
    }
}

function updateRepoConfigUI(repoFullName) {
    const configCard = document.querySelector('.card--repo-config');
    if (!configCard) return;

    const title = configCard.querySelector('.card-title');
    if (title) title.innerText = repoFullName;

    const skeletons = configCard.querySelectorAll('.skeleton');
    skeletons.forEach(s => s.classList.remove('skeleton', 'skeleton--loading'));
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
