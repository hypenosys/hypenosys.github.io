/**
 * GitHub Explorer - VSCode style repo browsing
 */

(function() {
    const ghExplorer = {
        init: async () => {
            const panel = document.getElementById('panel-explorer');
            if (!panel) return;

            ghExplorer.renderLayout(panel);
            await ghExplorer.loadRepos();
        },

        renderLayout: (panel) => {
            panel.innerHTML = `
                <div class="explorer-container flex h-full min-h-[400px]">
                    <div class="explorer-sidebar w-1/3 border-r border-slate-800 pr-4 overflow-y-auto">
                        <div id="explorer-tree" class="text-xs">
                            <div class="flex items-center gap-2 py-2 opacity-50"><i class="fas fa-circle-notch fa-spin"></i> Cargando repos...</div>
                        </div>
                    </div>
                    <div id="explorer-content" class="explorer-main w-2/3 pl-4 overflow-y-auto">
                        <div class="flex items-center justify-center h-full text-slate-500 text-sm italic">
                            Selecciona un repo o commit para explorar
                        </div>
                    </div>
                </div>
            `;
        },

        loadRepos: async () => {
            try {
                const repos = await window.githubContext.getRepos();
                const tree = document.getElementById('explorer-tree');

                // Group by project using repo-map.json
                const response = await fetch('/assets/data/repo-map.json');
                const repoMap = await response.json();

                const grouped = {};
                repos.forEach(r => {
                    const project = repoMap[r.name]?.proyecto || 'Otros';
                    if (!grouped[project]) grouped[project] = [];
                    grouped[project].push(r);
                });

                tree.innerHTML = Object.entries(grouped).map(([project, projectRepos]) => `
                    <div class="project-group mb-2">
                        <div class="font-bold text-purple-400 uppercase tracking-widest text-[9px] mb-1">${project}</div>
                        ${projectRepos.map(r => `
                            <div class="repo-item cursor-pointer hover:text-white py-1 flex items-center gap-2" onclick="window.ghExplorer.selectRepo('${r.name}')">
                                <i class="fas fa-folder text-slate-500"></i> ${r.name}
                            </div>
                        `).join('')}
                    </div>
                `).join('');
            } catch (e) {
                console.error('[Explorer] Error loading repos:', e);
            }
        },

        selectRepo: async (repoName) => {
            const main = document.getElementById('explorer-content');
            main.innerHTML = `<div class="flex items-center justify-center h-full"><i class="fas fa-circle-notch fa-spin text-2xl"></i></div>`;

            try {
                const context = await window.githubContext.getRepoContext(repoName);
                const repo = context.repo;

                main.innerHTML = `
                    <div class="repo-view">
                        <h2 class="text-lg font-bold mb-2">${repo.name}</h2>
                        <p class="text-xs text-slate-400 mb-4">${repo.description || 'Sin descripción'}</p>
                        <div class="grid grid-cols-2 gap-4 mb-6">
                            <div class="bg-slate-900/50 p-3 rounded border border-slate-800">
                                <div class="text-[9px] text-slate-500 uppercase font-bold mb-1">Ramas</div>
                                <div class="text-xl font-bold">${context.branches.length}</div>
                            </div>
                            <div class="bg-slate-900/50 p-3 rounded border border-slate-800">
                                <div class="text-[9px] text-slate-500 uppercase font-bold mb-1">PRs Abiertos</div>
                                <div class="text-xl font-bold">${context.prs.length}</div>
                            </div>
                        </div>
                        <h3 class="text-[10px] font-bold text-slate-500 uppercase mb-2">Últimos Commits (${repo.default_branch})</h3>
                        <div id="explorer-commits-list" class="space-y-2">
                            <div class="animate-pulse flex space-y-2 flex-col">
                                <div class="h-8 bg-slate-800 rounded w-full"></div>
                                <div class="h-8 bg-slate-800 rounded w-full"></div>
                            </div>
                        </div>
                    </div>
                `;

                const commits = await window.githubContext.getCommits(repoName, repo.default_branch, 10);
                const list = document.getElementById('explorer-commits-list');
                list.innerHTML = commits.map(c => `
                    <div class="commit-item bg-slate-900/30 hover:bg-slate-800 p-2 rounded border border-slate-800 cursor-pointer transition-all" onclick="window.ghExplorer.viewCommit('${repoName}', '${c.sha}')">
                        <div class="text-xs font-bold truncate">${c.message.split('\n')[0]}</div>
                        <div class="flex justify-between items-center mt-1">
                            <span class="text-[9px] text-slate-500">${c.author} • ${new Date(c.date).toLocaleDateString()}</span>
                            <span class="text-[9px] font-mono text-purple-500">${c.short_sha}</span>
                        </div>
                    </div>
                `).join('');

            } catch (e) {
                main.innerHTML = `<div class="text-red-500 p-4">Error cargando repo: ${e.message}</div>`;
            }
        },

        viewCommit: async (repoName, sha) => {
            const main = document.getElementById('explorer-content');
            const originalHtml = main.innerHTML;
            main.innerHTML = `<div class="flex items-center justify-center h-full"><i class="fas fa-circle-notch fa-spin text-2xl"></i></div>`;

            try {
                const commit = await window.githubContext.getCommit(repoName, sha);
                main.innerHTML = `
                    <div class="commit-view">
                        <button onclick="window.ghExplorer.selectRepo('${repoName}')" class="text-[10px] text-purple-400 hover:underline mb-4">← VOLVER AL REPO</button>
                        <h2 class="text-sm font-bold mb-1">${commit.commit.message.split('\n')[0]}</h2>
                        <div class="text-[10px] text-slate-500 mb-6">${commit.sha}</div>

                        <div class="files-changed space-y-4">
                            ${commit.files.map(file => `
                                <div class="file-diff bg-black rounded border border-slate-800 overflow-hidden">
                                    <div class="bg-slate-900 px-3 py-1.5 text-[10px] font-mono flex justify-between border-b border-slate-800">
                                        <span class="text-slate-300">${file.filename}</span>
                                        <span class="text-slate-500">${file.additions}+ ${file.deletions}-</span>
                                    </div>
                                    <div class="diff-content p-2 overflow-x-auto">
                                        <pre class="text-[10px] leading-tight">${ghExplorer.formatDiff(file.patch)}</pre>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } catch (e) {
                main.innerHTML = `<div class="text-red-500 p-4">Error cargando commit: ${e.message}</div>`;
            }
        },

        formatDiff: (patch) => {
            if (!patch) return '<span class="text-slate-600 italic">Sin cambios en el contenido o archivo binario</span>';
            return patch.split('\n').map(line => {
                let color = 'text-slate-400';
                if (line.startsWith('+') && !line.startsWith('+++')) color = 'text-emerald-500 bg-emerald-500/10';
                if (line.startsWith('-') && !line.startsWith('---')) color = 'text-red-500 bg-red-500/10';
                if (line.startsWith('@@')) color = 'text-purple-400';
                return `<div class="${color}">${window.escapeHtml(line)}</div>`;
            }).join('');
        }
    };

    window.ghExplorer = ghExplorer;
})();
