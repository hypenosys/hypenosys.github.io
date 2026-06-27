/**
 * Módulo de Tareas de Hypenosys
 * Gestiona la creación, edición, archivado y visualización de tareas en el dashboard.
 */

/**
 * Cambia entre las pestañas del modal de tareas.
 * @param {string} tabId ID de la pestaña a activar ('info', 'team', 'extra').
 */
function switchTaskModalTab(tabId) {
    const tabs = ['info', 'team', 'extra'];
    tabs.forEach(t => {
        const content = document.getElementById(`task-tab-content-${t}`);
        const link = document.getElementById(`task-tab-${t}`);
        if (content) content.classList.toggle('hidden', t !== tabId);
        if (link) link.classList.toggle('active', t === tabId);
    });

    if (tabId === 'extra') {
        renderImagePreviews();
    }
}

/**
 * Abre el modal para crear una nueva tarea, inicializando campos por defecto.
 */
function openCreateTaskModal() {
  switchTaskModalTab('info');
  populateMemberSelects();
  populateRepoSelect();

  // Auto-detección de repo/branch activo para facilitar la creación
  let defaultRepo = localStorage.getItem('hypenosys_active_repo') || '';
  let defaultBranch = localStorage.getItem('hypenosys_active_branch') || localStorage.getItem('jules_selected_branch') || '';

  if (!defaultRepo || !defaultBranch) {
      const sessions = JSON.parse(localStorage.getItem('hy_neural_sessions') || '[]');
      if (sessions.length > 0) {
          const s = sessions[0];
          if (!defaultRepo && s.repo) defaultRepo = s.repo;
          if (!defaultBranch && s.branch) defaultBranch = s.branch;
      }
  }

  if (!defaultRepo) {
      const ghConfig = localStorage.getItem('github_repo');
      if (ghConfig) defaultRepo = ghConfig.startsWith('sources/github/') ? ghConfig : `sources/github/${ghConfig}`;
  }

  updateBranchList(defaultRepo);

  document.getElementById('task-modal-title').textContent = 'Crear Nueva Tarea';
  document.getElementById('task-id-input').value = '';
  document.getElementById('task-title-input').value = '';
  document.getElementById('task-desc-input').value = '';
  document.getElementById('task-rama-input').value = defaultBranch;
  document.getElementById('branch-validation-msg').classList.add('hidden');
  document.getElementById('task-type-input').value = 'feature';
  document.getElementById('task-priority-input').value = 'Major';
  document.getElementById('task-milestone-input').value = 'M1';
  document.getElementById('task-topic-input').value = 'Programación / Engine';
  document.getElementById('task-section-input').value = '';
  document.getElementById('task-repo-input').value = defaultRepo;
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
  pendingImages.forEach(img => { if (img.localUrl) URL.revokeObjectURL(img.localUrl); });
  pendingImages = [];
  renderImagePreviews();

  const checkboxes = document.querySelectorAll('#task-asignados-container input[name="asignados"]');
  checkboxes.forEach(cb => cb.checked = false);

  document.getElementById('create-task-modal').classList.remove('hidden');
}

/**
 * Abre el modal de edición cargando los datos de una tarea existente.
 * @param {number|string} taskId ID de la tarea a editar.
 */
function openEditTaskModal(taskId) {
    const task = currentTasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    switchTaskModalTab('info');
    populateMemberSelects();
    populateRepoSelect();
    document.getElementById('task-modal-title').textContent = `Editar Tarea #${taskId}`;
    document.getElementById('task-id-input').value = taskId;
    document.getElementById('task-title-input').value = task.title || '';
    document.getElementById('task-desc-input').value = task.descripcion || '';

    const branch = task.rama || '';
    document.getElementById('task-rama-input').value = branch;
    updateBranchList(task.repository);

    document.getElementById('task-type-input').value = task.task_type || 'feature';
    document.getElementById('task-priority-input').value = task.prioridad || 'Major';
    document.getElementById('task-milestone-input').value = task.milestone || 'M1';
    document.getElementById('task-topic-input').value = task.tema_principal || 'Programación / Engine';
    document.getElementById('task-section-input').value = task.seccion || '';
    document.getElementById('task-repo-input').value = task.repository || '';
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
    pendingImages.forEach(img => { if (img.localUrl) URL.revokeObjectURL(img.localUrl); });
    pendingImages = [];
    renderImagePreviews();

    const checkboxes = document.querySelectorAll('#task-asignados-container input[name="asignados"]');
    checkboxes.forEach(cb => {
        cb.checked = (task.asignados || []).includes(cb.value);
    });

    document.getElementById('create-task-modal').classList.remove('hidden');
}

/**
 * Gestiona la creación o actualización de una tarea al pulsar Guardar.
 * Realiza la subida de imágenes y la escritura atómica en GitHub.
 */
async function handleCreateTask() {
  const taskId = document.getElementById('task-id-input').value;
  const title = document.getElementById('task-title-input').value;
  const desc = document.getElementById('task-desc-input').value;
  const rama = document.getElementById('task-rama-input').value.trim();

  const taskType = document.getElementById('task-type-input').value;
  const priority = document.getElementById('task-priority-input').value;
  const milestone = document.getElementById('task-milestone-input').value;
  const topic = document.getElementById('task-topic-input').value;
  const seccion = document.getElementById('task-section-input').value.trim();
  const repository = document.getElementById('task-repo-input').value || null;
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
    seccion: seccion,
    repository: repository,
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

  try {
    // Fase 1: Subir imágenes pendientes a Tumblr
    await uploadPendingImages();

    document.getElementById('create-task-modal').classList.add('hidden');
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

/**
 * Archiva una tarea y gestiona la limpieza opcional de imágenes legacy.
 * @param {number|string} taskId ID de la tarea a archivar.
 */
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
                img.url = "";
            }
            await window.githubApi.updateTask(taskId, { images: task.images });
        }

        await window.githubApi.archiveTask(taskId);
        showToast(`Tarea #${taskId} enviada al Cementerio`, 'success');
        await refreshDashboardData();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}

/**
 * Restaura una tarea del archivo a la lista de tareas activas.
 * @param {number|string} taskId ID de la tarea a restaurar.
 */
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

/**
 * Procesa archivos de imagen seleccionados por el usuario.
 * @param {FileList} files Archivos de imagen.
 */
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

        const localUrl = URL.createObjectURL(file);
        pendingImages.push({
            localUrl: localUrl,
            file: file,
            uploaded: false
        });
    }
    renderImagePreviews();
}

/**
 * Sube las imágenes pendientes a Tumblr a través del Worker Gatekeeper.
 */
async function uploadPendingImages() {
    if (pendingImages.length === 0) return;

    for (const item of pendingImages) {
        if (item.uploaded) continue;

        showToast(`Subiendo ${item.file.name} a Tumblr...`, 'info');
        try {
            const workerUrl = 'https://hypenosys-gatekeeper-v2.axlffcc.workers.dev/tumblr/upload';
            const fd = new FormData();
            fd.append('image', item.file);
            fd.append('filename', item.file.name);

            const res = await fetch(workerUrl, { method: 'POST', body: fd });
            const data = await res.json();

            if (data.success) {
                const imgObj = {
                    url: data.url,
                    type: "url",
                    tumblr_post_id: data.tumblr_post_id,
                    filename: item.file.name,
                    uploaded_at: new Date().toISOString()
                };
                currentTaskImages.push(imgObj);
                item.uploaded = true;
                if (item.localUrl) URL.revokeObjectURL(item.localUrl);
                showToast(`Imagen subida: ${item.file.name}`, 'success');
            } else {
                throw new Error(data.error || 'Error desconocido en el Worker');
            }
        } catch (err) {
            console.error('[TUMBLR] Upload failed:', err);
            showToast(`Error al subir ${item.file.name}: ${err.message}`, 'error');
            throw err;
        }
    }
    pendingImages = pendingImages.filter(img => !img.uploaded);
}

/**
 * Renderiza las miniaturas de imágenes (actuales y pendientes) en el modal.
 */
function renderImagePreviews() {
    const container = document.getElementById('task-image-grid');
    if (!container) return;
    container.innerHTML = '';

    currentTaskImages.forEach((img, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'image-thumb group relative';
        const isLegacy = img.type === 'binary_legacy';

        thumb.innerHTML = `
            <img src="${img.url}" class="w-full h-full object-cover" alt="">
            <div class="image-thumb-actions">
                <button type="button" data-action="preview" class="text-emerald-400 hover:scale-125 transition-transform p-1">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button type="button" data-action="remove" class="text-red-400 hover:scale-125 transition-transform p-1">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            ${isLegacy ? '<span class="absolute top-1 left-1 bg-amber-500 text-slate-950 text-[7px] font-black px-1 rounded">⚠️</span>' : ''}
        `;

        thumb.querySelector('[data-action="preview"]').onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            document.activeElement?.blur();
            window.openLightbox('current', idx);
        };

        thumb.querySelector('[data-action="remove"]').onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            removeTaskImage(idx);
        };

        container.appendChild(thumb);
    });

    pendingImages.forEach((img, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'image-thumb group relative';

        thumb.innerHTML = `
            <img src="${img.localUrl}" class="w-full h-full object-cover opacity-60" alt="">
            <div class="image-thumb-actions">
                <button type="button" data-action="preview" class="text-emerald-400 hover:scale-125 transition-transform p-1">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button type="button" data-action="remove" class="text-red-400 hover:scale-125 transition-transform p-1">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <span class="absolute bottom-1 left-1 bg-[#f59e0b] text-white text-[10px] px-1.5 rounded font-bold shadow-sm">Pending</span>
        `;

        thumb.querySelector('[data-action="preview"]').onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            document.activeElement?.blur();
            window.openLightbox('current', currentTaskImages.length + idx);
        };

        thumb.querySelector('[data-action="remove"]').onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            removePendingImage(idx);
        };

        container.appendChild(thumb);
    });

    const addBtn = document.createElement('div');
    addBtn.className = 'image-add-btn';
    addBtn.onclick = () => document.getElementById('task-image-input').click();

    if (currentTaskImages.length === 0) {
        addBtn.innerHTML = `
            <i class="fa-solid fa-plus text-xl mb-1"></i>
            <span class="text-[10px] font-bold">Añadir imagen</span>
        `;
    } else {
        addBtn.innerHTML = `<i class="fa-solid fa-plus text-xl"></i>`;
    }

    container.appendChild(addBtn);
}

/**
 * Elimina una imagen existente de la tarea.
 */
function removeTaskImage(index) {
    currentTaskImages.splice(index, 1);
    renderImagePreviews();
}

/**
 * Elimina una imagen pendiente de subir.
 */
function removePendingImage(index) {
    const img = pendingImages[index];
    if (img && img.localUrl) URL.revokeObjectURL(img.localUrl);
    pendingImages.splice(index, 1);
    renderImagePreviews();
}

/**
 * Abre el Lightbox global para previsualizar imágenes.
 * @param {string|number} srcOrTaskId URL de la imagen o ID de la tarea.
 * @param {number} [imageIndex] Índice de la imagen dentro de la tarea.
 */
window.openLightbox = function(srcOrTaskId, imageIndex) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    if (!modal || !img) {
        console.error('[LIGHTBOX] Modal or Image element not found');
        return;
    }

    modal._lastOpenTime = Date.now();
    lightboxTask = null;
    lightboxImages = [];
    lightboxIndex = 0;

    if (imageIndex === undefined) {
        img.src = srcOrTaskId;
    } else {
        if (srcOrTaskId === 'current') {
            const pendingAsImg = pendingImages.map(p => ({ url: p.localUrl, filename: p.file.name }));
            lightboxImages = currentTaskImages.concat(pendingAsImg);
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
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

/**
 * Actualiza los controles de navegación del Lightbox.
 */
window.updateLightboxUI = function() {
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

/**
 * Navega entre las imágenes del Lightbox.
 * @param {number} direction Dirección del movimiento (-1 o 1).
 */
window.navigateLightbox = function(direction) {
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

/**
 * Cierra el Lightbox y limpia el estado.
 */
window.closeLightbox = function() {
    document.activeElement?.blur();
    const modal = document.getElementById('lightbox-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
        const img = document.getElementById('lightbox-img');
        if (img) img.src = "";
    }
    document.activeElement?.blur();
}

/**
 * Calcula las diferencias entre dos objetos de tarea para generar el registro de cambios.
 * @param {Object} oldTask Tarea original.
 * @param {Object} newTask Nueva tarea.
 * @returns {Array<Object>} Lista de cambios detectados.
 */
function diffTasks(oldTask, newTask) {
    const fields = ['title', 'descripcion', 'estado', 'prioridad', 'milestone', 'asignados', 'blocks', 'blocked_by', 'due_date', 'task_type', 'tags', 'completitud', 'repository', 'seccion'];
    const changes = [];
    const timestamp = new Date().toISOString();
    const author = window.currentUser || 'Unknown';

    fields.forEach(field => {
        let oldVal = oldTask ? oldTask[field] : null;
        let newVal = newTask[field];

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

/**
 * Resuelve los títulos de las tareas referenciadas por ID en campos de bloqueo.
 * @param {string} type Tipo de referencia ('blocks' o 'blocked_by').
 */
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

/**
 * Renderiza el historial de cambios de una tarea.
 * @param {Array<Object>} log Lista de entradas del log de cambios.
 */
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

/**
 * Alterna la visibilidad del registro de cambios.
 */
function toggleChangeLog() {
    const container = document.getElementById('task-changelog-container');
    const chevron = document.getElementById('task-changelog-chevron');
    container.classList.toggle('hidden');
    chevron.classList.toggle('fa-chevron-down');
    chevron.classList.toggle('fa-chevron-up');
}

/**
 * Punto de entrada para la previsualización de imágenes con gestión de eventos.
 */
function openImagePreview(taskId, idx, event) {
    if (event) {
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        if (typeof event.preventDefault === 'function') event.preventDefault();
    }
    document.activeElement?.blur();
    window.openLightbox(taskId, idx);
}

/**
 * Actualiza el estado del selector de ramas basado en el repositorio seleccionado.
 * @param {string} repoValue Valor del repositorio seleccionado.
 */
async function updateBranchList(repoValue) {
    const btn = document.getElementById('btn-list-branches');
    if (!btn) return;

    if (!repoValue) {
        btn.disabled = true;
        btn.title = "Selecciona primero un repositorio";
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        btn.disabled = false;
        btn.title = "Seleccionar rama";
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    const input = document.getElementById('task-rama-input');
    if (input && input.value) {
        validateBranch();
    }
}

/**
 * Muestra el desplegable de ramas del repositorio actual.
 */
async function showBranchDropdown() {
    const repoSelect = document.getElementById('task-repo-input');
    const dropdown = document.getElementById('branch-dropdown');
    const repoValue = repoSelect ? repoSelect.value : null;

    const path = window.parseSourceName(repoValue);
    if (!path) return;

    dropdown.innerHTML = '<div class="p-3 text-xs text-slate-500 italic">Cargando ramas...</div>';
    dropdown.classList.remove('hidden');

    try {
        const branches = await window.githubContext.getBranches(path.repo, path.owner);

        if (branches && branches.length > 0) {
            dropdown.innerHTML = '';
            branches.forEach(b => {
                const item = document.createElement('div');
                item.className = 'p-2 hover:bg-slate-800 cursor-pointer text-xs text-slate-300 border-b border-slate-800 last:border-0';
                item.innerHTML = `<i class="fa-solid fa-code-branch mr-2 text-indigo-400 opacity-70"></i>${b.name}`;
                item.addEventListener('click', () => selectBranch(b.name));
                dropdown.appendChild(item);
            });
        } else {
            dropdown.innerHTML = '<div class="p-3 text-xs text-amber-500">No se encontraron ramas.</div>';
        }
    } catch (e) {
        console.warn("[Branches] Error fetching branches:", e);
        dropdown.innerHTML = '<div class="p-3 text-xs text-red-500">No se pudieron cargar las ramas. Puedes introducirla manualmente.</div>';
    }
}

/**
 * Selecciona una rama del desplegable y la valida.
 */
function selectBranch(name) {
    const input = document.getElementById('task-rama-input');
    if (input) {
        input.value = name;
        validateBranch();
    }
    hideBranchDropdown();
}

/**
 * Oculta el desplegable de ramas.
 */
function hideBranchDropdown() {
    const dropdown = document.getElementById('branch-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
}

// Cerrar desplegable al hacer clic fuera
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('branch-dropdown');
    const btn = document.getElementById('btn-list-branches');
    if (dropdown && !dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        hideBranchDropdown();
    }
});

let branchValidationTimeout = null;

/**
 * Valida que la rama introducida exista realmente en el repositorio de GitHub.
 */
function validateBranch() {
    if (branchValidationTimeout) clearTimeout(branchValidationTimeout);

    branchValidationTimeout = setTimeout(async () => {
        const input = document.getElementById('task-rama-input');
        const repoSelect = document.getElementById('task-repo-input');
        const msg = document.getElementById('branch-validation-msg');

        if (!input || !repoSelect || !msg) return;

        const branchName = input.value.trim();
        const repoValue = repoSelect.value;

        if (!branchName || !repoValue) {
            msg.classList.add('hidden');
            return;
        }

        const path = window.parseSourceName(repoValue);
        if (!path) {
            msg.classList.add('hidden');
            return;
        }

        try {
            const branches = await window.githubContext.getBranches(path.repo, path.owner);
            const exists = branches.some(b => b.name === branchName);

            if (!exists) {
                msg.innerHTML = `⚠️ La rama \`${branchName}\` no existe en el repositorio \`${path.repo}\`. Verifica el nombre o créala en GitHub.`;
                msg.classList.remove('hidden');
            } else {
                msg.classList.add('hidden');
            }
        } catch (e) {
            console.warn("[Validation] Error validating branch:", e);
            msg.innerHTML = `⚠️ No se pudo validar la rama. GitHub API error o rate limit.`;
            msg.classList.remove('hidden');
        }
    }, 500);
}

// Adjuntar oyentes de eventos para la validación
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('task-rama-input');
    if (input) {
        input.addEventListener('input', validateBranch);
        input.addEventListener('blur', validateBranch);
    }
});
