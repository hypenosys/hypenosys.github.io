/* ════════════════════════════════════════
   NEURAL CHAT ACTIVITY FEED
   ════════════════════════════════════════ */

window.switchChatView = function(view) {
    const chatView = document.getElementById('chat-messages');
    const activityView = document.getElementById('activity-feed');
    const chatTab = document.getElementById('tab-chat');
    const activityTab = document.getElementById('tab-activity');

    if (view === 'chat') {
        chatView.classList.remove('hidden');
        activityView.classList.add('hidden');
        chatTab.classList.add('border-[#bd93f9]', 'text-[#bd93f9]');
        chatTab.classList.remove('border-transparent', 'text-[#6272a4]');
        activityTab.classList.remove('border-[#bd93f9]', 'text-[#bd93f9]');
        activityTab.classList.add('border-transparent', 'text-[#6272a4]');
    } else {
        chatView.classList.add('hidden');
        activityView.classList.remove('hidden');
        activityTab.classList.add('border-[#bd93f9]', 'text-[#bd93f9]');
        activityTab.classList.remove('border-transparent', 'text-[#6272a4]');
        chatTab.classList.remove('border-[#bd93f9]', 'text-[#bd93f9]');
        chatTab.classList.add('border-transparent', 'text-[#6272a4]');

        // [FIX 2C] Restaurar actividades desde localStorage al activar pestaña
        const linkedSid = localStorage.getItem('hy_neural_session_id_' + window.currentSessionId) || localStorage.getItem('hy_neural_session_id');
        if (linkedSid) {
            const idSafe = linkedSid.split('/').pop();
            const saved = localStorage.getItem(`hy_activity_feed_${idSafe}`);
            if (saved && window._updateActivityFeed) {
                window._updateActivityFeed(JSON.parse(saved), true); // true para evitar re-guardado
            }
        }
    }
};

window._updateActivityFeed = function(activities, skipSave = false) {
    const container = document.getElementById('activity-log-container');
    const emptyState = document.getElementById('activity-empty-state');

    if (!activities || activities.length === 0) {
        emptyState.classList.remove('hidden');
        container.innerHTML = '';
        return;
    }

    // [FIX 2C] Persistir actividades bajo clave de sesión Jules
    if (!skipSave) {
        const linkedSid = localStorage.getItem('hy_neural_session_id_' + window.currentSessionId) || localStorage.getItem('hy_neural_session_id');
        if (linkedSid) {
            const idSafe = linkedSid.split('/').pop();
            localStorage.setItem(`hy_activity_feed_${idSafe}`, JSON.stringify(activities));
        }
    }

    emptyState.classList.add('hidden');

    // Deduplicate and sort activities
    const uniqueActivities = activities
        .filter((a, i, arr) => arr.findIndex(x => x.id === a.id) === i)
        .sort((a, b) => new Date(a.createTime) - new Date(b.createTime));

    container.innerHTML = uniqueActivities.map(act => {
        const time = new Date(act.createTime).toLocaleTimeString();
        let type = 'INFO';
        let color = 'text-[#bd93f9]';
        let icon = 'fa-info-circle';
        let content = act.description || '';
        let extra = '';

        if (act.planGenerated) {
            type = 'PLAN';
            icon = 'fa-clipboard-list';
            color = 'text-orange-400';
            const steps = act.planGenerated.plan?.steps || [];
            extra = `<div class="mt-2 pl-4 border-l border-orange-400/30 space-y-1">
                ${steps.map(s => `
                    <div class="text-[10px] text-orange-200/70">
                        <span class="font-bold">${(s.index || 0) + 1}.</span> ${s.title}
                        ${s.description ? `<div class="text-[9px] opacity-60 ml-4">${s.description}</div>` : ''}
                    </div>`).join('')}
            </div>`;
        } else if (act.planApproved) {
            type = 'AUTH';
            icon = 'fa-check-double';
            color = 'text-[#50fa7b]';
            content = 'Plan aprobado por el usuario';
        } else if (act.progressUpdated) {
            type = 'STEP';
            icon = 'fa-cog fa-spin';
            color = 'text-[#8be9fd]';
            content = act.progressUpdated.title;
            if (act.progressUpdated.description) {
                extra += `<div class="mt-1 text-[10px] text-[#6272a4] italic">${act.progressUpdated.description}</div>`;
            }
        } else if (act.agentMessaged) {
            type = 'JULES';
            icon = 'fa-robot';
            color = 'text-[#50fa7b]';
            content = act.agentMessaged.agentMessage;
        } else if (act.userMessaged) {
            type = 'USER';
            icon = 'fa-user';
            color = 'text-[#f8f8f2]';
            content = act.userMessaged.userMessage;
        } else if (act.sessionCompleted) {
            type = 'DONE';
            icon = 'fa-flag-checkered';
            color = 'text-[#50fa7b]';
            content = 'Sesión completada exitosamente';
            if (act.sessionCompleted.commitMessage) {
                extra += `<div class="mt-2 p-2 bg-green-500/5 border border-green-500/20 rounded text-[10px] text-green-200/70 font-mono">
                    <div class="uppercase text-[8px] font-black opacity-50 mb-1">Commit Message</div>
                    ${act.sessionCompleted.commitMessage}
                </div>`;
            }
        } else if (act.sessionFailed) {
            type = 'FAIL';
            icon = 'fa-exclamation-triangle';
            color = 'text-[#ff5555]';
            content = 'Error: ' + (act.sessionFailed.reason || 'Desconocido');
        }

        // Check for artifacts (Bash & Diff)
        if (act.artifacts) {
            act.artifacts.forEach(art => {
                if (art.bashOutput) {
                    extra += `
                    <div class="mt-2 bg-black/40 rounded border border-[#44475a] overflow-hidden">
                        <div class="bg-[#1e1f29] px-2 py-1 text-[8px] font-mono text-[#6272a4] border-b border-[#44475a] flex justify-between">
                            <span>BASH COMMAND</span>
                            <span>EXIT: ${art.bashOutput.exitCode}</span>
                        </div>
                        <div class="p-2 text-[9px] font-mono text-[#50fa7b] whitespace-pre-wrap">$ ${escapeHtml(art.bashOutput.command)}</div>
                        ${art.bashOutput.output ? `<div class="p-2 text-[9px] font-mono text-white/50 border-t border-[#44475a]/30 whitespace-pre-wrap max-h-40 overflow-y-auto">${escapeHtml(art.bashOutput.output)}</div>` : ''}
                    </div>`;
                }
                if (art.changeSet?.gitPatch?.unidiffPatch) {
                    const patch = art.changeSet.gitPatch.unidiffPatch;
                    const lines = patch.split('\n');
                    const diffHtml = lines.map(line => {
                        let cls = 'text-[#f8f8f2]';
                        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-[#50fa7b] bg-[#50fa7b]/10';
                        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-[#ff5555] bg-[#ff5555]/10';
                        else if (line.startsWith('@@')) cls = 'text-[#8be9fd] bg-[#8be9fd]/10';
                        return `<div class="px-2 ${cls}">${escapeHtml(line)}</div>`;
                    }).join('');

                    extra += `
                    <details class="mt-2 bg-black/40 rounded border border-[#44475a] overflow-hidden group">
                        <summary class="bg-[#1e1f29] px-2 py-1 text-[8px] font-bold text-[#bd93f9] border-b border-[#44475a] cursor-pointer hover:bg-[#44475a]/20 transition-all uppercase tracking-widest flex justify-between items-center">
                            <span><i class="fas fa-file-code mr-1"></i> Ver cambios en código</span>
                            <i class="fas fa-chevron-down text-[7px] group-open:rotate-180 transition-transform"></i>
                        </summary>
                        <div class="p-0 text-[9px] font-mono whitespace-pre overflow-x-auto max-h-60 overflow-y-auto">
                            ${diffHtml}
                        </div>
                    </details>`;
                }
            });
        }

        return `
        <div class="activity-item bg-[#1e1f29]/50 border border-[#44475a]/30 rounded-lg p-3 hover:border-[#bd93f9]/30 transition-all">
            <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                    <i class="fas ${icon} ${color} text-[10px]"></i>
                    <span class="text-[9px] font-black tracking-widest ${color}">${type}</span>
                </div>
                <span class="text-[9px] font-mono text-[#6272a4]">${time}</span>
            </div>
            <div class="text-xs text-white/80 leading-relaxed">${marked.parse(content)}</div>
            ${extra}
        </div>
        `;
    }).join('');

    // Auto-scroll to bottom if near bottom
    const threshold = 100;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    if (isAtBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
};
