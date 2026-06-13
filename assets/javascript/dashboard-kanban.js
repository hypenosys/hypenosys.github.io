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
  const isExpanded = window.kanbanUI && window.kanbanUI.expandedCards.has(String(task.id));
  const cardHtml = window.kanbanUI ? window.kanbanUI.renderCard(task, isExpanded) : '';

  if (!cardHtml) {
    console.error(`[KANBAN] Failed to render card HTML for task #${task.id}. window.kanbanUI available: ${!!window.kanbanUI}`);
    return document.createElement('div');
  }

  const card = document.createElement('div');
  card.innerHTML = cardHtml;
  const cardEl = card.firstElementChild;

  if (!cardEl) {
    console.error(`[KANBAN] cardEl is null after setting innerHTML for task #${task.id}`);
    return card;
  }

  cardEl.id = `card-${task.id}`;
  cardEl.draggable = true;

  // Re-bind actions using unified touch/click handler
  if (window.kanbanUI && window.kanbanUI.attachEvents) {
      window.kanbanUI.attachEvents(cardEl);
  }

  cardEl.addEventListener('dragstart', e => {
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
    cardEl.classList.add('opacity-50');
  });
  cardEl.addEventListener('dragend', () => cardEl.classList.remove('opacity-50'));

  return cardEl;
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

async function handleMoveCard(taskId, direction) {
    const task = currentTasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    const currentColId = getTaskColumn(task);
    const currentIndex = KANBAN_COLUMNS.findIndex(c => c.id === currentColId);
    const nextIndex = currentIndex + direction;

    if (nextIndex < 0 || nextIndex >= KANBAN_COLUMNS.length) return;

    const targetCol = KANBAN_COLUMNS[nextIndex];
    await handleCardDrop(taskId, targetCol.id);
}

window._openTaskInClaudeWithContext = function(taskId) {
  if (typeof currentTasks !== 'undefined') {
    const task = currentTasks.find(t => String(t.id) === String(taskId));
    if (task) {
      const payload = {
        titulo: task.title || task.titulo || '',
        descripcion: task.descripcion || task.description || '',
        acceptance_criteria: task.acceptance_criteria || '',
        tags: task.tags || [],
        prioridad: task.prioridad || '',
        asignados: task.asignados || task.asignado_a || [],
        comments: task.comments || [],
        estimated_hours: task.estimated_hours || '',
        repositorio: task.repository || task.repo || '',
        rama: task.rama || task.branch || ''
      };
      localStorage.setItem('claude_task_context', JSON.stringify(payload));
    }
  }
  window.location.href = `/chat/neural/?task_id=${taskId}&from=dashboard`;
};
