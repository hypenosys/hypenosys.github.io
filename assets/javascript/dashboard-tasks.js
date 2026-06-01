/* HYPENOSYS — TASKS MODULE */

function openCreateTaskModal() {
  populateMemberSelects();
  document.getElementById('task-modal-title').textContent = 'Crear Nueva Tarea';
  document.getElementById('task-id-input').value = '';
  document.getElementById('task-title-input').value = '';
  document.getElementById('task-desc-input').value = '';
  document.getElementById('task-rama-input').value = 'PRO';
  document.getElementById('task-type-input').value = 'feature';
  document.getElementById('task-priority-input').value = 'Major';
  document.getElementById('task-milestone-input').value = 'M1';
  document.getElementById('task-topic-input').value = 'Programación / Engine';
  document.getElementById('task-status-input').value = 'Pending';
  document.getElementById('task-completion-input').value = '0';
  document.getElementById('task-resolver-input').value = '';
  document.getElementById('task-detector-input').value = activeFilter || '';
  document.getElementById('task-email-responsable-input').value = '';
  document.getElementById('task-emails-asignados-input').value = '';

  document.getElementById('task-start-date-input').value = '';
  document.getElementById('task-due-date-input').value = '';
  document.getElementById('task-est-hours-input').value = '';
  document.getElementById('task-points-input').value = '';
  document.getElementById('task-acceptance-input').value = '';
  document.getElementById('task-acceptance-preview').classList.add('hidden');
  document.getElementById('task-blocks-input').value = '';
  document.getElementById('task-blocked-by-input').value = '';
  document.getElementById('task-new-comment-input').value = '';
  document.getElementById('task-changelog-container').classList.add('hidden');
  document.getElementById('task-changelog-chevron').className = 'fa-solid fa-chevron-down';

  modalTags = [];
  modalLinks = [];
  modalSubtasks = [];
  modalComments = [];
  renderModalArrays();

  currentTaskImages = [];
  renderImagePreviews();
  const imageSection = document.getElementById('task-image-section');
  if (imageSection) imageSection.classList.add('hidden');
  const chevron = document.getElementById('task-image-chevron');
  if (chevron) chevron.className = 'fa-solid fa-chevron-down';

  const checkboxes = document.querySelectorAll('#task-asignados-container input[name="asignados"]');
  checkboxes.forEach(cb => cb.checked = false);

  document.getElementById('create-task-modal').classList.remove('hidden');
}

function openEditTaskModal(taskId) {
    const task = currentTasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    populateMemberSelects();
    document.getElementById('task-modal-title').textContent = `Editar Tarea #${taskId}`;
    document.getElementById('task-id-input').value = taskId;
    document.getElementById('task-title-input').value = task.title || '';
    document.getElementById('task-desc-input').value = task.descripcion || '';
    document.getElementById('task-rama-input').value = task.rama || 'PRO';
    document.getElementById('task-type-input').value = task.task_type || 'feature';
    document.getElementById('task-priority-input').value = task.prioridad || 'Major';
    document.getElementById('task-milestone-input').value = task.milestone || 'M1';
    document.getElementById('task-topic-input').value = task.tema_principal || 'Programación / Engine';
    let status = task.estado || 'Pending';
    if (status === '?') status = 'In Review';
    document.getElementById('task-status-input').value = status;
    document.getElementById('task-completion-input').value = task.completitud || '0';
    document.getElementById('task-resolver-input').value = task.resuelto_por || '';
    document.getElementById('task-detector-input').value = task.detectado_por || '';
    document.getElementById('task-email-responsable-input').value = task.email_responsable || '';
    document.getElementById('task-emails-asignados-input').value = (task.emails_asignados || []).join(', ');

    document.getElementById('task-start-date-input').value = task.start_date || '';
    document.getElementById('task-due-date-input').value = task.due_date || '';
    document.getElementById('task-est-hours-input').value = task.estimated_hours || '';
    document.getElementById('task-points-input').value = task.story_points || '';
    document.getElementById('task-acceptance-input').value = task.acceptance_criteria || '';

    const preview = document.getElementById('task-acceptance-preview');
    if (task.acceptance_criteria) {
        preview.classList.remove('hidden');
        preview.innerHTML = marked.parse(task.acceptance_criteria);
    } else {
        preview.classList.add('hidden');
    }

    document.getElementById('task-blocks-input').value = (task.blocks || []).join(', ');
    document.getElementById('task-blocked-by-input').value = (task.blocked_by || []).join(', ');
    resolveTaskTitles('blocks');
    resolveTaskTitles('blocked_by');
    document.getElementById('task-new-comment-input').value = '';

    document.getElementById('task-changelog-container').classList.add('hidden');
    document.getElementById('task-changelog-chevron').className = 'fa-solid fa-chevron-down';
    renderChangeLog(task.change_log || []);

    modalTags = JSON.parse(JSON.stringify(task.tags || []));
    modalLinks = JSON.parse(JSON.stringify(task.external_links || []));
    modalSubtasks = JSON.parse(JSON.stringify(task.subtasks || []));
    modalComments = JSON.parse(JSON.stringify(task.comments || []));
    renderModalArrays();

    currentTaskImages = JSON.parse(JSON.stringify(task.images || []));
    renderImagePreviews();
    const imageSection = document.getElementById('task-image-section');
    if (imageSection) imageSection.classList.add('hidden');
    const chevron = document.getElementById('task-image-chevron');
    if (chevron) chevron.className = 'fa-solid fa-chevron-down';

    const checkboxes = document.querySelectorAll('#task-asignados-container input[name="asignados"]');
    checkboxes.forEach(cb => {
        cb.checked = (task.asignados || []).includes(cb.value);
    });

    document.getElementById('create-task-modal').classList.remove('hidden');
}

async function handleCreateTask() {
  const taskId = document.getElementById('task-id-input').value;
  const title = document.getElementById('task-title-input').value;
  const desc = document.getElementById('task-desc-input').value;
  const rama = document.getElementById('task-rama-input').value;
  const taskType = document.getElementById('task-type-input').value;
  const priority = document.getElementById('task-priority-input').value;
  const milestone = document.getElementById('task-milestone-input').value;
  const topic = document.getElementById('task-topic-input').value;
  const status = document.getElementById('task-status-input').value;
  const completion = parseFloat(document.getElementById('task-completion-input').value) || 0;
  const resolver = document.getElementById('task-resolver-input').value || null;
  const detector = document.getElementById('task-detector-input').value || 'Unassigned';
  const asignados = Array.from(document.querySelectorAll('#task-asignados-container input[name="asignados"]:checked')).map(cb => cb.value);
  const emailResponsable = document.getElementById('task-email-responsable-input').value || null;
  const emailsAsignados = (document.getElementById('task-emails-asignados-input').value || '').split(',').map(e => e.trim()).filter(e => e);

  const startDate = document.getElementById('task-start-date-input').value || null;
  const dueDate = document.getElementById('task-due-date-input').value || null;
  const estHours = parseFloat(document.getElementById('task-est-hours-input').value) || null;
  const points = parseInt(document.getElementById('task-points-input').value) || null;
  const acceptance = document.getElementById('task-acceptance-input').value || "";
  const blocks = document.getElementById('task-blocks-input').value.split(',').map(s => s.trim()).filter(s => s);
  const blockedBy = document.getElementById('task-blocked-by-input').value.split(',').map(s => s.trim()).filter(s => s);

  if (!title && !desc) return showToast('El título o la descripción son obligatorios', 'warning');

  const taskData = {
    title,
    descripcion: desc,
    rama,
    task_type: taskType,
    tema_principal: topic,
    prioridad: priority,
    milestone,
    estado: status,
    completitud: completion,
    resuelto_por: resolver,
    detectado_por: detector,
    asignados: asignados,
    email_responsable: emailResponsable,
    emails_asignados: emailsAsignados,
    start_date: startDate,
    due_date: dueDate,
    estimated_hours: estHours,
    story_points: points,
    tags: modalTags,
    external_links: modalLinks,
    subtasks: modalSubtasks,
    acceptance_criteria: acceptance,
    blocks: blocks,
    blocked_by: blockedBy,
    comments: modalComments,
    images: currentTaskImages
  };

  showToast(UI_STRINGS.saving, 'info');
  document.getElementById('create-task-modal').classList.add('hidden');

  try {
    if (taskId) {
        const oldTask = currentTasks.find(t => String(t.id) === String(taskId));
        const changes = diffTasks(oldTask, taskData);
        if (changes.length > 0) {
            taskData.change_log = (oldTask.change_log || []).concat(changes);
        }
        await window.githubApi.updateTask(taskId, taskData);
        showToast(`Tarea #${taskId} actualizada`, 'success');
    } else {
        const newTask = {
            ...taskData,
            rama2: null,
            ver: true,
            fecha: new Date().toISOString().split('T')[0],
            apoyo: null,
            limite: null,
            comentario: '',
            change_log: [{
                author_login: window.currentUser || 'Unknown',
                timestamp: new Date().toISOString(),
                field: 'id',
                old_value: null,
                new_value: 'Created'
            }]
        };
        await window.githubApi.createTask(newTask);
        showToast('Tarea creada correctamente', 'success');
    }
    await refreshDashboardData();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function handleArchiveTask(taskId) {
    const task = currentTasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    if (!confirm(`¿Estás seguro de que quieres enviar la tarea #${taskId} al Cementerio?`)) return;

    const legacyImages = (task.images || []).filter(img => img.type === 'binary_legacy');
    let deleteLegacy = false;

    if (legacyImages.length > 0) {
        deleteLegacy = confirm(`Esta tarea tiene ${legacyImages.length} imágenes antiguas (legacy). ¿Deseas eliminarlas definitivamente para ahorrar espacio en el repositorio?`);
    }

    showToast(UI_STRINGS.saving, 'info');

    try {
        if (deleteLegacy) {
            for (const img of legacyImages) {
                // If it's a relative path, try to delete it from GitHub
                if (img.url && !img.url.startsWith('data:') && !img.url.startsWith('http')) {
                    try {
                        const fileData = await window.githubApi.getFile(img.url);
                        if (fileData && fileData.sha) {
                            await window.githubApi.deleteFile(img.url, fileData.sha, `chore: eliminar imagen legacy ${img.filename} al archivar tarea #${taskId}`);
                        }
                    } catch (e) {
                        console.warn(`[ARCHIVE] Failed to delete file ${img.url}:`, e);
                    }
                }
                // Clear the URL to "delete" Base64 or relative path from JSON
                img.url = "";
            }
            // Update the task with cleared images before archiving
            await window.githubApi.updateTask(taskId, { images: task.images });
        }

        await window.githubApi.archiveTask(taskId);
        showToast(`Tarea #${taskId} enviada al Cementerio`, 'success');
        await refreshDashboardData();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}

async function handleRestoreTask(taskId) {
    showToast(UI_STRINGS.saving, 'info');
    try {
        await window.githubApi.restoreTask(taskId);
        showToast(`Tarea #${taskId} resucitada del Cementerio`, 'success');
        await refreshDashboardData();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}

async function handleImageFiles(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            showToast(`Archivo no válido: ${file.name}. Solo se aceptan PNG, JPG, GIF y WEBP.`, 'warning');
            continue;
        }

        if (file.size > 10 * 1024 * 1024) {
            showToast(`Imagen demasiado grande: ${file.name}. Máximo 10MB.`, 'warning');
            continue;
        }

        showToast(`Subiendo ${file.name} a Tumblr...`, 'info');

        try {
            const workerUrl = 'https://hypenosys-gatekeeper-v2.axlffcc.workers.dev/tumblr/upload';
            const fd = new FormData();
            fd.append('image', file);
            fd.append('filename', file.name);

            const res = await fetch(workerUrl, { method: 'POST', body: fd });
            const data = await res.json();

            if (data.success) {
                const imgObj = {
                    url: data.url,
                    type: "url",
                    tumblr_post_id: data.tumblr_post_id,
                    filename: file.name,
                    uploaded_at: new Date().toISOString()
                };
                currentTaskImages.push(imgObj);
                renderImagePreviews();
                showToast(`Imagen subida: ${file.name}`, 'success');
            } else {
                throw new Error(data.error || 'Error desconocido en el Worker');
            }
        } catch (err) {
            console.error('[TUMBLR] Upload failed:', err);
            showToast(`Error al subir imagen: ${err.message}. Intenta pegar la URL manualmente.`, 'error');
        }
    }
}

function handleAddImageUrl() {
    const input = document.getElementById('task-image-url-input');
    const url = input.value.trim();

    if (!url) return;
    if (!url.startsWith('https://')) {
        showToast('La URL debe empezar por https://', 'warning');
        return;
    }

    let filename = 'URL Imagen';
    try {
        const urlObj = new URL(url);
        filename = urlObj.hostname;
    } catch(e) {}

    const imgObj = {
        url: url,
        type: "url",
        tumblr_post_id: null,
        filename: filename,
        uploaded_at: new Date().toISOString()
    };

    currentTaskImages.push(imgObj);
    renderImagePreviews();
    input.value = '';
    showToast('URL añadida', 'success');
}

function renderImagePreviews() {
    const container = document.getElementById('task-image-previews');
    if (!container) return;
    container.innerHTML = '';

    currentTaskImages.forEach((img, idx) => {
        const id = img.tumblr_post_id || idx;
        const div = document.createElement('div');
        div.className = 'relative group aspect-square rounded-lg overflow-hidden border border-slate-700 bg-slate-950';

        const isLegacy = img.type === 'binary_legacy';

        div.innerHTML = `
            <img src="${img.url}" class="w-full h-full object-cover" alt="">
            <div class="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button type="button" data-action="preview-image" class="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white select-none touch-manipulation">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button type="button" data-action="remove-image" class="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:scale-110 transition-transform">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            ${isLegacy ? '<span class="absolute top-1 left-1 bg-amber-500 text-slate-950 text-[7px] font-black px-1 rounded">⚠️ LEGACY</span>' : ''}
            <div class="name-label absolute bottom-0 left-0 right-0 p-1 bg-slate-950/80 text-[8px] text-slate-300 truncate pointer-events-none">
            </div>
        `;

        const previewBtn = div.querySelector('[data-action="preview-image"]');
        previewBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openLightbox('current', idx);
        });

        const removeBtn = div.querySelector('[data-action="remove-image"]');
        removeBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            removeTaskImage(idx);
        });

        div.querySelector('.name-label').textContent = img.filename || 'Imagen';
        container.appendChild(div);
    });
}

function removeTaskImage(index) {
    currentTaskImages.splice(index, 1);
    renderImagePreviews();
}

function openLightbox(srcOrTaskId, imageIndex) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    if (!modal || !img) return;

    // Set guard to prevent immediate closure on touch bubbling
    modal._justOpened = true;
    setTimeout(() => { modal._justOpened = false; }, 300);

    // Reset state
    lightboxTask = null;
    lightboxImages = [];
    lightboxIndex = 0;

    if (imageIndex === undefined) {
        // Fallback or direct src
        img.src = srcOrTaskId;
    } else {
        if (srcOrTaskId === 'current') {
            lightboxImages = currentTaskImages;
            lightboxIndex = imageIndex;
        } else {
            const task = currentTasks.find(t => sameTaskId(t.id, srcOrTaskId));
            if (task) {
                lightboxTask = task;
                lightboxImages = task.images || [];
                lightboxIndex = imageIndex;
            }
        }

        if (lightboxImages[lightboxIndex]) {
            img.src = lightboxImages[lightboxIndex].url;
        }
    }

    updateLightboxUI();
    modal.classList.remove('hidden');
}

function updateLightboxUI() {
    const prevBtn = document.getElementById('lightbox-prev');
    const nextBtn = document.getElementById('lightbox-next');
    const counter = document.getElementById('lightbox-counter');

    if (lightboxImages.length > 1) {
        if (prevBtn) prevBtn.classList.remove('hidden');
        if (nextBtn) nextBtn.classList.remove('hidden');
        if (counter) {
            counter.classList.remove('hidden');
            counter.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
        }
    } else {
        if (prevBtn) prevBtn.classList.add('hidden');
        if (nextBtn) nextBtn.classList.add('hidden');
        if (counter) counter.classList.add('hidden');
    }
}

function navigateLightbox(direction) {
    if (lightboxImages.length <= 1) return;

    lightboxIndex += direction;
    if (lightboxIndex >= lightboxImages.length) lightboxIndex = 0;
    if (lightboxIndex < 0) lightboxIndex = lightboxImages.length - 1;

    const img = document.getElementById('lightbox-img');
    if (img && lightboxImages[lightboxIndex]) {
        img.src = lightboxImages[lightboxIndex].url;
        updateLightboxUI();
    }
}

function closeLightbox() {
    document.activeElement?.blur();
    const modal = document.getElementById('lightbox-modal');
    if (modal) {
        modal.classList.add('hidden');
        // Clear src to avoid flicker on next open
        const img = document.getElementById('lightbox-img');
        if (img) img.src = "";
    }
    // Phase 2 instruction: Call blur explicitly after close
    document.activeElement?.blur();
}

function toggleTaskImageSection() {
    const section = document.getElementById('task-image-section');
    const chevron = document.getElementById('task-image-chevron');
    if (section && chevron) {
        section.classList.toggle('hidden');
        chevron.classList.toggle('fa-chevron-up');
        chevron.classList.toggle('fa-chevron-down');
    }
}

function diffTasks(oldTask, newTask) {
    const fields = ['title', 'descripcion', 'estado', 'prioridad', 'milestone', 'asignados', 'blocks', 'blocked_by', 'due_date', 'task_type', 'tags', 'completitud'];
    const changes = [];
    const timestamp = new Date().toISOString();
    const author = window.currentUser || 'Unknown';

    fields.forEach(field => {
        let oldVal = oldTask ? oldTask[field] : null;
        let newVal = newTask[field];

        // Normalizar arrays para comparación
        if (Array.isArray(oldVal) || Array.isArray(newVal)) {
            const sOld = JSON.stringify((oldVal || []).sort());
            const sNew = JSON.stringify((newVal || []).sort());
            if (sOld !== sNew) {
                changes.push({
                    author_login: author,
                    timestamp,
                    field,
                    old_value: sOld,
                    new_value: sNew
                });
            }
        } else if (oldVal != newVal) {
            changes.push({
                author_login: author,
                timestamp,
                field,
                old_value: oldVal,
                new_value: newVal
            });
        }
    });

    return changes;
}

function resolveTaskTitles(type) {
    const inputId = type === 'blocks' ? 'task-blocks-input' : 'task-blocked-by-input';
    const containerId = type === 'blocks' ? 'task-blocks-resolved' : 'task-blocked-by-resolved';
    const input = document.getElementById(inputId);
    const container = document.getElementById(containerId);
    if (!input || !container) return;

    const ids = input.value.split(',').map(s => s.trim()).filter(s => s);
    container.innerHTML = ids.map(id => {
        const task = currentTasks.find(t => String(t.id) === String(id));
        if (task) {
            return `<div class="text-[9px] text-slate-500 italic truncate">#${id}: ${task.title || task.descripcion}</div>`;
        } else {
            return `<div class="text-[9px] text-red-500/70 italic">#${id}: No encontrada</div>`;
        }
    }).join('');
}

function renderChangeLog(log) {
    const container = document.getElementById('task-changelog-container');
    if (!container) return;

    if (log.length === 0) {
        container.innerHTML = '<div class="text-[10px] text-slate-600 italic">Sin cambios registrados.</div>';
        return;
    }

    container.innerHTML = log.slice().reverse().map(entry => `
        <div class="p-2 border-l-2 border-slate-800 pl-3">
            <div class="flex justify-between text-[8px] font-mono mb-1">
                <span class="text-indigo-500">${entry.author_login}</span>
                <span class="text-slate-600">${new Date(entry.timestamp).toLocaleString()}</span>
            </div>
            <div class="text-[9px] text-slate-400">
                <span class="font-bold text-slate-500 uppercase">${entry.field}:</span>
                <span class="text-red-900/70 line-through">${entry.old_value || 'null'}</span>
                →
                <span class="text-emerald-500/70">${entry.new_value || 'null'}</span>
            </div>
        </div>
    `).join('');
}

function toggleChangeLog() {
    const container = document.getElementById('task-changelog-container');
    const chevron = document.getElementById('task-changelog-chevron');
    container.classList.toggle('hidden');
    chevron.classList.toggle('fa-chevron-down');
    chevron.classList.toggle('fa-chevron-up');
}

/**
 * Entry point for image preview with event handling
 */
function openImagePreview(taskId, idx, event) {
    if (event) {
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        if (typeof event.preventDefault === 'function') event.preventDefault();
    }
    openLightbox(taskId, idx);
}
