---
layout: hais
title: HAIS — Estado del proyecto
permalink: /hais/
---
{% assign active_tasks = site.data.orgs.hais.tasks.tasks %}
{% assign shard_archive = site.data.orgs.hais.tasks_archive.tasks %}
{% if shard_archive %}
  {% assign archived_tasks = shard_archive | where: 'organizationId', 'hais' %}
{% else %}
  {% assign archived_tasks = site.data.dashboard_tasks_archive.tasks | where: 'organizationId', 'hais' %}
{% endif %}
{% assign pending_a = active_tasks | where: 'estado', 'Pending' | size %}
{% assign pending_b = active_tasks | where: 'estado', 'ToDo' | size %}
{% assign pending = pending_a | plus: pending_b %}
{% assign working_a = active_tasks | where: 'estado', 'Working' | size %}
{% assign working_b = active_tasks | where: 'estado', 'KO' | size %}
{% assign working = working_a | plus: working_b %}
{% assign qa_a = active_tasks | where: 'estado', 'Fixed' | size %}
{% assign qa_b = active_tasks | where: 'estado', 'In Review' | size %}
{% assign qa_c = active_tasks | where: 'estado', '?' | size %}
{% assign qa = qa_a | plus: qa_b | plus: qa_c %}
{% assign active_count = active_tasks | size %}
{% assign archived_count = archived_tasks | size %}
{% assign all_tasks = active_tasks | concat: archived_tasks %}
<a class="skip" href="#contenido">Saltar al contenido</a>
<header class="topbar">
  <a class="brand" href="{{ '/' | relative_url }}"><span class="brand-mark" aria-hidden="true">H</span><span>HYPENOSYS <span class="brand-divider">/</span> HAIS</span></a>
  <nav aria-label="Navegación principal"><a href="{{ '/dashboard.html' | relative_url }}">Ir al tablero <span aria-hidden="true">↗</span></a></nav>
</header>
<main id="contenido" class="shell">
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <p class="eyebrow"><span class="pulse" aria-hidden="true"></span> INVESTIGACIÓN · PAPER</p>
      <h1 id="hero-title">De la señal<br><span>a la evidencia.</span></h1>
      <p class="hero-text">Un espacio para seguir el desarrollo de HAIS: qué está planificado, qué espera revisión y qué evidencia tenemos hoy.</p>
      <div class="hero-actions"><a class="button primary" href="#tareas">Explorar tareas <span aria-hidden="true">↓</span></a><a class="button secondary" href="https://github.com/hypenosys/HAIS">Repositorio HAIS <span aria-hidden="true">↗</span></a></div>
    </div>
    <div class="hero-aside" aria-label="Alcance del proyecto">
      <div class="aside-top"><span>ALCANCE ACTUAL</span><span class="mono">01 / PAPER</span></div>
      <div class="scope-icon" aria-hidden="true"><svg viewBox="0 0 180 88" fill="none"><path d="M2 76 H178 M2 48 H178 M2 20 H178" stroke="currentColor" opacity=".15"/><path d="M4 68 L26 62 L44 66 L64 42 L82 48 L103 28 L121 34 L144 14 L174 20" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="174" cy="20" r="5" fill="currentColor"/></svg></div>
      <h2>Simulación primero.</h2><p>La estrategia de entrada, salida y riesgo está por definir. El proyecto mantiene el límite PAPER.</p>
      <span class="scope-label"><span aria-hidden="true">●</span> SIN OPERATIVA REAL</span>
    </div>
  </section>

  <section class="overview" aria-labelledby="overview-title">
    <div class="section-title"><div><p class="eyebrow">01 / PANORAMA</p><h2 id="overview-title">El trabajo, de un vistazo</h2></div><p>Snapshot generado al construir la web: <time datetime="{{ site.time | date_to_xmlschema }}">{{ site.time | date: '%d/%m/%Y %H:%M %z' }}</time>.</p></div>
    <div class="metric-grid">
      <div class="metric"><span class="metric-label">TAREAS ACTIVAS</span><strong>{{ active_count }}</strong><span>en la organización HAIS</span></div>
      <div class="metric"><span class="metric-label">PENDIENTES</span><strong>{{ pending }}</strong><span>por iniciar</span></div>
      <div class="metric"><span class="metric-label">EN CURSO</span><strong>{{ working }}</strong><span>trabajo en desarrollo</span></div>
      <div class="metric accent"><span class="metric-label">EN QA / REVISIÓN</span><strong>{{ qa }}</strong><span>esperan validación</span></div>
      <div class="metric"><span class="metric-label">ARCHIVADAS</span><strong>{{ archived_count }}</strong><span>se muestran aparte</span></div>
    </div>
    <p class="metric-note"><strong>Cómo leerlo:</strong> son estados declarados en el tablero, no un porcentaje de implementación ni una comprobación automática de que los criterios se hayan cumplido. Los cambios aparecerán tras reconstruir la web. <a href="https://github.com/hypenosys/hypenosys.github.io/blob/develop/_data/orgs/hais/tasks.json">Consultar la fuente en develop ↗</a></p>
  </section>

  <section class="evidence" aria-labelledby="evidence-title">
    <div class="section-title"><div><p class="eyebrow">02 / EVIDENCIA</p><h2 id="evidence-title">Código y validación</h2></div><p>Observación manual del 1 de noviembre de 2026. No se actualiza automáticamente al cambiar el repositorio.</p></div>
    <div class="evidence-grid">
      <article class="evidence-card"><span class="card-number">01</span><span class="card-tag">MASTER · bf287d2</span><h3>Base del servicio</h3><p>FastAPI ofrece salud, capacidades y estimación teórica. La estimación no ejecuta órdenes ni guarda posiciones.</p><a href="https://github.com/hypenosys/HAIS/tree/bf287d2">Ver código observado <span aria-hidden="true">↗</span></a></article>
      <article class="evidence-card"><span class="card-number">02</span><span class="card-tag">RAMA · fc252b2</span><h3>Contratos PAPER</h3><p>Modelos y esquemas con pruebas locales, preparados en una rama. Pendientes de PR, revisión, CI e integración.</p><a href="https://github.com/hypenosys/HAIS/commit/fc252b2">Ver commit observado <span aria-hidden="true">↗</span></a></article>
      <article class="evidence-card"><span class="card-number">03</span><span class="card-tag">DEVELOP · a17c37b</span><h3>Rama de desarrollo</h3><p>En el momento de la observación contenía únicamente el README inicial. Las ramas pueden haber cambiado.</p><a href="https://github.com/hypenosys/HAIS/tree/a17c37b">Ver snapshot observado <span aria-hidden="true">↗</span></a></article>
    </div>
    <p class="metric-note">La recepción de señales, la cartera y el backtest figuran como tareas pendientes. Una estimación teórica no demuestra la efectividad financiera de una estrategia.</p>
  </section>

  <section class="dependencies" aria-labelledby="dependency-title">
    <div class="section-title"><div><p class="eyebrow">03 / DEPENDENCIAS</p><h2 id="dependency-title">Lo que espera a otras tareas</h2></div><p>Relaciones declaradas en el snapshot; no comprueban que exista un bloqueo automático.</p></div>
    <div class="dependency-panel"><div class="dependency-heading"><span class="dependency-dot" aria-hidden="true"></span><strong id="dependency-count">Calculando dependencias…</strong></div><ul id="dependency-list"></ul><noscript><p>Activa JavaScript para resumir dependencias. También puedes verlas en cada tarea.</p></noscript></div>
  </section>

  <section id="tareas" class="tasks" aria-labelledby="tasks-title">
    <div class="section-title"><div><p class="eyebrow">04 / TABLERO</p><h2 id="tasks-title">Explora las tareas</h2></div><p>Datos de la organización HAIS. Las tareas archivadas se cuentan por separado.</p></div>
    <noscript><style>.filters{display:none!important} #task-list .task[hidden]{display:block!important}</style><p class="metric-note">Los filtros requieren JavaScript; se muestran todas las tareas, incluidas las archivadas.</p></noscript>
    <div class="filters" role="search" aria-label="Filtrar tareas">
      <label class="search-label" for="task-search"><span>Buscar por título, ID o etiqueta</span><input id="task-search" type="search" placeholder="Ej. impulso, 900011…" autocomplete="off"></label>
      <label for="task-state"><span>Estado</span><select id="task-state"><option value="all">Todos los estados</option><option value="pending">Pendientes</option><option value="working">En curso</option><option value="qa">QA / revisión</option><option value="done">Completadas</option><option value="other">Otros</option></select></label>
      <label for="task-scope"><span>Vista</span><select id="task-scope"><option value="active">Activas</option><option value="archived">Archivadas</option><option value="all">Todas</option></select></label>
    </div>
    <p id="task-count" class="result-count" aria-live="polite">{{ active_count }} tareas activas</p>
    <div class="task-list" id="task-list">
      {% for task in all_tasks %}
        {% assign is_archived = false %}{% if forloop.index0 >= active_count %}{% assign is_archived = true %}{% endif %}
        {% assign task_tags = task.tags | join: ' ' %}{% assign task_search = task.title | append: ' ' | append: task.id | append: ' ' | append: task.descripcion | append: ' ' | append: task_tags | downcase %}
        <details class="task" id="task-{{ task.id | escape }}{% if is_archived %}-archive{% endif %}" data-task-id="{{ task.id | escape }}" data-status="{{ task.estado | escape }}" data-archived="{{ is_archived }}" data-deps="{{ task.blocked_by | join: ',' | escape }}" data-search="{{ task_search | escape }}" {% if is_archived %}hidden{% endif %}>
          <summary><span class="task-id">#{{ task.id | escape }}</span><span class="task-name">{{ task.title | default: task.descripcion | escape }}</span><span class="task-status">{{ task.estado | default: 'Sin estado' | escape }}</span>{% if is_archived %}<span class="archive-badge">Archivada</span>{% endif %}<span class="expand" aria-hidden="true">+</span></summary>
          <div class="task-detail"><p>{{ task.descripcion | default: 'Sin descripción.' | escape }}</p>
            <div class="task-meta"><span><strong>Prioridad:</strong> {{ task.prioridad | default: 'Sin definir' | escape }}</span><span><strong>Asignación:</strong> {% if task.asignados.size > 0 %}{{ task.asignados | join: ', ' | escape }}{% else %}Sin asignar{% endif %}</span><span><strong>Dependencias:</strong> {% if task.blocked_by.size > 0 %}{{ task.blocked_by | join: ', ' | escape }}{% else %}Ninguna declarada{% endif %}</span></div>
            {% if task.acceptance_criteria and task.acceptance_criteria != empty %}<div class="criteria"><strong>Criterios de aceptación</strong><p>{{ task.acceptance_criteria | escape | newline_to_br }}</p></div>{% endif %}
            {% if task.subtasks.size > 0 %}<div class="subtasks"><strong>Subtareas</strong><ul>{% for subtask in task.subtasks %}<li><span aria-label="{% if subtask.done %}Completada{% else %}Pendiente{% endif %}">{% if subtask.done %}✓{% else %}○{% endif %}</span> {{ subtask.text | escape }}</li>{% endfor %}</ul></div>{% endif %}
            {% if task.external_links.size > 0 %}<div class="references"><strong>Referencias</strong><ul>{% for link in task.external_links %}{% assign link_scheme = link.url | slice: 0, 8 | downcase %}{% if link_scheme == 'https://' %}<li><a href="{{ link.url | escape }}" rel="noopener noreferrer">{{ link.label | default: 'Referencia' | escape }} ↗</a></li>{% endif %}{% endfor %}</ul></div>{% endif %}
            {% if task.tags.size > 0 %}<div class="tags" aria-label="Etiquetas">{% for tag in task.tags %}<span>{{ tag | escape }}</span>{% endfor %}</div>{% endif %}
          </div>
        </details>
      {% endfor %}
    </div>
    <p id="no-results" class="empty" hidden>No hay tareas que coincidan con los filtros.</p>
  </section>
</main>
<footer class="footer"><span>HYPENOSYS / HAIS</span><span>Panel estático · datos del repositorio · sin proveedor de IA</span><a href="{{ '/dashboard.html' | relative_url }}">Abrir tablero ↗</a></footer>

