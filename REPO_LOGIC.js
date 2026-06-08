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
