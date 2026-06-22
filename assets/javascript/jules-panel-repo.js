/* ════════════════════════════════════════
   JULES PANEL REPO & BRANCH MANAGEMENT
   ════════════════════════════════════════ */

window.initializeRepoSelector = async function() {
    const launchBtn = $('launch-btn');
    if (launchBtn) {
        launchBtn.disabled = true;
        launchBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Cargando fuentes...';
    }
    try {
        const [githubRepos, julesSourcesRes] = await Promise.allSettled([
            window.githubContext.getRepos(),
            window.julesApi.getSources()
        ]);

        const repos = githubRepos.status === 'fulfilled' ? githubRepos.value : [];
        const julesSources = julesSourcesRes.status === 'fulfilled' ? julesSourcesRes.value : [];

        const combinedSources = repos.map(r => {
            const sourceName = `sources/github/${r.full_name}`;
            const julesSource = julesSources.find(s => s.name === sourceName || s.name === `sources/github-${r.owner}-${r.name}`);
            return {
                name: julesSource ? julesSource.name : sourceName,
                githubRepo: { owner: r.owner, repo: r.name },
                displayName: r.name,
                isJulesInstalled: !!julesSource,
                isGitHub: true
            };
        });

        // Añadir fuentes de Jules que no estén en la lista de GitHub (si las hay)
        julesSources.forEach(js => {
            if (!combinedSources.some(cs => cs.name === js.name)) {
                combinedSources.push({
                    name: js.name,
                    displayName: js.name.split('/').pop(),
                    isJulesInstalled: true,
                    isGitHub: false
                });
            }
        });

        window.julesSourcesCache = combinedSources;
        renderRepos(combinedSources);
        populateContextSelector(combinedSources, julesSourcesRes.status === 'rejected');

        if (launchBtn) {
            launchBtn.disabled = false;
            launchBtn.innerHTML = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Iniciar Ejecución';
        }
    } catch (e) {
        console.error('[Jules] Repo init failed:', e);
        if (launchBtn) {
            launchBtn.disabled = false;
            launchBtn.innerHTML = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Iniciar Ejecución';
        }
    }
}

window.renderRepos = function(sources) {
    const list = $('repo-list'); if (!list) return;
    list.innerHTML = '';
    const current = window.JulesPanelState.activeRepo;
    sources.forEach(s => {
        const el = document.createElement('div');
        const isInstalled = s.isJulesInstalled;
        el.className = `repo-item ${s.name === current ? 'selected' : ''} ${!isInstalled ? 'repo-disabled' : ''}`;
        if (!isInstalled) {
            el.title = "Jules App no instalada en este repositorio";
            el.style.opacity = '0.5';
            el.style.cursor = 'not-allowed';
        }
        el.innerHTML = `<span class="repo-dot"></span><span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${s.displayName || s.name.split('/').pop()}</span>${!isInstalled ? '<i class="fas fa-lock" style="font-size:10px; opacity:0.5"></i>' : ''}`;
        if (isInstalled) {
            el.onclick = () => switchRepo(s.name, s);
        }
        list.appendChild(el);
    });
}

window.switchRepo = function(sourceName, sourceObj) {
    const oldRepo = window.JulesPanelState.activeRepo;
    window.JulesPanelState.activeRepo = sourceName;
    localStorage.setItem('hypenosys_active_repo', sourceName);
    renderRepos(window.julesSourcesCache || []);
    onRepoSelected(sourceName, sourceObj);
    if (oldRepo && oldRepo !== sourceName) addTel("REPO", `Contexto cambiado → ${sourceName.split('/').pop()}`, "info");
    else addTel("SYSTEM", `Contexto: ${sourceName.split('/').pop()}`, "info");
}

window.onRepoSelected = async function(sourceName, sourceObject) {
    const branchSelect = $('branch-sel'), branchMeta = $('branch-meta'), cfgPath = $('cfg-path'), aliasIn = $('alias-in'), sessCtx = $('sess-ctx');
    if (!sourceName) return;
    const parsed = window.parseSourceName(sourceName);
    const repoName = parsed ? parsed.repo : sourceName, repoOwner = parsed ? parsed.owner : null;
    if(cfgPath) cfgPath.textContent = sourceName;
    const displayLabel = sourceObject?.displayName || repoName;
    if(aliasIn) aliasIn.value = window.getRepoAlias(sourceName) || displayLabel;
    if(sessCtx) sessCtx.textContent = `${displayLabel}: cargando...`;
    branchSelect.disabled = true;
    branchSelect.innerHTML = '<option value="">Cargando ramas...</option>';
    branchSelect.onchange = (e) => {
        window.JulesPanelState.activeBranch = e.target.value;
        window.JulesPanelState._branchManuallyChanged = true;
        localStorage.setItem('jules_selected_branch', e.target.value);
        const sessCtx = $('sess-ctx');
        if(sessCtx) {
            const repoLabel = $('repo-label').textContent;
            sessCtx.textContent = `${repoLabel}: ${e.target.value}`;
        }
        checkBranchWarning();
    };
    try {
        const branches = await window.githubContext.getBranches(repoName, repoOwner || undefined);
        const repoData = (await window.githubContext.getRepos()).find(r => r.name === repoName && (repoOwner ? r.owner === repoOwner : true));
        const defaultBranch = repoData ? repoData.default_branch : 'main';
        branchSelect.innerHTML = branches.map(b => `<option value="${b.name}" ${b.name === defaultBranch ? 'selected' : ''}>${b.name}${b.name === defaultBranch ? ' ★' : ''}</option>`).join('');
        const lastSelected = localStorage.getItem('jules_selected_branch');
        if (lastSelected && branches.some(b => b.name === lastSelected)) branchSelect.value = lastSelected;
        if(branchMeta) branchMeta.innerHTML = `<span class="u-dot"></span><span>${branches.length} ramas</span>`;
        const activeBranch = branchSelect.value;
        if(sessCtx) sessCtx.textContent = `${displayLabel}: ${activeBranch}`;
        window.JulesPanelState.activeBranch = activeBranch;
        checkBranchWarning();
    } catch (e) { branchSelect.innerHTML = '<option value="main">main</option>'; }
    finally { branchSelect.disabled = false; }
}

window.populateContextSelector = async function(sources, apiFailed = false) {
    const menu = $('repo-menu'), container = $('repo-items-container'), trigger = $('repo-trigger'), label = $('repo-label'), searchInput = $('repo-search');
    function renderItems(filter = '') {
        container.innerHTML = '';
        const filtered = sources.filter(s => (s.displayName || s.name).toLowerCase().includes(filter.toLowerCase()));
        filtered.forEach(s => {
            const item = document.createElement('div');
            const isInstalled = s.isJulesInstalled || apiFailed;
            item.className = `custom-dropdown-item ${!isInstalled ? 'disabled' : ''}`;
            if (!isInstalled) {
                item.style.opacity = '0.5';
                item.style.cursor = 'not-allowed';
                item.title = "Jules App no instalada";
            }
            item.innerHTML = `<span>${s.displayName || s.name.split('/').pop()}</span> ${!isInstalled ? '<i class="fas fa-lock" style="font-size:10px; float:right; margin-top:3px"></i>' : ''}`;
            if (isInstalled) {
                item.onclick = (e) => { e.stopPropagation(); label.textContent = s.displayName || s.name.split('/').pop(); switchRepo(s.name, s); menu.style.display = 'none'; };
            }
            container.appendChild(item);
        });

        // Input manual como fallback (Requirement 2B)
        const manualDiv = document.createElement('div');
        manualDiv.style.padding = '8px';
        manualDiv.style.borderTop = '1px solid var(--border)';
        manualDiv.innerHTML = `
            <div style="font-size:9px; color:var(--text3); text-transform:uppercase; margin-bottom:5px">Entrada Manual</div>
            <div style="display:flex; gap:5px">
                <input type="text" id="manual-repo-in" class="cfg-input" style="font-size:11px; height:28px" placeholder="sources/github/owner/repo">
                <button id="manual-repo-btn" class="btn btn-primary btn-sm" style="height:28px; padding:0 8px"><i class="fas fa-plus"></i></button>
            </div>
        `;
        container.appendChild(manualDiv);
        const mIn = manualDiv.querySelector('#manual-repo-in');
        const mBtn = manualDiv.querySelector('#manual-repo-btn');
        mBtn.onclick = (e) => {
            e.stopPropagation();
            const val = mIn.value.trim();
            if (val) {
                switchRepo(val, { name: val, isJulesInstalled: true });
                label.textContent = val.split('/').pop();
                menu.style.display = 'none';
            }
        };
        mIn.onclick = (e) => e.stopPropagation();
    }
    if(trigger) trigger.onclick = (e) => { e.stopPropagation(); menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; };
    if(searchInput) searchInput.oninput = (e) => renderItems(e.target.value);

    // Initialize label if we have an active repo
    if (window.JulesPanelState.activeRepo && label) {
        const active = sources.find(s => s.name === window.JulesPanelState.activeRepo);
        if (active) label.textContent = active.displayName || active.name.split('/').pop();
    }

    renderItems();
}
