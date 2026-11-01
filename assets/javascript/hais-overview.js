/* HAIS overview: local filtering and dependency summary for the built snapshot. */
(() => {
  'use strict';
  const cards = Array.from(document.querySelectorAll('#task-list .task'));
  const search = document.getElementById('task-search');
  const state = document.getElementById('task-state');
  const scope = document.getElementById('task-scope');
  const count = document.getElementById('task-count');
  const empty = document.getElementById('no-results');
  const depCount = document.getElementById('dependency-count');
  const depList = document.getElementById('dependency-list');
  if (!search || !state || !scope || !count || !empty || !depCount || !depList) return;

  const groups = {
    pending: ['Pending', 'ToDo'], working: ['Working', 'KO'],
    qa: ['Fixed', 'In Review', '?'], done: ['OK', 'Closed', 'DONE']
  };
  const groupFor = value => Object.keys(groups).find(key => groups[key].includes(value)) || 'other';
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

  function applyFilters() {
    const query = normalize(search.value.trim());
    let visible = 0;
    for (const card of cards) {
      const archived = card.dataset.archived === 'true';
      const scopeMatches = scope.value === 'all' || (scope.value === 'archived' ? archived : !archived);
      const stateMatches = state.value === 'all' || groupFor(card.dataset.status || '') === state.value;
      const queryMatches = !query || normalize(card.dataset.search || '').includes(query);
      card.hidden = !(scopeMatches && stateMatches && queryMatches);
      if (!card.hidden) visible++;
    }
    count.textContent = `${visible} ${visible === 1 ? 'tarea' : 'tareas'} en esta vista`;
    empty.hidden = visible !== 0;
  }
  search.addEventListener('input', applyFilters);
  state.addEventListener('change', applyFilters);
  scope.addEventListener('change', applyFilters);

  // Map by string ID: the source contains both numeric and string dependency IDs.
  // Archived tasks are available to resolve dependencies, but are not themselves listed.
  const byId = new Map();
  for (const card of cards) {
    const id = card.dataset.taskId;
    if (!byId.has(id) || card.dataset.archived !== 'true') byId.set(id, card);
  }
  let waiting = 0;
  let unknown = 0;
  for (const card of cards) {
    if (card.dataset.archived === 'true' || groupFor(card.dataset.status || '') === 'done') continue;
    const deps = (card.dataset.deps || '').split(',').map(item => item.trim()).filter(Boolean);
    const unresolved = [];
    for (const id of deps) {
      const dep = byId.get(id);
      if (!dep) {
        unresolved.push(`#${id} sin estado conocido`);
        unknown++;
      } else if (groupFor(dep.dataset.status || '') !== 'done') {
        unresolved.push(`#${id} (${dep.dataset.status || 'sin estado'})`);
      }
    }
    if (!unresolved.length) continue;
    waiting++;
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#task-${encodeURIComponent(card.dataset.taskId)}`;
    link.textContent = `#${card.dataset.taskId} ${card.querySelector('.task-name')?.textContent.trim() || ''}`;
    link.addEventListener('click', () => {
      // A dependency can be hidden by current filters; reveal it before navigating.
      search.value = '';
      state.value = 'all';
      scope.value = 'active';
      applyFilters();
      card.open = true;
    });
    li.append(link, document.createTextNode(` · Espera: ${unresolved.join(', ')}`));
    depList.appendChild(li);
  }
  depCount.textContent = waiting
    ? `${waiting} ${waiting === 1 ? 'tarea declara dependencias pendientes o desconocidas' : 'tareas declaran dependencias pendientes o desconocidas'}${unknown ? ` · ${unknown} ${unknown === 1 ? 'referencia sin estado conocido' : 'referencias sin estado conocido'}` : ''}`
    : 'Sin dependencias pendientes o desconocidas en el snapshot';
  applyFilters();
})();
