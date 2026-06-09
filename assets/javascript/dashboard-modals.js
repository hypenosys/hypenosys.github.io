/* HYPENOSYS — MODALS MODULE */

function renderModalArrays() {
    // Tags
    const tagsContainer = document.getElementById('task-tags-container');
    if (tagsContainer) {
        tagsContainer.innerHTML = modalTags.map((tag, idx) => `
            <span class="flex items-center gap-1 px-2 py-1 bg-slate-900 border border-[#50fa7b]/30 text-[#50fa7b] rounded-full text-[10px] font-bold">
                ${tag}
                <button type="button" onclick="removeTag(${idx})" class="hover:text-white transition-colors">×</button>
            </span>
        `).join('');
    }

    // Links
    const linksContainer = document.getElementById('task-links-container');
    if (linksContainer) {
        linksContainer.innerHTML = modalLinks.map((link, idx) => `
            <div class="flex items-center justify-between p-2 bg-slate-900 border border-slate-800 rounded-lg group">
                <a href="${link.url}" target="_blank" class="text-[10px] text-emerald-400 font-bold hover:underline truncate flex-grow">
                    <i class="fa-solid fa-link mr-1"></i> ${link.label}
                </a>
                <button type="button" onclick="removeExternalLink(${idx})" class="action-btn action-btn--secondary text-slate-600 hover:text-red-400" title="Eliminar enlace">
                    <i class="fa-solid fa-trash text-[10px]"></i>
                </button>
            </div>
        `).join('');
    }

    // Subtasks (Quest 6)
    const subtasksContainer = document.getElementById('task-subtasks-container');
    if (subtasksContainer) {
        subtasksContainer.innerHTML = modalSubtasks.map((sub, idx) => `
            <div class="flex items-center gap-3 p-2 bg-slate-900 border border-slate-800 rounded-lg group" data-subtask-item data-subtask-text="${sub.text}" data-subtask-id="${sub.id || idx}">
                <input type="checkbox" ${sub.done ? 'checked' : ''} onclick="toggleSubtask(${idx})" class="w-4 h-4 rounded border-slate-700 text-emerald-500 bg-slate-950 focus:ring-emerald-500">
                <span class="text-xs ${sub.done ? 'text-slate-600 line-through' : 'text-slate-300'} flex-grow">${sub.text}</span>
                <div style="display:flex; gap:4px;">
                    <button type="button" data-subtask-github class="subtask-action-btn" title="Buscar en GitHub">
                        <i class="fa-brands fa-github"></i>
                    </button>
                    <button type="button" data-subtask-delete class="subtask-action-btn" title="Eliminar subtarea">
                        <i class="fa-solid fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Comments
    const commentsList = document.getElementById('task-comments-list');
    if (commentsList) {
        commentsList.innerHTML = modalComments.map((com, idx) => {
            const c = com;
            const autor = c.author || c.author_login || c.autor || c.user || 'Equipo';
            const fecha = c.date || c.timestamp || c.fecha || c.created_at;
            const texto = c.text || c.body || c.contenido || c.comment || String(c);
            const fechaStr = fecha ? new Date(fecha).toLocaleDateString('es-ES') : '';

            return `
                <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl relative group">
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] font-bold text-indigo-400">${autor}</span>
                            <span class="text-[8px] text-slate-600 font-mono">${fechaStr}</span>
                        </div>
                        <button type="button" onclick="removeComment(${idx})" class="action-btn action-btn--secondary text-slate-800 hover:text-red-400" title="Eliminar comentario">
                            <i class="fa-solid fa-trash text-[10px]"></i>
                        </button>
                    </div>
                    <p class="text-xs text-slate-300 whitespace-pre-wrap">${texto}</p>
                </div>
            `;
        }).join('');
    }
}

function handleAddTag() {
    const input = document.getElementById('task-tags-input');
    const val = input.value.trim();
    if (val && !modalTags.includes(val)) {
        modalTags.push(val);
        input.value = '';
        renderModalArrays();
    }
}

function removeTag(idx) {
    modalTags.splice(idx, 1);
    renderModalArrays();
}

function handleAddExternalLink() {
    const urlInput = document.getElementById('task-link-url-input');
    const labelInput = document.getElementById('task-link-label-input');
    const url = urlInput.value.trim();
    let label = labelInput.value.trim();

    if (!url) return;
    if (!url.startsWith('http')) {
        showToast('La URL debe empezar por http:// o https://', 'warning');
        return;
    }

    if (!label) {
        try {
            label = new URL(url).hostname;
        } catch (e) {
            label = url;
        }
    }

    modalLinks.push({ url, label });
    urlInput.value = '';
    labelInput.value = '';
    renderModalArrays();
}

function removeExternalLink(idx) {
    modalLinks.splice(idx, 1);
    renderModalArrays();
}

function handleAddSubtask() {
    const input = document.getElementById('task-subtask-input');
    const val = input.value.trim();
    if (val) {
        modalSubtasks.push({ id: Date.now(), text: val, done: false });
        input.value = '';
        renderModalArrays();
    }
}

function toggleSubtask(idx) {
    modalSubtasks[idx].done = !modalSubtasks[idx].done;
    renderModalArrays();
}

function removeSubtask(idx) {
    modalSubtasks.splice(idx, 1);
    renderModalArrays();
}

// Quest 6: Event Delegation for Subtask Buttons
document.addEventListener('click', function(e) {
    const ghBtn = e.target.closest('[data-subtask-github]');
    if (ghBtn) {
        const item = ghBtn.closest('[data-subtask-item]');
        const text = item.dataset.subtaskText;
        const repoSelect = document.getElementById('task-repo-input');
        const repoFull = repoSelect ? repoSelect.value : '';
        const repoName = repoFull.split('/')[1] || '';

        window.open(
            `https://github.com/hypenosys/${repoName}/issues?q=${encodeURIComponent(text)}`,
            '_blank', 'noopener,noreferrer'
        );
        return;
    }

    const delBtn = e.target.closest('[data-subtask-delete]');
    if (delBtn) {
        if (delBtn.dataset.confirmPending === 'true') {
            clearTimeout(parseInt(delBtn.dataset.confirmTimer, 10));
            const item = delBtn.closest('[data-subtask-item]');
            // Finding index again because the array might have shifted
            const subId = item.dataset.subtaskId;
            const idx = modalSubtasks.findIndex(s => String(s.id || '') === String(subId));
            if (idx !== -1) {
                removeSubtask(idx);
            } else {
                // fallback to original index strategy if no ID
                const allItems = Array.from(document.querySelectorAll('#task-subtasks-container [data-subtask-item]'));
                const elementIdx = allItems.indexOf(item);
                removeSubtask(elementIdx);
            }
        } else {
            delBtn.dataset.confirmPending = 'true';
            delBtn.dataset.originalHtml = delBtn.innerHTML;
            delBtn.textContent = '¿Seguro?';
            delBtn.style.color = '#ff5555';
            delBtn.style.borderColor = '#ff5555';
            delBtn.classList.add('blink-border');

            const timer = setTimeout(() => {
                delBtn.dataset.confirmPending = 'false';
                delBtn.innerHTML = delBtn.dataset.originalHtml;
                delBtn.style.color = '';
                delBtn.style.borderColor = '';
                delBtn.classList.remove('blink-border');
            }, 2000);
            delBtn.dataset.confirmTimer = timer;
        }
    }
});

function handleAddComment() {
    const input = document.getElementById('task-new-comment-input');
    const val = input.value.trim();
    if (val) {
        modalComments.push({
            author_login: window.currentUser || 'Unknown',
            timestamp: new Date().toISOString(),
            body: val
        });
        input.value = '';
        renderModalArrays();
    }
}

function removeComment(idx) {
    modalComments.splice(idx, 1);
    renderModalArrays();
}

function openAssignmentModal(taskId) {
    const task = currentTasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    const list = document.getElementById('assignment-list');
    list.innerHTML = '';

    Object.entries(MEMBER_MAPPING).forEach(([handle, name]) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-emerald-500/50 transition-all';
        const isChecked = (task.asignados || []).includes(handle);

        item.innerHTML = `
            <div class="flex items-center gap-3">
                <img src="https://github.com/${handle}.png" class="w-8 h-8 rounded-full border border-slate-800">
                <span class="text-sm font-bold text-slate-200">${name}</span>
            </div>
            <input type="checkbox" value="${handle}" ${isChecked ? 'checked' : ''} class="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900">
        `;
        list.appendChild(item);
    });

    const modal = document.getElementById('assignment-modal');
    modal.classList.remove('hidden');

    document.getElementById('assignment-save-btn').onclick = async () => {
        const selected = Array.from(list.querySelectorAll('input:checked')).map(cb => cb.value);
        showToast(UI_STRINGS.saving, 'info');
        modal.classList.add('hidden');
        try {
            await window.githubApi.updateTask(taskId, { asignados: selected });
            showToast(`Asignados actualizados para #${taskId}`, 'success');
            await refreshDashboardData();
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        }
    };
}

function populateRepoSelect() {
    const repoSelect = document.getElementById('task-repo-input');
    if (!repoSelect) return;

    // Use cached repos
    const repos = window.userReposCache || [];

    let html = '<option value="">-- Sin asignar --</option>';

    repos.forEach(repo => {
        const fullName = repo.full_name; // owner/repo
        const shortName = repo.name;

        // Use getRepoDisplayName to get alias if exists, otherwise fallback to shortName
        const displayName = window.getRepoDisplayName ? window.getRepoDisplayName(fullName, shortName) : shortName;

        html += `<option value="${fullName}">${displayName}</option>`;
    });

    repoSelect.innerHTML = html;

    // Bug 2: Ensure branch listener is attached once
    if (!repoSelect._branchListenerAttached) {
        repoSelect.addEventListener('change', (e) => {
            if (typeof updateBranchList === 'function') {
                updateBranchList(e.target.value);
            }
        });
        repoSelect._branchListenerAttached = true;
    }
}

function populateMemberSelects() {
    const resolverSelect = document.getElementById('task-resolver-input');
    const detectorSelect = document.getElementById('task-detector-input');
    const asignadosContainer = document.getElementById('task-asignados-container');
    if (!resolverSelect || !detectorSelect || !asignadosContainer) return;

    const options = `<option value="">-- Unassigned --</option>` +
        MEMBERS.map(m => `<option value="${m}">${m}</option>`).join('');

    resolverSelect.innerHTML = options;
    detectorSelect.innerHTML = options;

    asignadosContainer.innerHTML = '';
    Object.entries(MEMBER_MAPPING).forEach(([handle, name]) => {
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 bg-slate-900 px-2 py-1 rounded border border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors';
        label.innerHTML = `
            <input type="checkbox" name="asignados" value="${handle}" class="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500">
            <span class="text-[10px] font-bold">${name}</span>
        `;
        asignadosContainer.appendChild(label);
    });
}
