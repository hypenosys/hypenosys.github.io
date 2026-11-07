/* Ecosystem 2.0: read-only first surfaces over existing Hypenosys sources.
 * Never render cross-workspace data without verified GitHub auth and membership.
 * Separate pending connector capabilities from observed event/task facts.
 */
(function () {
  'use strict';
  const done = new Set(['OK','DONE','COMPLETED','CLOSED','FIXED','RESOLVED']);
  const descriptions={mission:'Centro de operaciones',flow:'Recorrido y evidencia',approvals:'Revisiones y aprobaciones',agents:'Agentes y ejecuciones',knowledge:'Relaciones de conocimiento',organizations:'Workspace y membresía',sandbox:'Experimentos y aislamiento',observatory:'Telemetría operacional'};
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const root=document.getElementById('eco-content');
  const status=document.getElementById('eco-loading');
  const moduleName=document.body.dataset.ecoModule;
  if(!root||!descriptions[moduleName])return;
  document.querySelectorAll('[data-eco-nav]').forEach(a=>{if(a.dataset.ecoNav===moduleName)a.setAttribute('aria-current','page');});
  let tasks=[],workspace='',user=null,meta=null,verifiedAt='';
  const state=t=>String(t.estado||t.status||'Pending').trim().toUpperCase();
  const label=t=>String(t.title||t.titulo||'Sin título');
  const htmlLink=(url,title)=>{const a=el('a',null,title);a.href=url;return a;};
  const taskLink=t=>htmlLink('/dashboard.html',('#'+t.id+' · '+label(t)).slice(0,150));
  function article(title){const c=el('section','eco-card');c.append(el('h2',null,title));root.append(c);return c;}
  function para(parent,value,cls){parent.append(el('p',cls||'eco-small',value));}
  function row(parent,left,right){const r=el('div','eco-row');r.append(typeof left==='string'?el('span',null,left):left,typeof right==='string'?el('span','eco-tag',right):right);parent.append(r);return r;}
  function cardKpi(title,value,detail){const c=el('div','eco-card');c.append(el('div','eco-small',title),el('strong','eco-kpi',value));para(c,detail);return c;}
  function noData(c,text){c.append(el('p','eco-empty',text));}
  const blocked=t=>(t.blocked_by||[]).filter(id=>!done.has(state(tasks.find(x=>String(x.id)===String(id))||{})));
  function list(c,items,render,empty) {
    if(!items.length){noData(c,empty);return;}
    items.forEach(item=>render(c,item));
  }
  function stamp(value) {if(!value)return 'N/D';const d=new Date(value);return Number.isNaN(d.valueOf())?String(value).slice(0,24):d.toLocaleString('es-ES');}
  function linkableTask(c,t,metaInfo){const r=el('div','eco-row');const b=el('div');b.append(taskLink(t));para(b,metaInfo||('Estado: '+state(t)+' · '+(t.repository||'Repositorio no indicado')));r.append(b,el('span','eco-tag',state(t)));c.append(r);}
  function renderMission(){
    const model=window.HypenOSModel;
    const stats=model.summary(tasks);
    const grid=el('div','eco-grid eco-summary');
    [
      ['Pendientes',stats.pending,'Sin comenzar o ToDo'],
      ['En ejecución',stats.working,'Working / In Progress'],
      ['En revisión',stats.review,'In Review / Validación'],
      ['Bloqueadas',stats.blocked,'Dependencias sin cerrar'],
      ['Completadas',stats.done,'Estados de cierre registrados']
    ].forEach(([heading,value,detail])=>grid.append(cardKpi(heading,value,detail)));
    root.append(grid);

    const actions=el('div','eco-actions eco-quick-nav');
    [
      ['/control/task-flow/','Abrir Task Flow'],
      ['/control/approvals/','Revisar aprobaciones'],
      ['/control/agents/','Agent Studio'],
      ['https://dev.tc.hypenosys.com/dashboard/files','Proyectos TC (sesión propia)']
    ].forEach(([url,title])=>{
      const a=htmlLink(url,title);a.className='eco-btn secondary';actions.append(a);
    });
    root.append(actions);

    const cols=el('div','eco-two-column');
    const queue=el('section','eco-card');
    queue.append(el('h2',null,'Cola priorizada · origen Hypenosys'));
    para(queue,'Tareas del workspace autorizado, ordenadas por prioridad. Las dependencias pueden impedir su ejecución.');
    const priorityTasks=model.ordered(tasks.filter(t=>!model.isDone(t)&&!model.isObsolete(t)));
    list(queue,priorityTasks.slice(0,16),(parent,t)=>{
      const dep=model.unresolvedDependencies(t,tasks);
      const state=model.stage(t,tasks);
      const meta='Prioridad: '+(t.prioridad||'N/D')+' · '+(t.repository||'Sin repositorio')+(dep.length?' · Espera #'+dep.join(', #'):'');
      const rowEl=el('div','eco-row');
      const detail=el('div','eco-task-summary');const link=htmlLink('/control/task-flow/?task='+encodeURIComponent(t.id),'#'+t.id+' · '+label(t));
      detail.append(link);para(detail,meta);rowEl.append(detail,el('span','eco-tag'+(state==='blocked'?' warn':''),state==='blocked'?'Bloqueada':state==='working'?'En curso':state==='review'?'En revisión':'Pendiente'));parent.append(rowEl);
    },'No hay tareas pendientes.');
    const activity=el('section','eco-card');activity.append(el('h2',null,'Actividad registrada'));
    para(activity,'Últimos cambios incluidos en el historial de tareas de GitHub; aún no es el ledger transaccional de TC.');
    const recent=model.activity(tasks,14);
    list(activity,recent,(parent,e)=>{
      const rowEl=el('div','eco-row');
      const block=el('div');block.append(htmlLink('/control/task-flow/?task='+encodeURIComponent(e.taskId),'#'+e.taskId+' · '+e.label));
      para(block,e.actor+' · '+(e.detail||'Sin detalle')+' · '+stamp(e.when));rowEl.append(block);parent.append(rowEl);
    },'No existen entradas de cambio con fecha verificable.');
    cols.append(queue,activity);root.append(cols);

    const gap=article('Integridad y estado de las conexiones');
    const inferred=tasks.filter(t=>t.jules_session||t.jules_session_id).length;
    row(gap,'Sesiones Jules referenciadas en tareas',String(inferred));
    row(gap,'Ledger de operaciones de TC','No conectado');
    row(gap,'Telemetría HAIS en tiempo real','No conectada');
    para(gap,'Las referencias de sesión no prueban que un agente esté online. Los estados remotos requieren respuesta firmada de su proveedor.');
  }
  function renderFlow(){
    const model=window.HypenOSModel;
    const controls=article('Flujo de tareas del workspace · '+workspace);
    para(controls,'Kanban e historial basados en tareas reales de Hypenosys. Las operaciones de TC, PR y agentes requieren reconciliación externa.');
    const form=el('div','eco-actions');
    const search=el('input','eco-filter');
    search.type='search';search.placeholder='Buscar título o número';search.setAttribute('aria-label','Filtrar tareas del workspace');
    const filter=el('select','eco-filter');filter.setAttribute('aria-label','Filtrar etapa');
    [['all','Todas las etapas'],['pending','Pendientes'],['working','En ejecución'],['review','En revisión'],['blocked','Bloqueadas'],['done','Completadas']]
      .forEach(([value,text])=>{const option=el('option',null,text);option.value=value;filter.append(option);});
    form.append(search,filter);controls.append(form);

    const board=el('section','eco-board');board.setAttribute('aria-label','Kanban de tareas');
    root.append(board);
    const inspector=article('Inspector de tarea y evidencias');

    const header=el('div','eco-actions');
    const picker=el('select','eco-filter');picker.setAttribute('aria-label','Seleccionar tarea para inspección');
    model.ordered(tasks).forEach(t=>{
      const o=el('option',null,('#'+t.id+' · '+label(t)).slice(0,145));o.value=String(t.id);picker.append(o);
    });header.append(picker);inspector.append(header);
    const detail=el('div','eco-task-detail');inspector.append(detail);
    if(!tasks.length){noData(board,'Este workspace no tiene tareas consultables.');noData(detail,'No hay tarea seleccionada.');return;}

    const query=new URLSearchParams(window.location.search).get('task');
    let selected=tasks.find(t=>String(t.id)===query)||tasks[0];
    picker.value=String(selected.id);
    function selectTask(t){
      selected=t;picker.value=String(t.id);
      const u=new URL(window.location.href);u.searchParams.set('task',String(t.id));
      window.history.replaceState(null,'',u.pathname+u.search+u.hash);
      drawInspector();
      drawBoard();
    }
    function drawBoard(){
      board.replaceChildren();
      const q=search.value.trim().toLocaleLowerCase();
      const flt=filter.value;
      const visible=model.ordered(tasks.filter(t=>(!q||(String(t.id)+' '+label(t)).toLocaleLowerCase().includes(q))&&(flt==='all'||model.stage(t,tasks)===flt)));
      [
        ['pending','Pendientes'],['working','En ejecución'],['review','En revisión'],
        ['blocked','Bloqueadas'],['done','Completadas']
      ].forEach(([key,name])=>{
        const section=el('div','eco-board-column');
        const items=visible.filter(t=>model.stage(t,tasks)===key);
        section.append(el('h3',null,name+' · '+items.length));
        if(!items.length)section.append(el('p','eco-small','Sin tareas'));
        items.forEach(t=>{
          const button=el('button','eco-task'+(String(selected.id)===String(t.id)?' selected':''));button.type='button';
          button.setAttribute('aria-pressed',String(selected.id)===String(t.id)?'true':'false');
          button.append(el('strong',null,'#'+t.id+' · '+label(t)));
          button.append(el('span','eco-small','Prioridad '+(t.prioridad||'N/D')+' · '+(t.asignados||[]).join(', ')));
          const unresolved=model.unresolvedDependencies(t,tasks);
          if(unresolved.length)button.append(el('span','eco-tag warn','Espera #'+unresolved.join(', #')));
          button.addEventListener('click',()=>selectTask(t));
          section.append(button);
        });board.append(section);
      });
    }
    function drawInspector(){
      detail.replaceChildren();
      detail.append(el('h2',null,'#'+selected.id+' · '+label(selected)));
      const banner=el('div','eco-actions');
      banner.append(el('span','eco-tag','Estado: '+model.status(selected)),el('span','eco-tag','Prioridad: '+(selected.prioridad||'N/D')));
      detail.append(banner);
      row(detail,'Repositorio',selected.repository||'No registrado');
      row(detail,'Asignados',(selected.asignados||[]).join(', ')||'No registrados');
      row(detail,'Organización',workspace);
      const deps=model.unresolvedDependencies(selected,tasks);
      row(detail,'Dependencias pendientes',deps.length?'#'+deps.join(', #'):'Ninguna pendiente según datos disponibles');
      if(deps.length){
        const links=el('div','eco-actions');
        deps.forEach(id=>{
          const found=tasks.find(t=>String(t.id)===id);
          if(found){const link=el('button','eco-btn secondary','#'+id+' · '+label(found));link.type='button';link.addEventListener('click',()=>selectTask(found));links.append(link);}
        });
        if(links.childNodes.length)detail.append(links);
      }
      const actions=el('div','eco-actions');actions.append(htmlLink('/dashboard.html','Abrir Dashboard'));
      model.taskArtifacts(selected).forEach(a=>{
        const link=htmlLink(a.url,a.label);link.target='_blank';link.rel='noopener noreferrer';actions.append(link);
      });
      detail.append(actions);
      const events=model.taskEvents(selected);
      const timeline=el('section');
      timeline.append(el('h3',null,'Historial de la tarea · '+events.length+' entradas declaradas'));
      const vertical=el('div','eco-timeline');
      list(vertical,events,(parent,e)=>{
        const node=el('div');node.append(el('strong',null,e.label+' · '+e.actor),el('small','eco-small',stamp(e.when)));
        if(e.detail)para(node,e.detail);parent.append(node);
      },'No hay eventos/metadata con timestamp en esta tarea.');
      timeline.append(vertical);detail.append(timeline);
      para(detail,'Historial originado en campos change_log, comments y fechas de la tarea. No garantiza auditoría completa; PR referenciadas no implican merge ni CI superada.');
      const related=el('div','eco-actions');
      related.append(htmlLink('https://dev.tc.hypenosys.com/dashboard/history','Abrir historial TC (sesión aparte)'));
      related.append(htmlLink('/control/mission/','Mission Control'));
      detail.append(related);
    }
    picker.addEventListener('change',()=>selectTask(tasks.find(t=>String(t.id)===picker.value)||tasks[0]));
    search.addEventListener('input',drawBoard);filter.addEventListener('change',drawBoard);
    drawBoard();drawInspector();
  }
  function renderApprovals(){
    const c=article('Tareas que requieren revisión');
    const items=tasks.filter(t=>['IN REVIEW','REVIEW','?'].includes(state(t))||t.jules_loop_estado==='esperando_validacion'||t.supervision_mode==='human');
    list(c,items,(c,t)=>linkableTask(c,t,'Revisión requerida según estado de la tarea. Abrir herramienta existente para actuar.'),'No hay tareas con estados de revisión conocidos. Eso no implica que no existan aprobaciones externas.');
    const other=article('Decisiones protegidas');
    para(other,'La API ApprovalRequest server-side aún no existe. Por seguridad no se ofrece aprobar o fusionar desde esta vista; se revisan permisos y evidencia en el flujo original.');
    other.append(htmlLink('/jules-panel/','Abrir herramienta de revisión actual'));
  }
  function renderAgents(){
    const c=article('Proveedores observados en tareas');
    const sess=tasks.filter(t=>t.jules_session||t.jules_session_id);
    row(c,'Sesiones Jules referenciadas por tareas',String(sess.length));
    const orch=tasks.filter(t=>t.orchestrator?.active);row(c,'Tareas con orquestación registrada',String(orch.length));
    const n=article('Catálogo y configuración');
    para(n,'El Agent Studio canónico depende del endpoint de agentes de TC y del gateway con permisos. No se presenta Cog ni HAIS como conectados sin comprobarlos.');
    n.append(htmlLink('/chat/neural/','Abrir Neural Chat'));
    list(c,sess.slice(0,15),(c,t)=>linkableTask(c,t,'Jules: '+String(t.jules_session?.session_id||t.jules_session_id||'N/D')),'Sin referencias de sesión Jules en las tareas del workspace.');
  }
  function renderKnowledge(){
    const c=article('Grafo de dependencias de tareas');
    const connected=tasks.filter(t=>(t.blocked_by||[]).length>0).slice(0,35);
    if(!connected.length){noData(c,'No hay aristas de dependencia para este workspace.');return;}
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 800 340');svg.setAttribute('class','eco-svg');svg.setAttribute('role','img');svg.setAttribute('aria-label','Dependencias entre tareas; detalles accesibles debajo.');
    const universe=[...new Set(connected.flatMap(t=>[String(t.id),...(t.blocked_by||[]).map(String)]))].slice(0,50);
    const coords=new Map(universe.map((id,i)=>[id,{x:40+(i%9)*88,y:35+Math.floor(i/9)*56}]));
    function svgNode(name,attrs,text){const e=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
    for(const t of connected){const from=coords.get(String(t.id));if(!from)continue;for(const dep of t.blocked_by||[]){const target=coords.get(String(dep));if(target)svg.append(svgNode('line',{x1:from.x,y1:from.y,x2:target.x,y2:target.y,stroke:'#665388','stroke-width':1.4}));}}
    universe.forEach(id=>{const p=coords.get(id);svg.append(svgNode('circle',{cx:p.x,cy:p.y,r:16,fill:'#3b2b57',stroke:'#bd93f9'}),svgNode('text',{x:p.x,y:p.y+4,fill:'#fff','text-anchor':'middle','font-size':9},'#'+id));});
    c.append(svg);para(c,'Este grafo representa exclusivamente dependencias explícitas de tareas del workspace. Las citas RAG y relaciones TC requieren el bridge ACL-first.');
    connected.forEach(t=>row(c,taskLink(t),'Bloqueada por '+(t.blocked_by||[]).map(id=>'#'+id).join(', ')));
  }
  async function renderOrganizations(){
    const c=article('Workspace verificado');row(c,'Organización',workspace);row(c,'Usuario autenticado',user.login);
    row(c,'Miembros en el metadata autorizado',String(meta?.members?.length??'N/D'));
    const m=article('Participación y roles');list(m,(meta?.members||[]).slice(0,75),(m,x)=>row(m,String(x.handle||x),Array.isArray(x.roles)&&x.roles.length?x.roles.join(', '):'Rol no indicado'),'No se pudo verificar la lista de miembros.');
    if(workspace==='the-machine'){
      const pilot=article('THE MACHINE · integración TC / GitHub');
      row(pilot,'Repositorio canónico','hypenosys/the_machine');
      row(pilot,'Rama principal','master');
      row(pilot,'Tareas','GitHub Issues · fuente canónica de solo lectura');
      row(pilot,'Editor / historial TC','Vinculación explícita en TC; sin escritura Git ni ledger unificado');
      row(pilot,'Forgejo','Espejo pendiente de verificación');
      para(pilot,'Fase 0: abre un proyecto TC existente, verifica los miembros aceptados y confirma la vinculación desde el panel de repositorio Git. No se crea otro proyecto ni se duplican tareas. Se necesita iniciar sesión en TC por separado.');
      const links=el('div','eco-actions');
      links.append(htmlLink('https://dev.tc.hypenosys.com/dashboard/files','Abrir proyectos en TC (dev)'));
      links.append(htmlLink('https://github.com/hypenosys/the_machine','Explorar repositorio GitHub'));
      links.append(htmlLink('https://github.com/hypenosys/the_machine/issues','Consultar Issues originales'));
      pilot.append(links);
      para(pilot,'Estado de TC en vivo: no consultado desde este panel. Los permisos y el vínculo se verifican en el servidor TC antes de mostrar sus datos.');
    }
    const n=article('TC Projects');
    para(n,'Los proyectos TC se consultan desde /api/projects en TC con una sesión autorizada. No se importan automáticamente ni se concede acceso al vincularlos.');
    n.append(htmlLink('https://dev.tc.hypenosys.com/dashboard/files','Abrir archivos y proyectos en TC (dev)'));
  }
  function renderSandbox(){
    const c=article('Experimentos existentes');
    const ss=tasks.filter(t=>/sandbox|cognito|codex|experiment/i.test([label(t),t.descripcion,(t.tags||[]).join(' ')].join(' ')));
    list(c,ss,(c,t)=>linkableTask(c,t,'Estado verificado: '+state(t)),'No hay experimentos etiquetados en el workspace.');
    const n=article('Ejecutor seguro');
    para(n,'No existe aquí un runner aislado verificado. Para ejecutar código se requiere gateway autenticado, allowlist export, recursos limitados y revisión previa. No se ejecutará código en el navegador.');
  }
  function renderObservatory(){
    const c=article('Métricas derivadas de tareas · '+workspace);
    const active=tasks.filter(t=>!done.has(state(t))&&state(t)!=='OBSOLETE');
    const grid=el('div','eco-grid');grid.append(cardKpi('En progreso',active.filter(t=>state(t)==='WORKING').length,'Estado registrado'),cardKpi('Bloqueadas',active.filter(t=>state(t)==='BLOCKED'||blocked(t).length>0).length,'Estado/dependencias'),cardKpi('En revisión',active.filter(t=>/REVIEW/.test(state(t))).length,'Estado registrado'));c.append(grid);
    const n=article('Stress Index / HAIS');
    noData(n,'N/D · No se ha conectado una fuente firmada de Stress Index para este workspace. Ninguna cifra se genera por aproximación.');
    para(n,'El panel de datos de mercados y el terminal PAPER son sistemas separados de la telemetría operativa.');
    n.append(htmlLink('/hais/operar/','Abrir terminal HAIS PAPER'));
  }
  const renderers={mission:renderMission,flow:renderFlow,approvals:renderApprovals,agents:renderAgents,knowledge:renderKnowledge,organizations:renderOrganizations,sandbox:renderSandbox,observatory:renderObservatory};
  async function load(){
    status.hidden=false;status.textContent='Verificando identidad y acceso al workspace…';status.dataset.state='loading';root.hidden=true;root.replaceChildren();
    const api=window.githubApi;
    if(!api?.validateToken||!window.taskOps?.getAllTasks||!window.HypenOSModel) {status.textContent='La sesión o el modelo HypenOS no está disponible. Vuelve al Dashboard o recarga la página.';status.dataset.state='error';return;}
    try {
      const login=await api.validateToken();
      if(!login.valid||!login.user?.isTeamMember)throw Error('Acceso denegado: inicia sesión en el Dashboard con una cuenta autorizada.');
      user=login.user;workspace=api.getActiveWorkspace();
      if(!workspace||workspace==='personal')throw Error('Selecciona una organización del equipo en Dashboard para consultar estas vistas.');
      if(!/^[a-z0-9-]+$/.test(workspace))throw Error('Workspace no válido.');
      const result=await api.fetchOrgMetaWithDualRead(workspace);
      meta=result?.content;
      if(!meta||!Array.isArray(meta.members)||!meta.members.some(m=>String(m?.handle||m).toLowerCase()===user.login.toLowerCase()))throw Error('Acceso denegado: la membresía de este workspace no está verificada.');
      const all=await window.taskOps.getAllTasks();
      tasks=(Array.isArray(all)?all:[]).filter(t=>(t.organizationId||'hypenosys')===workspace);
      verifiedAt=new Date().toISOString();
      document.getElementById('eco-workspace').textContent=workspace;
      renderers[moduleName]();
      root.hidden=false;status.hidden=true;
    }catch(error){status.dataset.state='error';status.textContent=String(error?.message||'No se pudo cargar la vista.');}
  }
  document.getElementById('eco-reload').addEventListener('click',()=>{void load();});
  window.addEventListener('workspaceChanged',()=>{void load();});
  void load();
})();
