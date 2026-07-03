/* ════════════════════════════════════════
   JULES PANEL WIKI & CHANGELOG MODULE
   ════════════════════════════════════════ */

window.JulesWikiModule = (function() {
    const STORAGE_PREFIX = 'hy_wiki_';
    const LAST_UPDATE_FILE = 'docs/wiki/.last-update.json';
    const CHANGELOG_FILE = 'CHANGELOG.md';

    // Listener for task completion
    document.addEventListener('hy:task-completed', async (e) => {
        const { taskId, session } = e.detail;
        console.log(`[WikiModule] Task completed detected: ${taskId}`);

        // Anti-duplicate check
        if (await isAlreadyProcessed(taskId)) {
            console.log(`[WikiModule] Task ${taskId} already processed. Skipping.`);
            return;
        }

        await generateProposal(taskId, session);
    });

    async function isAlreadyProcessed(taskId) {
        try {
            // Check local cache first
            const processed = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'processed_tasks') || '[]');
            if (processed.includes(taskId)) return true;

            // Then check remote state (via .last-update.json)
            const res = await window.githubApi.fetchFileWithSha(LAST_UPDATE_FILE);
            if (res.content && res.content.lastSessionId === taskId) return true;

            return false;
        } catch (e) {
            return false;
        }
    }

    function getProposal() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'current_proposal'));
        } catch (e) {
            return null;
        }
    }

    async function generateProposal(taskId, session) {
        console.log(`[WikiModule] Generating proposal for ${taskId}...`);

        // Extraction of info
        const description = session.prompt || session.title;
        let activities = [];
        try {
            activities = await window.julesApi.getActivities(session.name);
        } catch (e) {
            console.warn("[WikiModule] Could not fetch activities for proposal", e);
        }

        // Find the artifact with the diff
        const completionAct = activities.find(a => a.sessionCompleted);
        const artifactAct = activities.find(a => a.artifactGenerated && a.artifactGenerated.artifact && a.artifactGenerated.artifact.changeSet);

        const commitMessage = completionAct ? (completionAct.sessionCompleted.commitMessage || 'No commit message') : 'No commit message';
        const diff = artifactAct ? (artifactAct.artifactGenerated.artifact.changeSet.gitPatch.unidiffPatch || '') : '';
        const filesChanged = extractFilesFromDiff(diff);

        // Store basic metadata
        const proposal = {
            taskId,
            description,
            commitMessage,
            filesChanged,
            diff,
            status: 'processing',
            timestamp: new Date().toISOString()
        };

        localStorage.setItem(STORAGE_PREFIX + 'current_proposal', JSON.stringify(proposal));
        window.dispatchEvent(new CustomEvent('hy:wiki-proposal-ready', { detail: proposal }));

        // Now use NeuralProviderClient to generate the content
        try {
            const aiResponse = await new Promise((resolve, reject) => {
                window.NeuralProviderClient.sendMessage({
                    messages: [
                        {
                            role: 'user',
                            content: `Genera una entrada para CHANGELOG.md y actualizaciones para la wiki basadas en este cambio:

                            Tarea: ${description}
                            Commit: ${commitMessage}
                            Archivos: ${filesChanged.join(', ')}
                            Diff (fragmento):
                            ${diff.substring(0, 3000)}

                            Responde estrictamente en formato JSON con estas claves:
                            {
                              "changelog": "entrada de 2-4 líneas",
                              "wiki_updates": [
                                { "page": "nombre_seccion.md", "action": "update|create", "content": "resumen del cambio o contenido nuevo" }
                              ]
                            }`
                        }
                    ],
                    systemPrompt: "Eres un experto en documentación técnica de Hypenosys. Generas entradas de CHANGELOG concisas y actualizaciones quirúrgicas para la wiki en docs/wiki/.",
                    onDone: (content) => resolve(content),
                    onError: (err) => reject(err)
                });
            });

            // Parse AI response (simple cleaning)
            const cleanJson = aiResponse.replace(/```json|```/g, '').trim();
            const aiData = JSON.parse(cleanJson);

            proposal.aiContent = aiData;
            proposal.status = 'pending';
            localStorage.setItem(STORAGE_PREFIX + 'current_proposal', JSON.stringify(proposal));
            window.dispatchEvent(new CustomEvent('hy:wiki-proposal-ready', { detail: proposal }));

        } catch (err) {
            console.error("[WikiModule] Neural generation failed:", err);
            proposal.status = 'error';
            proposal.error = "Error al generar propuesta neural. " + (err.message || "Verifica el NIM Relay en Ajustes.");
            localStorage.setItem(STORAGE_PREFIX + 'current_proposal', JSON.stringify(proposal));
            window.dispatchEvent(new CustomEvent('hy:wiki-proposal-ready', { detail: proposal }));
        }
    }

    function extractFilesFromDiff(diff) {
        if (!diff) return [];
        const files = new Set();
        const lines = diff.split('\n');
        lines.forEach(line => {
            if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
                const path = line.substring(6).trim();
                if (path && path !== '/dev/null') files.add(path);
            }
        });
        return Array.from(files);
    }

    async function commitChanges() {
        const proposal = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'current_proposal'));
        if (!proposal || !proposal.aiContent) {
            throw new Error("No hay ninguna propuesta válida para confirmar.");
        }

        if (window.showToast) window.showToast("Escribiendo cambios en GitHub...", "amber");

        try {
            // 1. Update CHANGELOG.md (Additive at the top)
            await window.githubApi.atomicWrite(CHANGELOG_FILE, (content) => {
                const date = new Date().toISOString().split('T')[0];
                const entry = `## [${date}] - Tarea #${proposal.taskId}\n\n${proposal.aiContent.changelog}\n\n**Archivos:**\n${proposal.filesChanged.map(f => `- \`${f}\``).join('\n')}\n\n---\n\n`;
                return entry + (content || '');
            }, `docs: update CHANGELOG for task #${proposal.taskId}`);

            // 2. Update Wiki pages
            for (const update of proposal.aiContent.wiki_updates) {
                const wikiPath = `docs/wiki/${update.page}`;
                await window.githubApi.atomicWrite(wikiPath, (content) => {
                    if (update.action === 'create' || !content) {
                        return `# ${update.page.replace('.md', '').toUpperCase()}\n\n${update.content}\n\n---\n*Última actualización: ${new Date().toLocaleString()}*`;
                    } else {
                        // Append to existing content
                        return content + `\n\n### Actualización ${new Date().toLocaleDateString()}\n${update.content}`;
                    }
                }, `docs: update wiki page ${update.page} for task #${proposal.taskId}`);
            }

            // 3. Update .last-update.json
            await window.githubApi.atomicWrite(LAST_UPDATE_FILE, () => ({
                lastSessionId: proposal.taskId,
                updatedAt: new Date().toISOString()
            }), `docs: update wiki metadata for task #${proposal.taskId}`);

            // 4. Mark as processed locally
            const processed = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'processed_tasks') || '[]');
            processed.push(proposal.taskId);
            localStorage.setItem(STORAGE_PREFIX + 'processed_tasks', JSON.stringify(processed));

            localStorage.removeItem(STORAGE_PREFIX + 'current_proposal');
            if (window.showToast) window.showToast("Documentación actualizada con éxito", "green");

            return { success: true };
        } catch (err) {
            console.error("[WikiModule] Commit failed:", err);
            if (window.showToast) window.showToast("Error al guardar cambios: " + err.message, "red");
            throw err;
        }
    }

    function renderProposal(proposal) {
        const container = document.getElementById('wiki-proposal-container');
        const badge = document.getElementById('hdr-wiki-badge');
        if (!container) return;

        if (!proposal) {
            if (badge) badge.classList.add('hidden');
            container.innerHTML = `
                <div class="card glass" style="padding: 40px; text-align: center; color: var(--text3);">
                    <i class="fas fa-file-medical mb-3" style="font-size: 2em; opacity: 0.3;"></i>
                    <p>No hay propuestas de documentación pendientes.</p>
                </div>`;
            return;
        }

        if (badge) {
            badge.classList.remove('hidden');
            badge.textContent = '1';
        }

        if (proposal.status === 'processing') {
            container.innerHTML = `
                <div class="card glass" style="padding: 40px; text-align: center;">
                    <div class="auth-loading-spinner mb-3"></div>
                    <p>Generando propuesta neural para la tarea #${proposal.taskId}...</p>
                    <p style="font-size: 11px; color: var(--text3);">Analizando diff y actualizando índices de la wiki.</p>
                </div>`;
            return;
        }

        if (proposal.status === 'error') {
            container.innerHTML = `
                <div class="card glass" style="padding: 30px; border-color: var(--red);">
                    <div style="color: var(--red); font-weight: 700; margin-bottom: 10px;">⚠️ Error de Generación</div>
                    <p style="font-size: 13px;">${proposal.error}</p>
                    <button class="btn btn-primary btn-sm mt-3" onclick="window.JulesWikiModule.generateProposal('${proposal.taskId}', {name: 'sessions/${proposal.taskId}', prompt: '${proposal.description}'})">Reintentar</button>
                </div>`;
            return;
        }

        const updatesHtml = proposal.aiContent.wiki_updates.map(u => `
            <div style="margin-bottom: 15px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; border-left: 3px solid var(--accent);">
                <div style="font-size: 11px; font-weight: 800; color: var(--accent2); text-transform: uppercase;">Wiki: ${u.page}</div>
                <div style="font-size: 13px; color: var(--text); margin-top: 5px; white-space: pre-wrap;">${u.content}</div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="card glass" style="padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                    <div>
                        <div style="font-size: 10px; font-weight: 800; color: var(--accent2); text-transform: uppercase; letter-spacing: 0.1em;">Propuesta de Documentación</div>
                        <h3 style="font-size: 18px; font-weight: 700; color: var(--text);">Tarea #${proposal.taskId}</h3>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-ghost btn-sm" onclick="localStorage.removeItem('hy_wiki_current_proposal'); window.JulesWikiModule.renderProposal(null);">Descartar</button>
                        <button class="btn btn-primary btn-sm" id="btn-confirm-wiki" onclick="window.confirmWikiChangesUI()">Confirmar y Publicar</button>
                    </div>
                </div>

                <div class="mrow mb-4">
                    <label class="cfg-label">Entrada CHANGELOG.md</label>
                    <div style="padding: 15px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; font-family: var(--font-mono); font-size: 12px; color: var(--green);">
                        ${proposal.aiContent.changelog}
                    </div>
                </div>

                <div class="mrow">
                    <label class="cfg-label">Actualizaciones de Wiki (docs/wiki/)</label>
                    ${updatesHtml}
                </div>
            </div>
        `;
    }

    // Exported UI function
    window.confirmWikiChangesUI = async function() {
        const btn = document.getElementById('btn-confirm-wiki');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Publicando...';
        }
        try {
            await commitChanges();
            renderProposal(null);
        } catch (e) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Confirmar y Publicar';
            }
        }
    }

    // UI Listeners
    window.addEventListener('hy:wiki-proposal-ready', (e) => {
        if (window.JulesPanelState.currentView === 'wiki') {
            renderProposal(e.detail);
        } else {
            const badge = document.getElementById('hdr-wiki-badge');
            if (badge) badge.classList.remove('hidden');
        }
    });

    // Initial check
    setTimeout(() => {
        const current = getProposal();
        if (current) renderProposal(current);
    }, 1000);

    return {
        commitChanges,
        generateProposal,
        getProposal,
        renderProposal
    };
})();
