    async function refreshActivities(sessionId) {
        const container = $('dr-term');
        const diffContainer = $('diff-content');
        if (!container) return;

        try {
            const data = await window.julesApi.getActivities(sessionId, 50);
            const activities = data.activities || [];

            // Terminal Logs
            container.innerHTML = activities.map(a => {
                let cls = 'tline ', txt = a.description || '';
                if (a.progressUpdated) { cls += 'agent'; txt = a.progressUpdated.title; }
                else if (a.planGenerated) { cls += 'sys'; txt = '📋 Plan generado (' + (a.planGenerated.plan?.steps?.length || 0) + ' pasos)'; }
                else if (a.planApproved) { cls += 'git'; txt = '✅ Plan aprobado'; }
                else if (a.userMessaged) { cls += 'sys'; txt = '👤 Mensaje de usuario'; }
                else if (a.agentMessaged) { cls += 'agent'; txt = '🤖 Respuesta de Jules'; }
                else if (a.sessionCompleted) { cls += 'git'; txt = '🏁 Sesión completada'; }
                else if (a.sessionFailed) { cls += 'err'; txt = `❌ ERROR: ${a.sessionFailed.reason}`; }
                return `<div class="${cls}">${escapeHtml(txt)}</div>`;
            }).join('') || '<div class="tline sys">Sin logs</div>';
            container.scrollTop = container.scrollHeight;

            // Diff Viewer (finding the last artifact with a patch)
            let lastPatch = null;
            let filesCount = 0;
            activities.forEach(a => {
                (a.artifacts || []).forEach(art => {
                    if (art.changeSet?.gitPatch?.unidiffPatch) {
                        lastPatch = art.changeSet.gitPatch.unidiffPatch;
                        filesCount++;
                    }
                });
            });

            if (lastPatch && diffContainer) {
                diffContainer.innerHTML = renderRealDiff(lastPatch);
                $('diff-stat-files').textContent = `${filesCount} parches detectados`;
            } else if (diffContainer) {
                diffContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text3);">No hay cambios de código detectados en esta sesión.</div>';
            }

        } catch (e) { container.innerHTML = `<div class="tline err">Error: ${e.message}</div>`; }
    }

    function renderRealDiff(patch) {
        const lines = patch.split('\n');
        return `<div class="diff-body" style="border-top:1px solid var(--border)">` +
            lines.map(line => {
                let cls = 'ctx', sign = ' ';
                if (line.startsWith('+') && !line.startsWith('+++')) { cls = 'add'; sign = '+'; }
                else if (line.startsWith('-') && !line.startsWith('---')) { cls = 'del'; sign = '-'; }
                else if (line.startsWith('@@')) { cls = 'hunk'; sign = ' '; }

                return `<div class="diff-line ${cls}">
                    <div class="diff-sign">${sign}</div>
                    <div class="diff-code">${escapeHtml(line)}</div>
                </div>`;
            }).join('') + `</div>`;
    }

    function switchDrawerTab(tab, el) {
        document.querySelectorAll('.dr-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.dr-panel').forEach(p => p.classList.remove('active'));
        el.classList.add('active');
        $(`dr-panel-${tab}`).classList.add('active');
    }
