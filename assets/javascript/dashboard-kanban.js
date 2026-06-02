/* HYPENOSYS — KANBAN MODULE */

function renderKanbanBoard() {
  const tasks = getFilteredTasks(currentTasks.filter(t => t.estado !== 'Obsolete'));

  // Update Global Toggle Icon
  const globalToggle = document.getElementById('global-kanban-toggle');
  if (globalToggle) {
    const anyExpanded = tasks.some(t => !isTaskMinimized(t.id));
    const icon = globalToggle.querySelector('i');
    if (icon) {
      icon.className = anyExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
    }
  }

  for (const col of KANBAN_COLUMNS) {
    const colEl = document.getElementById(`kanban-col-${col.id}`);
    if (!colEl) continue;
    const cardsEl = colEl.querySelector('.kanban-cards');
    const countEl = colEl.querySelector('.col-count');

    const colTasks = tasks.filter(t => getTaskColumn(t) === col.id);
    countEl.textContent = colTasks.length;
    cardsEl.innerHTML = '';

    for (const task of colTasks) {
      const card = buildTaskCard(task);
      cardsEl.appendChild(card);
    }

    cardsEl.ondragover = (e) => { e.preventDefault(); colEl.classList.add('drag-over'); };
    cardsEl.ondragleave = () => colEl.classList.remove('drag-over');
    cardsEl.ondrop = async (e) => {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      await handleCardDrop(taskId, col.id);
    };
  }
}

function getTaskColumn(task) {
  const estado = task.estado === '?' ? 'In Review' : task.estado;
  if (['Pending','ToDo'].includes(estado) || estado === null) return 'backlog';
  if (['Working','KO'].includes(estado)) return 'working';
  if (estado === 'Fixed' || estado === 'In Review') return 'qa';
  if (['OK','Closed'].includes(estado)) return 'done';
  return 'backlog';
}

function buildTaskCard(task) {
  const isMinimized = isTaskMinimized(task.id);
  const hasImages = task.images && task.images.length > 0;
  const isImagesExpanded = localStorage.getItem(`task_images_expanded_${task.id}`) === 'true';
  const card = document.createElement('div');
  card.className = `bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-500 transition-all group relative ${isMinimized ? 'py-2' : ''}`;
  card.draggable = true;
  card.addEventListener('dragstart', e => {
    if (e.target.closest('[data-no-drag="true"]')) {
        e.preventDefault();
        return;
    }
    if (e.target.closest('button, select, input, textarea')) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    e.dataTransfer.setData('text/plain', String(task.id));
    card.classList.add('opacity-50');
});
  card.addEventListener('dragend', () => card.classList.remove('opacity-50'));

  const priorityColors = {
    Critical: 'bg-red-500 text-slate-950 font-black',
    Major:    'bg-orange-500 text-slate-950 font-black',
    Medium:   'bg-yellow-500 text-slate-950 font-black',
    Minor:    'bg-slate-700 text-slate-300',
    Cosmetic: 'bg-slate-800 text-slate-400',
    ToDo:     'bg-indigo-500 text-white font-bold',
    Obsolete: 'bg-slate-950 text-slate-500 line-through'
  };

  const priorityColorsMinimized = {
    Critical: 'bg-red-500 text-slate-950',
    Major:    'bg-orange-500 text-slate-950',
    Medium:   'bg-yellow-500 text-slate-950',
    Minor:    'bg-slate-700 text-slate-300',
    Cosmetic: 'bg-slate-800 text-slate-400',
    ToDo:     'bg-indigo-500 text-white',
    Obsolete: 'bg-slate-950 text-slate-500 line-through'
  };

  const estado = task.estado === '?' ? 'In Review' : (task.estado || 'Pending');
  const stateInfo = STATE_CONFIG[estado] || { color: 'bg-slate-700', label: estado };

  const canArchive = ['OK', 'Closed', 'Obsolete'].includes(estado);

  if (isMinimized) {
    card.innerHTML = `
      <div class="flex justify-between items-center gap-2">
        <div class="flex items-center gap-2 overflow-hidden">
          <span class="text-[9px] font-mono text-slate-500 flex-shrink-0">#${task.id}</span>
          <button onclick="event.stopPropagation(); openEditTaskModal('${task.id}')" class="text-[10px] text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
            <i class="fa-solid fa-pencil"></i>
          </button>
          <p class="text-xs text-slate-200 truncate font-semibold">${task.title || task.descripcion}</p>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          ${canArchive ? `
            <button onclick="event.stopPropagation(); handleArchiveTask('${task.id}')" class="text-slate-500 hover:text-emerald-400 mr-1 transition-colors" title="Archivar">
                <i class="fa-solid fa-box-archive text-[10px]"></i>
            </button>
          ` : ''}
          <span class="text-[8px] font-bold px-1 py-0.5 rounded ${priorityColorsMinimized[task.prioridad] || 'bg-slate-700'}">${task.prioridad[0]}</span>
          <span class="text-[8px] font-bold px-1 py-0.5 rounded ${stateInfo.color}">${stateInfo.label}</span>
          <button onclick="event.stopPropagation(); toggleTaskMinimize('${task.id}')" class="text-slate-500 hover:text-white ml-1">
            <i class="fa-solid fa-chevron-down"></i>
          </button>
        </div>
      </div>
    `;
  } else {
    card.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <div class="flex gap-2 items-center">
          <span class="text-[9px] font-mono text-slate-500">#${task.id}</span>
          <button onclick="event.stopPropagation(); openEditTaskModal('${task.id}')" class="text-[10px] text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all">
            <i class="fa-solid fa-pencil"></i>
          </button>
        </div>
        <div class="flex gap-2 items-center">
          ${canArchive ? `
            <button onclick="event.stopPropagation(); handleArchiveTask('${task.id}')" class="text-[10px] font-bold text-slate-500 hover:text-emerald-400 flex items-center gap-1 px-2 py-0.5 bg-slate-900 rounded border border-slate-700 transition-all mr-2" title="Mover al Cementerio">
                <i class="fa-solid fa-box-archive"></i> ARCHIVAR
            </button>
          ` : ''}
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${priorityColors[task.prioridad] || 'bg-slate-700'}">${task.prioridad.toUpperCase()}</span>
          <button onclick="event.stopPropagation(); toggleTaskMinimize('${task.id}')" class="text-slate-500 hover:text-white">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
        </div>
      </div>
      <p class="text-sm text-slate-200 leading-snug mb-3 font-bold">${task.title || task.descripcion}</p>
      ${task.title ? `<p class="text-[11px] text-slate-400 leading-tight mb-3 line-clamp-2">${task.descripcion}</p>` : ''}

      ${hasImages ? `
      <div class="mb-3 grid grid-cols-3 gap-2" id="card-images-${task.id}">
          <!-- Thumbnails injected via DOM to avoid touch ghost events -->
      </div>
      ` : ''}

      <div class="mb-3">
          <select onchange="event.stopPropagation(); handleQuickStageUpdate('${String(task.id)}', this.value)" class="w-full bg-slate-950/50 border border-slate-700 rounded text-[10px] p-1 text-slate-400 focus:text-white focus:border-indigo-500 outline-none">
              ${STAGES.map(s => `<option value="${s}" ${task.tema_principal === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
      </div>

      ${task.jules_session_id ? `
      <div class="mb-3 p-2 bg-indigo-500/10 border border-indigo-500/20 rounded flex items-center justify-between">
          <span class="text-[9px] font-bold text-indigo-400 flex items-center gap-1">
              <i class="fa-solid fa-robot"></i> JULES
          </span>
          <span id="jules-status-${String(task.id)}" class="text-[8px] font-mono text-indigo-300 uppercase">Cargando...</span>
      </div>
      ` : ''}

      <div class="flex justify-between items-end">
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <div class="flex -space-x-2">
              ${task.resuelto_por ? `<div onclick="event.stopPropagation(); scrollToProfile('${task.resuelto_por}')" title="Resuelto por: ${task.resuelto_por}" class="w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-slate-950 cursor-pointer hover:scale-110 transition-transform">${task.resuelto_por[0]}</div>` : ''}
              ${task.detectado_por ? `<div onclick="event.stopPropagation(); scrollToProfile('${task.detectado_por}')" title="Detectado por: ${task.detectado_por}" class="w-6 h-6 rounded-full bg-indigo-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-white cursor-pointer hover:scale-110 transition-transform">${task.detectado_por[0]}</div>` : ''}
              ${task.apoyo ? `<div onclick="event.stopPropagation(); scrollToProfile('${task.apoyo}')" title="Apoyo: ${task.apoyo}" class="w-6 h-6 rounded-full bg-purple-500 border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-white cursor-pointer hover:scale-110 transition-transform">${task.apoyo[0]}</div>` : ''}
            </div>
            <span class="text-[8px] font-bold px-1.5 py-0.5 rounded ${stateInfo.color}">${stateInfo.label.toUpperCase()}</span>
          </div>

          <div onclick="event.stopPropagation(); openAssignmentModal('${String(task.id)}')" class="flex -space-x-1.5 cursor-pointer hover:opacity-80 transition-opacity min-h-[24px] items-center">
            ${(task.asignados || []).length > 0
              ? task.asignados.map(handle => {
                  const name = MEMBER_MAPPING[handle] || handle;
                  return `<img src="https://github.com/${handle}.png" class="w-6 h-6 rounded-full border-2 border-slate-800 shadow-sm" title="Asignado: ${name}">`;
                }).join('')
              : `<div class="w-6 h-6 rounded-full border border-dashed border-slate-600 flex items-center justify-center text-slate-500 hover:border-emerald-500 hover:text-emerald-500 transition-colors">
                   <i class="fa-solid fa-plus text-[10px]"></i>
                 </div>`
            }
          </div>
          ${task.email_responsable ? `<div class="text-[8px] text-slate-500 mt-1 flex items-center gap-1"><i class="fa-solid fa-envelope text-[7px]"></i> ${task.email_responsable}</div>` : ''}
        </div>
        <div class="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
          ${task.rama}${task.rama2 ? ` / ${task.rama2}` : ''}
        </div>
      </div>
    `;

    if (hasImages) {
        const grid = card.querySelector(`#card-images-${task.id}`);
        if (grid) {
            task.images.forEach((img, idx) => {
                const thumbEl = document.createElement('div');
                thumbEl.className = 'aspect-square rounded border border-slate-800 overflow-hidden cursor-pointer relative block bg-slate-900';
                thumbEl.style.cssText = 'touch-action: none; -webkit-tap-highlight-color: transparent; outline: none; user-select: none;';
                thumbEl.draggable = false;
                thumbEl.dataset.noDrag = 'true';

                const isLegacy = img.type === 'binary_legacy';
                thumbEl.innerHTML = `
                    <img src="${img.url}" class="w-full h-full object-cover pointer-events-none" alt="Task image" loading="lazy" draggable="false">
                    ${isLegacy ? '<span class="absolute top-0.5 left-0.5 bg-amber-500 text-slate-950 text-[6px] font-black px-0.5 rounded shadow-sm">⚠️ LEGACY</span>' : ''}
                `;

                const handleLightboxOpen = function(e) {
                    if (e) {
                        e.preventDefault();
                        e.stopImmediatePropagation(); // More aggressive than stopPropagation
                    }
                    openLightbox(String(task.id), idx);
                    return false;
                };

                // Use pointerdown for immediate response, bypasses drag delay
                thumbEl.onpointerdown = handleLightboxOpen;
                // Swallowing other events to prevent ghost clicks or parent reactions
                thumbEl.ontouchstart = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
                thumbEl.onclick = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };

                grid.appendChild(thumbEl);
            });
        }
    }
  }
  return card;
}

function toggleTaskMinimize(taskId) {
  const key = `task_minimized_${String(taskId)}`;
  const current = isTaskMinimized(taskId);
  localStorage.setItem(key, !current);
  renderKanbanBoard();
}

function toggleAllTasks() {
  const tasks = getFilteredTasks(currentTasks.filter(t => t.estado !== 'Obsolete'));
  const anyExpanded = tasks.some(t => !isTaskMinimized(t.id));

  // If any expanded -> minimize all. If all minimized -> expand all.
  const newState = anyExpanded;

  tasks.forEach(t => {
    localStorage.setItem(`task_minimized_${t.id}`, newState);
  });

  renderKanbanBoard();
}

function toggleCardImages(taskId) {
    const key = `task_images_expanded_${taskId}`;
    const current = localStorage.getItem(key) === 'true';
    localStorage.setItem(key, !current);
    renderKanbanBoard();
}

async function handleCardDrop(taskId, targetColumnId) {
  const stateMap = { backlog: 'Pending', working: 'Working', qa: 'Fixed', done: 'OK' };
  const newEstado = stateMap[targetColumnId];

  let resolverHandle = null;
  let testerHandle   = null;

  if (targetColumnId === 'qa') {
    const selection = await promptQAAssignment(taskId);
    if (!selection) return;
    testerHandle = selection.tester;
    resolverHandle = selection.resolver;
  }

  showToast(UI_STRINGS.saving, 'info');
  try {
    await window.githubApi.updateTaskStatus(taskId, newEstado, resolverHandle, testerHandle);
    showToast(UI_STRINGS.taskMoved(taskId, targetColumnId), 'success');
    await refreshDashboardData();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

function promptQAAssignment(taskId) {
  return new Promise((resolve) => {
    const modal = document.getElementById('qa-assignment-modal');
    const testerSelect = document.getElementById('qa-tester-select');
    const resolverSelect = document.getElementById('qa-resolver-select');

    [testerSelect, resolverSelect].forEach(s => {
      s.innerHTML = '<option value="">-- Seleccionar --</option>';
      MEMBERS.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        s.appendChild(opt);
      });
    });

    modal.classList.remove('hidden');
    document.getElementById('qa-confirm-btn').onclick = () => {
      if (!testerSelect.value || !resolverSelect.value) {
        showToast(UI_STRINGS.qaRequired, 'warning');
        return;
      }
      modal.classList.add('hidden');
      resolve({ tester: testerSelect.value, resolver: resolverSelect.value });
    };
    document.getElementById('qa-cancel-btn').onclick = () => {
      modal.classList.add('hidden');
      resolve(null);
    };
  });
}

async function handleQuickStageUpdate(taskId, newStage) {
    showToast(UI_STRINGS.saving, 'info');
    try {
        await window.githubApi.updateTask(taskId, { tema_principal: newStage });
        showToast(`Tarea #${taskId} movida a ${newStage}`, 'success');
        await refreshDashboardData();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}
