/* HYPENOSYS — CHARTS MODULE */

function renderGroupStats() {
  if (!currentStats) return;
  const group = currentStats.group || {};

  const bugRate = group.bug_rate || 0;
  const blockerHealth = group.blocker_health || 0;
  const milRemaining = group.milestone_tasks_remaining || 0;

  document.getElementById('group-bug-rate').textContent = `${(bugRate * 100).toFixed(1)}%`;
  document.getElementById('group-blocker-health').textContent = blockerHealth;
  document.getElementById('group-milestone-remaining').textContent = milRemaining;

  // Burnout from budget as before but updated UI id
  const tasks = getFilteredTasks(currentTasks);
  const milId = currentBudget?.burnout?.current_milestone || 'M1';
  const milData = (currentBudget?.burnout?.milestones || []).find(m => m.id === milId);
  const burnoutIndex = milData ? window.githubApi.computeBurnoutIndex(tasks, milId, milData.date_start, milData.date_end) : 0;
  document.getElementById('group-burnout-index').textContent = `${(burnoutIndex * 100).toFixed(1)}%`;

  renderGroupVelocityChart(group.velocity_trend || {});
  renderGroupTagHeatmap(group.tag_heatmap || {});
}

function renderGroupVelocityChart(trend) {
    const ctx = document.getElementById('group-velocity-chart').getContext('2d');
    if (!ctx) return;

    if (groupVelocityChart) groupVelocityChart.destroy();
    groupVelocityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(trend),
            datasets: [{
                label: 'Tareas Completadas',
                data: Object.values(trend),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#6366f1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
            }
        }
    });
}

function renderGroupTagHeatmap(heatmap) {
    const container = document.getElementById('group-tag-heatmap');
    if (!container) return;
    container.innerHTML = '';

    const sortedTags = Object.entries(heatmap).sort((a,b) => b[1] - a[1]);
    const maxVal = sortedTags[0]?.[1] || 1;

    sortedTags.forEach(([tag, val]) => {
        const opacity = Math.max(0.2, val / maxVal);
        const span = document.createElement('span');
        span.className = 'px-3 py-1 rounded-full text-[10px] font-bold border transition-all hover:scale-110 cursor-default';
        span.style.backgroundColor = `rgba(99, 102, 241, ${opacity * 0.2})`;
        span.style.borderColor = `rgba(99, 102, 241, ${opacity})`;
        span.style.color = `rgba(165, 180, 252, ${Math.min(1, opacity + 0.5)})`;
        span.innerHTML = `${tag} <span class="ml-1 opacity-50">${val}</span>`;
        container.appendChild(span);
    });
}

function renderBurnoutGauge() {
  const canvas = document.getElementById('burnout-gauge-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx || !currentBudget) return;

  const tasks = getFilteredTasks(currentTasks);
  const current = currentBudget.burnout?.current_milestone || 'M1';
  const milData = (currentBudget.burnout?.milestones || []).find(m => m.id === current);

  const burnoutIndex = milData
    ? window.githubApi.computeBurnoutIndex(tasks, current, milData.date_start, milData.date_end)
    : 0;

  const color = burnoutIndex < 0.4 ? '#34d399' : burnoutIndex < 0.7 ? '#fbbf24' : '#f87171';
  const label = burnoutIndex < 0.4 ? UI_STRINGS.burnoutLow : burnoutIndex < 0.7 ? UI_STRINGS.burnoutMedium : UI_STRINGS.burnoutHigh;

  const burnoutValEl = document.getElementById('burnout-index-value');
  if (burnoutValEl) burnoutValEl.textContent = `${(burnoutIndex * 100).toFixed(1)}%`;

  if (__burnoutChart__) __burnoutChart__.destroy();
  __burnoutChart__ = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data:            [burnoutIndex, 1 - burnoutIndex],
        backgroundColor: [color, 'rgba(30,41,59,0.6)'],
        borderWidth:     0,
        circumference:   180,
        rotation:        270
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '85%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        title: {
          display: true,
          text:    label,
          color:   color,
          font:    { size: 12 }
        }
      }
    }
  });
}

function renderBudgetChart() {
  const canvas = document.getElementById('budget-doughnut-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx || !currentBudget) return;

  const categories = currentBudget.categories || [];
  const labels = categories.map(c => c.label);
  const values = categories.map(c => {
    let total = 0;
    if (c.roles)   c.roles.forEach(r => total += (r.hourly_rate || 0) * (r.monthly_hours || 0));
    if (c.entries) c.entries.forEach(e => total += e.cost_monthly || 0);
    return total;
  });

  const PALETTE = ['#6366f1','#34d399','#fbbf24','#f87171','#a78bfa','#38bdf8','#fb923c'];

  if (__budgetChart__) __budgetChart__.destroy();
  __budgetChart__ = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data:            values,
        backgroundColor: PALETTE,
        borderColor:     'rgba(15,23,42,0.8)',
        borderWidth:     2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#e2e8f0', padding: 16, font: { size: 11 } } },
        title:  { display: true, text: 'Distribución de Presupuesto', color: '#f1f5f9', font: { size: 14 } }
      }
    }
  });
}

function renderMilestoneBurndownChart() {
  const ctx = document.getElementById('milestone-burndown-chart').getContext('2d');
  if (!ctx || !currentBudget || !currentTasks) return;

  const milestoneId = currentBudget.burnout?.current_milestone || 'M1';
  const mil = currentBudget.burnout?.milestones?.find(m => m.id === milestoneId);
  if (!mil) return;

  const tasks = currentTasks.filter(t => t.milestone === milestoneId && t.estado !== 'Obsolete');
  const totalTasks = tasks.length;

  const start = new Date(mil.date_start);
  const end = new Date(mil.date_end);
  const daysTotal = Math.ceil((end - start) / 86400000);

  const labels = [];
  const idealData = [];
  const actualData = [];

  const today = new Date();
  const daysElapsed = Math.ceil((today - start) / 86400000);

  for (let i = 0; i <= daysTotal; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    labels.push(d.toISOString().split('T')[0]);

    // Ideal: linear from totalTasks to 0
    idealData.push(totalTasks - (totalTasks * (i / daysTotal)));

    // Actual: count tasks completed after this date or not yet completed
    if (i <= daysElapsed) {
        const remainingAtThisDay = tasks.filter(t => {
            if (t.estado !== 'OK') return true;
            // Assuming 'fecha' is the completion date if estado is 'OK'
            return new Date(t.fecha) > d;
        }).length;
        actualData.push(remainingAtThisDay);
    }
  }

  if (__burndownChart__) __burndownChart__.destroy();
  __burndownChart__ = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Ideal', data: idealData, borderColor: 'rgba(148,163,184,0.5)', borderDash: [5, 5], fill: false, tension: 0, pointRadius: 0 },
        { label: 'Actual', data: actualData, borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', fill: true, tension: 0.1 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#e2e8f0' } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8', maxTicksLimit: 7 }, grid: { color: 'rgba(148,163,184,0.1)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' }, beginAtZero: true }
      }
    }
  });
}

function renderVelocityTrackerChart() {
  const ctx = document.getElementById('velocity-tracker-chart').getContext('2d');
  if (!ctx || !currentTasks) return;

  // Group tasks by week
  const createdByWeek = {};
  const completedByWeek = {};

  currentTasks.forEach(t => {
    if (t.estado === 'Obsolete') return;

    const weekC = getWeekNumber(new Date(t.fecha_creacion || t.fecha)); // Fallback to fecha
    createdByWeek[weekC] = (createdByWeek[weekC] || 0) + 1;

    if (t.estado === 'OK') {
        const weekO = getWeekNumber(new Date(t.fecha));
        completedByWeek[weekO] = (completedByWeek[weekO] || 0) + 1;
    }
  });

  const weeks = [...new Set([...Object.keys(createdByWeek), ...Object.keys(completedByWeek)])].sort();
  const createdData = weeks.map(w => createdByWeek[w] || 0);
  const completedData = weeks.map(w => completedByWeek[w] || 0);
  const netVelocity = weeks.map(w => (completedByWeek[w] || 0) - (createdByWeek[w] || 0));

  if (__velocityChart__) __velocityChart__.destroy();
  __velocityChart__ = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weeks.map(w => `Semana ${w}`),
      datasets: [
        { label: 'Creadas', data: createdData, backgroundColor: 'rgba(248, 113, 113, 0.5)' },
        { label: 'Completadas', data: completedData, backgroundColor: 'rgba(52, 211, 153, 0.5)' },
        { label: 'Velocidad Neta', data: netVelocity, type: 'line', borderColor: '#facc15', tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#e2e8f0' } } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } }
      }
    }
  });
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function renderDependencyGraph() {
  const container = document.getElementById('dependency-graph-container');
  if (!container) return;

  const milestoneId = currentBudget?.burnout?.current_milestone || 'M1';
  const tasks = currentTasks.filter(t => t.milestone === milestoneId && t.estado !== 'Obsolete');

  const nodes = [];
  const edges = [];

  tasks.forEach(t => {
    const blockedBy = t.blocked_by || [];
    const blocks = t.blocks || [];

    if (blockedBy.length > 0 || blocks.length > 0) {
      nodes.push(t);
      blockedBy.forEach(id => edges.push({ from: parseInt(id), to: t.id, type: 'blocked_by' }));
      blocks.forEach(id => edges.push({ from: t.id, to: parseInt(id), type: 'blocks' }));
    }
  });

  if (nodes.length === 0) {
    container.innerHTML = '<div class="h-full flex items-center justify-center text-slate-500 italic text-sm">No dependencies found in this milestone.</div>';
    return;
  }

  // Deduplicate nodes
  const uniqueNodes = [...new Map(nodes.map(n => [n.id, n])).values()];

  // Arrange in columns by state
  const columns = { Pending: [], Working: [], Fixed: [], OK: [] };
  uniqueNodes.forEach(n => {
    const col = n.estado === 'Pending' || n.estado === 'ToDo' || n.estado === null ? 'Pending' :
                n.estado === 'Working' || n.estado === 'KO' ? 'Working' :
                n.estado === 'Fixed' || n.estado === '?' ? 'Fixed' : 'OK';
    columns[col].push(n);
  });

  const COL_WIDTH = 200;
  const ROW_HEIGHT = 80;
  const positions = new Map();

  let svgWidth = Object.keys(columns).length * COL_WIDTH;
  let maxRow = Math.max(...Object.values(columns).map(c => c.length));
  let svgHeight = maxRow * ROW_HEIGHT + 40;

  let svgHtml = `<svg width="100%" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;

  let colIdx = 0;
  for (const [colName, colTasks] of Object.entries(columns)) {
    colTasks.forEach((t, rowIdx) => {
      const x = colIdx * COL_WIDTH + 20;
      const y = rowIdx * ROW_HEIGHT + 40;
      positions.set(t.id, { x, y });
    });
    colIdx++;
  }

  edges.forEach(e => {
    const start = positions.get(String(e.from));
    const end = positions.get(String(e.to));
    if (start && end) {
      const color = e.type === 'blocked_by' ? '#f87171' : '#fbbf24';
      const dash = e.type === 'blocked_by' ? '5,5' : '';
      svgHtml += `<path d="M ${start.x + 150} ${start.y + 20} L ${end.x} ${end.y + 20}" stroke="${color}" stroke-width="2" fill="none" stroke-dasharray="${dash}" marker-end="url(#arrowhead)"/>`;
    }
  });

  positions.forEach((pos, id) => {
    const t = uniqueNodes.find(n => sameTaskId(n.id, id));
    const color = t.estado === 'OK' ? '#10b981' : '#6366f1';
    svgHtml += `
      <g class="cursor-pointer" onclick="event.stopPropagation(); scrollToTask('${String(id)}')">
        <rect x="${pos.x}" y="${pos.y}" width="150" height="40" rx="8" fill="#1e293b" stroke="${color}" stroke-width="1"/>
        <text x="${pos.x + 10}" y="${pos.y + 25}" fill="#f1f5f9" font-size="10" font-family="monospace">#${id} ${t.descripcion.substring(0, 15)}...</text>
      </g>
    `;
  });

  svgHtml += `
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orientation="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
      </marker>
    </defs>
  </svg>`;

  container.innerHTML = svgHtml;
}

function renderPipelineSwimlanes() {
  const container = document.getElementById('pipeline-swimlanes');
  if (!container) return;
  container.innerHTML = '';

  const PIPELINE_STAGES = [
    { id: 'CONCEPT',        label: 'Concept',        icon: 'fa-lightbulb', topics: ['Concepto / GDD'] },
    { id: 'PRE-PRODUCTION', label: 'Pre-Production', icon: 'fa-map',       topics: ['Pre-producción'] },
    { id: 'PRODUCTION',     label: 'Production',     icon: 'fa-gears',     topics: ['Tools / Automation', 'Arte / Assets', 'Programación / Engine'] },
    { id: 'ALPHA',          label: 'Alpha',          icon: 'fa-flask',     topics: ['QA / Testing'], milestoneFilter: 'M1' },
    { id: 'BETA',           label: 'Beta',           icon: 'fa-bug',       topics: ['QA / Testing'], milestoneFilter: 'M2' },
    { id: 'GOLD',           label: 'Gold',           icon: 'fa-compact-disc', topics: ['Build / Deploy'] },
    { id: 'SHIPPED',        label: 'Shipped',        icon: 'fa-truck-fast', topics: ['Post-launch'] }
  ];

  PIPELINE_STAGES.forEach(stage => {
    const stageTasks = currentTasks.filter(t =>
      stage.topics.includes(t.tema_principal) &&
      (!stage.milestoneFilter || t.milestone === stage.milestoneFilter)
    );

    const total = stageTasks.length;
    const ok = stageTasks.filter(t => t.estado === 'OK').length;
    const pct = total > 0 ? (ok / total) * 100 : 0;

    const assignees = [...new Set(stageTasks.map(t => t.resuelto_por || t.detectado_por).filter(Boolean))];

    const colorClass = pct < 30 ? 'bg-red-500' : pct < 70 ? 'bg-amber-500' : 'bg-emerald-500';

    const card = document.createElement('div');
    card.className = 'min-w-[240px] bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 group hover:border-slate-600 transition-all cursor-pointer';
    card.onclick = (event) => {
        if (event) event.stopPropagation();
        activeFilter = null;
        activeStageFilter = stage;
        renderDashboard();
        showToast(`Filtrando por etapa: ${stage.label}`, 'info');
    };

    card.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="flex items-center gap-2">
            <i class="fa-solid ${stage.icon} text-indigo-400"></i>
            <span class="text-sm font-bold">${stage.label}</span>
        </div>
        <span class="text-[10px] font-mono text-slate-500">${ok}/${total}</span>
      </div>
      <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
        <div class="h-full ${colorClass} transition-all duration-1000" style="width: ${pct}%"></div>
      </div>
      <div class="flex justify-between items-center">
        <div class="flex -space-x-1.5">
            ${assignees.slice(0, 4).map(name => `<img src="https://github.com/${currentProfiles?.members[name]?.github_username || 'ghost'}.png" class="w-5 h-5 rounded-full border border-slate-900" title="${name}">`).join('')}
            ${assignees.length > 4 ? `<div class="w-5 h-5 rounded-full bg-slate-800 border border-slate-900 flex items-center justify-center text-[8px] font-bold">+${assignees.length - 4}</div>` : ''}
        </div>
        <span class="text-[10px] font-bold text-slate-400">${pct.toFixed(0)}%</span>
      </div>
    `;
    container.appendChild(card);
  });
}
