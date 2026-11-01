/**
 * HAIS task supervisor. All GitHub writes require an explicit user confirmation.
 * Session output can only SUGGEST task status; it never edits organizational data.
 */
(function () {
  'use strict';
  let busy = false;
  const $ = id => document.getElementById(id);
  function message(text) {
    const el = $('jules-task-supervisor-status');
    if (el) el.textContent = text;
  }
  function taskContext() {
    try { return JSON.parse(localStorage.getItem('hy_neural_task_context') || 'null'); }
    catch { return null; }
  }
  function sameTask(a, b) {
    return String(a?.id || '') && String(a?.id) === String(b?.id);
  }
  async function loadTask() {
    const context = taskContext();
    if (!context?.id) throw new Error('Vincula una tarea del Dashboard antes de modificar su estado.');
    if (!window.githubApi?.getActiveWorkspace || !window.taskOps?.getAllTasks) {
      throw new Error('GitHub Task Ops no está disponible; vuelve a autenticarte.');
    }
    const workspace = window.githubApi.getActiveWorkspace();
    const tasks = await window.taskOps.getAllTasks();
    const task = (tasks || []).find(t => sameTask(t, context));
    if (!task) throw new Error('La tarea no existe en el workspace activo: ' + workspace + '.');
    if (task.organizationId && task.organizationId !== workspace) {
      throw new Error('La tarea pertenece a ' + task.organizationId + '; selecciona primero esa organización.');
    }
    const currentJules = String(window.NeuralWorkspaceState?.activeJulesSessionId || '').replace(/^sessions\//, '');
    const associated = String(task.jules_session?.session_id || '').replace(/^sessions\//, '');
    if (associated && currentJules && currentJules !== associated) {
      throw new Error('La tarea está asociada a otro Jules Session ID. Verifica el vínculo antes de editar.');
    }
    return { task, workspace };
  }

  async function applyStatus(status) {
    if (busy) return;
    if (!['WORKING','BLOCKED','REVIEW','DONE','TODO'].includes(status)) throw new Error('Estado no permitido.');
    busy = true;
    try {
      const {task, workspace} = await loadTask();
      if (!window.confirm('Actualizar tarea #' + task.id + ' en ' + workspace + ' a ' + status + '? La acción escribirá en GitHub.')) return;
      await window.taskOps.updateTask(task.id, {
        estado: status,
        updated_by_agent_supervisor: false
      });
      message('Actualizada tarea #' + task.id + ' a ' + status + '.');
      if (window.refreshDashboard) await window.refreshDashboard();
    } catch (error) { message('No se modificó ninguna tarea: ' + error.message); }
    finally { busy = false; }
  }

  async function editTask() {
    if (busy) return;
    busy = true;
    try {
      const {task, workspace} = await loadTask();
      const title = window.prompt('Editar título de tarea #' + task.id + ' (' + workspace + ')', task.titulo || task.title || '');
      if (title === null) return;
      const cleaned = title.trim();
      if (!cleaned || cleaned.length > 180) throw new Error('Título vacío o demasiado largo.');
      const description = window.prompt('Editar descripción (máximo 15.000 caracteres)', task.descripcion || task.description || '');
      if (description === null) return;
      if (description.length > 15000) throw new Error('La descripción excede el límite.');
      if (!window.confirm('Guardar los cambios en GitHub para tarea #' + task.id + '?')) return;
      await window.taskOps.updateTask(task.id, { titulo: cleaned, descripcion: description });
      const context = taskContext();
      if (sameTask(context, task)) localStorage.setItem('hy_neural_task_context', JSON.stringify({...context,titulo:cleaned,descripcion:description}));
      message('Cambios de tarea #' + task.id + ' guardados.');
      if (window.refreshDashboard) await window.refreshDashboard();
    } catch (error) { message('Edición cancelada: ' + error.message); }
    finally { busy = false; }
  }

  async function archive() {
    if (busy) return;
    busy = true;
    try {
      const {task,workspace} = await loadTask();
      if (!window.githubApi?.archiveTask) throw new Error('Archivador de GitHub no disponible.');
      if (!window.confirm('Mover tarea #' + task.id + ' del workspace ' + workspace + ' al CEMENTERIO (archivo)?')) return;
      await window.githubApi.archiveTask(task.id);
      message('Tarea #' + task.id + ' archivada en ' + workspace + '.');
      localStorage.removeItem('hy_neural_task_context');
      if (window.refreshDashboard) await window.refreshDashboard();
    } catch (error) { message('Archivo no realizado: ' + error.message); }
    finally { busy = false; }
  }

  async function review() {
    try {
      const {task} = await loadTask();
      const sid = String(window.NeuralWorkspaceState?.activeJulesSessionId || task.jules_session?.session_id || '').replace(/^sessions\//, '');
      if (!sid) { message('Tarea #' + task.id + ' vinculada. Sin sesión Jules para recomendar un estado.'); return; }
      const session = await window.julesApi.getSession('sessions/' + sid);
      const state = session?.state || 'desconocido';
      const suggestion = state === 'COMPLETED' ? 'REVIEW' :
        state === 'FAILED' ? 'BLOCKED' :
        ['PLANNING','IN_PROGRESS'].includes(state) ? 'WORKING' : null;
      message('Tarea #' + task.id + ' · Jules: ' + state +
        (state === 'AWAITING_PLAN_APPROVAL' ? ' · espera aprobación humana del plan' :
        state === 'AWAITING_USER_FEEDBACK' ? ' · espera feedback humano' :
        suggestion ? ' · propuesta: ' + suggestion + ' (aplica manualmente)' : ' · sin transición automática'));
    } catch (error) { message('Supervisor: ' + error.message); }
  }

  window.JulesTaskSupervisor = { review, applyStatus, editTask, archive };
  message('Supervisor de tareas: cambios solo bajo confirmación explícita.');
})();
