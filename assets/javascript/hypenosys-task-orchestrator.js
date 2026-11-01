/**
 * Hypenosys Task Orchestrator
 * Sequential browser-side scheduler for the canonical Hypenosys task flow.
 */
(function () {
  'use strict';
  const STORAGE_KEY = 'hy_task_orchestrator_v1';
  const DONE_STATES = new Set(['OK','DONE','COMPLETED','FIXED','CLOSED','RESOLVED']);
  const QUEUEABLE_STATES = new Set(['BACKLOG','TODO','PENDING','WORKING']);
  const PRIORITY_RANK = { CRITICAL:0, MAJOR:1, HIGH:1, MEDIUM:2, MINOR:3, LOW:3, COSMETIC:4, TODO:5 };
  let busy = false;

  const defaults = () => ({ enabled:false, queue:[], currentTaskId:null, phase:'idle', lastError:'', updatedAt:new Date().toISOString() });
  const load = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return parsed && typeof parsed === 'object'
        ? { ...defaults(), ...parsed, queue:Array.isArray(parsed.queue) ? parsed.queue.map(String) : [] }
        : defaults();
    } catch { return defaults(); }
  };
  const save = state => {
    const next = { ...state, updatedAt:new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    render();
    window.dispatchEvent(new CustomEvent('hy:orchestrator-state', { detail:next }));
    return next;
  };
  const patch = partial => save({ ...load(), ...partial });
  const taskState = task => String(task?.estado || task?.status || '').trim().toUpperCase();
  const depsResolved = (task, allTasks) => {
    const blocked = Array.isArray(task?.blocked_by) ? task.blocked_by : [];
    return blocked.every(id => {
      const dep = (allTasks || []).find(t => String(t.id) === String(id));
      return !!dep && DONE_STATES.has(taskState(dep));
    });
  };
  const sortTasks = tasks => [...tasks].sort((a,b) => {
    const pa = PRIORITY_RANK[String(a.prioridad || a.priority || '').toUpperCase()] ?? 99;
    const pb = PRIORITY_RANK[String(b.prioridad || b.priority || '').toUpperCase()] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(a.created_at || a.fecha || a.updated_at || 0) - new Date(b.created_at || b.fecha || b.updated_at || 0);
  });
  const getTasks = async () => {
    if (!window.taskOps?.getAllTasks) throw new Error('Task Ops no está disponible.');
    return await window.taskOps.getAllTasks();
  };

  async function enqueueTask(taskId) {
    const id = String(taskId || '');
    const state = load();
    if (!id || state.queue.includes(id) || state.currentTaskId === id) return state;
    return save({ ...state, queue:[...state.queue,id] });
  }
  async function enqueueCurrent() {
    const task = JSON.parse(localStorage.getItem('hy_neural_task_context') || 'null');
    if (!task?.id) throw new Error('No hay una tarea Hypenosys activa.');
    return enqueueTask(task.id);
  }
  async function enqueueReady() {
    const tasks = await getTasks();
    const candidates = sortTasks((tasks || []).filter(task => QUEUEABLE_STATES.has(taskState(task)) && depsResolved(task,tasks)));
    const state = load();
    const queue = [...state.queue];
    for (const task of candidates) {
      const id = String(task.id);
      if (!queue.includes(id) && state.currentTaskId !== id) queue.push(id);
    }
    return save({ ...state, queue });
  }
  function remove(taskId) {
    const id = String(taskId);
    const state = load();
    return save({ ...state, queue:state.queue.filter(x => x !== id) });
  }
  function move(taskId, delta) {
    const id=String(taskId), state=load(), queue=[...state.queue], index=queue.indexOf(id);
    if (index < 0) return state;
    const target=Math.max(0,Math.min(queue.length-1,index+delta));
    if (target===index) return state;
    queue.splice(index,1); queue.splice(target,0,id);
    return save({ ...state, queue });
  }

  async function startNext() {
    if (busy) return false;
    const initial=load();
    if (!initial.enabled || initial.currentTaskId || !initial.queue.length) { render(); return false; }
    busy=true;
    try {
      const tasks=await getTasks();
      let selected=null, selectedId=null;
      for (const id of load().queue) {
        const task=(tasks||[]).find(t => String(t.id)===String(id));
        if (!task) { remove(id); continue; }
        const status=taskState(task);
        if (DONE_STATES.has(status)) { remove(id); continue; }
        if (!QUEUEABLE_STATES.has(status) || !depsResolved(task,tasks)) continue;
        selected=task; selectedId=String(id); break;
      }
      if (!selected) { patch({ lastError:'No hay tareas desbloqueadas en la cola.' }); return false; }

      save({ ...load(), currentTaskId:selectedId, phase:'claude', lastError:'' });
      if (taskState(selected) !== 'WORKING') {
        await window.taskOps.updateTask(selected.id,{ estado:'Working', orchestrator:{ active:true, started_at:new Date().toISOString() } });
        selected.estado='Working';
      }
      localStorage.setItem('hy_neural_task_context',JSON.stringify(selected));
      localStorage.setItem('hy_neural_active','true');
      localStorage.setItem('hy_neural_new_task_sent','true');
      localStorage.setItem('hy_neural_entry_point','orchestrator-claude');
      localStorage.setItem('hy_orchestrator_auto_task_id',selectedId);
      localStorage.removeItem('hy_neural_thread');
      window.taskEngine?.notifyUpdate?.();
      window.location.assign((window.SITE_BASEURL || '') + '/chat/neural/?from=orchestrator');
      return true;
    } catch (error) {
      patch({ lastError:error.message || String(error), phase:'error' });
      return false;
    } finally { busy=false; }
  }

  async function handleTaskCompleted(taskId) {
    const id=String(taskId || ''), state=load();
    const wasCurrent=state.currentTaskId===id;
    save({ ...state, queue:state.queue.filter(x => x!==id), currentTaskId:wasCurrent?null:state.currentTaskId, phase:wasCurrent?'idle':state.phase, lastError:'' });
    if (wasCurrent && state.enabled) setTimeout(() => { void startNext(); },1200);
  }
  const setPhase = phase => patch({ phase });
  const enable = () => { const state=load(); save({ ...state, enabled:true,lastError:'' }); setTimeout(() => void startNext(),250); };
  const disable = () => { const state=load(); save({ ...state, enabled:false, phase:state.currentTaskId?state.phase:'idle' }); };

  function render() {
    const root=document.getElementById('hypenosys-task-orchestrator');
    if (!root) return;
    const state=load();
    const queueRows=state.queue.length
      ? state.queue.map((id,index) =>
          '<div style="display:flex;align-items:center;gap:5px;padding:4px 0;border-top:1px solid rgba(189,147,249,.08)">'
          +'<span style="flex:1">#'+id+'</span>'
          +'<button class="btn btn-ghost btn-xs" data-orch-up="'+id+'" '+(index===0?'disabled':'')+' title="Mover arriba">↑</button>'
          +'<button class="btn btn-ghost btn-xs" data-orch-down="'+id+'" '+(index===state.queue.length-1?'disabled':'')+' title="Mover abajo">↓</button>'
          +'<button class="btn btn-ghost btn-xs" data-orch-remove="'+id+'" title="Quitar de la cola">×</button>'
          +'</div>').join('')
      : '<div style="color:#77718b">Cola vacía</div>';
    root.innerHTML='<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px">'
      +'<strong style="font-size:11px;color:#bd93f9">ORQUESTADOR</strong>'
      +'<span style="font-size:10px;color:'+(state.enabled?'#50fa7b':'#aaa1bd')+'">'+(state.enabled?'ACTIVO':'PAUSADO')+'</span></div>'
      +'<div style="font-size:11px;color:#d7d1e5;line-height:1.45;margin-bottom:8px">'
      +'<div>Actual: <strong>'+(state.currentTaskId?'#'+state.currentTaskId:'—')+'</strong> · fase: <strong>'+state.phase+'</strong></div>'
      +'<div style="margin-top:6px">'+queueRows+'</div>'
      +(state.lastError?'<div style="color:#ffb86c;margin-top:4px">'+String(state.lastError).replace(/[<>]/g,'')+'</div>':'')+'</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px">'
      +'<button class="btn btn-primary btn-xs" id="orchestrator-toggle">'+(state.enabled?'Pausar':'Activar')+'</button>'
      +'<button class="btn btn-ghost btn-xs" id="orchestrator-enqueue-current">Encolar actual</button>'
      +'<button class="btn btn-ghost btn-xs" id="orchestrator-enqueue-ready">Encolar desbloqueadas</button></div>';
    document.getElementById('orchestrator-toggle')?.addEventListener('click',()=>{
      if (load().enabled) disable();
      else if (window.confirm('¿Activar ejecución secuencial desatendida de la cola Hypenosys?')) enable();
    });
    document.getElementById('orchestrator-enqueue-current')?.addEventListener('click',()=>enqueueCurrent().catch(e=>patch({lastError:e.message})));
    document.getElementById('orchestrator-enqueue-ready')?.addEventListener('click',()=>enqueueReady().catch(e=>patch({lastError:e.message})));
    root.querySelectorAll('[data-orch-up]').forEach(btn => btn.addEventListener('click',()=>move(btn.dataset.orchUp,-1)));
    root.querySelectorAll('[data-orch-down]').forEach(btn => btn.addEventListener('click',()=>move(btn.dataset.orchDown,1)));
    root.querySelectorAll('[data-orch-remove]').forEach(btn => btn.addEventListener('click',()=>remove(btn.dataset.orchRemove)));
  }

  window.HypenosysTaskOrchestrator={ load,save,patch,enable,disable,enqueueTask,enqueueCurrent,enqueueReady,remove,move,startNext,handleTaskCompleted,setPhase,depsResolved,render,isEnabled:()=>!!load().enabled };
  document.addEventListener('DOMContentLoaded',render);
  window.addEventListener('storage',e=>{
    if(e.key===STORAGE_KEY) render();
    if(e.key==='hypenosys_tasks_updated' && load().enabled && !load().currentTaskId) {
      setTimeout(() => void startNext(),250);
    }
  });
})();