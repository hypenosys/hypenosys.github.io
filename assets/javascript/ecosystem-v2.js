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
    const grid=el('div','eco-grid');const active=tasks.filter(t=>!done.has(state(t))&&state(t)!=='OBSOLETE');
    const blockers=active.filter(t=>blocked(t).length>0||state(t)==='BLOCKED');
    const reviewing=tasks.filter(t=>/REVIEW|VALIDACION/i.test(state(t))||t.jules_loop_estado==='esperando_validacion');
    grid.append(cardKpi('Tareas activas',active.length,'Solo workspace '+workspace),cardKpi('Bloqueadas',blockers.length,'Dependencias o estado BLOCKED'),cardKpi('En revisión',reviewing.length,'Estados visibles en tareas'),cardKpi('Recuento total',tasks.length,'Actualizado '+stamp(verifiedAt)));root.append(grid);
    const c=article('Trabajo prioritario');list(c,active.sort((a,b)=>(['Critical','Major','Medium','Minor'].indexOf(a.prioridad)+4)%4-( ['Critical','Major','Medium','Minor'].indexOf(b.prioridad)+4)%4).slice(0,20),(c,t)=>linkableTask(c,t,blocked(t).length?'Bloqueada por '+blocked(t).join(', '):'Prioridad '+(t.prioridad||'N/D')),'No hay tareas activas en el workspace.');
    const n=article('Agentes y telemetría');para(n,'El Dashboard existente gestiona las sesiones Claude/Jules. El backend unificado de ejecuciones aún no está conectado: no se muestran agentes online ficticios.');n.append(htmlLink('/jules-panel/','Abrir Jules Panel'));
  }
  function renderFlow(){
    const c=article('Selecciona una tarea');
    const input=el('select','eco-filter');input.setAttribute('aria-label','Seleccionar tarea');
    tasks.forEach(t=>{const o=el('option',null,('#'+t.id+' · '+label(t)).slice(0,145));o.value=String(t.id);input.append(o);});
    c.append(input);const timeline=article('Línea de eventos verificados');
    if(!tasks.length){noData(timeline,'No hay tareas cargadas.');return;}
    function draw(t){timeline.replaceChildren(el('h2',null,'Línea de eventos · #'+t.id));const points=[];
      points.push({when:t.created_at||t.fecha||null,text:'Tarea registrada · estado '+state(t)});
      (t.change_log||[]).filter(e=>e.timestamp).forEach(e=>points.push({when:e.timestamp,text:'Cambio '+String(e.field||'')+' · '+String(e.new_value||'').slice(0,100)}));
      const sess=t.jules_session||null;if(sess)points.push({when:sess.updated_at||null,text:'Sesión Jules vinculada · '+String(sess.session_id||t.jules_session_id||'N/D').slice(0,100)});
      const pr=t.pull_request_url||sess?.pr_url||sess?.pull_request_url||t.pr_url;
      if(pr)points.push({when:null,text:'Referencia PR: '+String(pr).slice(0,140)});
      const vertical=el('div','eco-timeline');points.sort((a,b)=>new Date(a.when||0)-new Date(b.when||0)).forEach(e=>{const d=el('div');d.append(el('div',null,e.text),el('small','eco-small',stamp(e.when)));vertical.append(d);});timeline.append(vertical);
      para(timeline,'Los estados de CI, merge o aprobaciones solo pueden confirmarse mediante su proveedor. La presencia de una URL no confirma merge.');}
    input.addEventListener('change',()=>draw(tasks.find(t=>String(t.id)===input.value)||tasks[0]));draw(tasks[0]);
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
    const n=article('TC Projects');
    para(n,'Los proyectos TC se consultan desde /api/projects en TC con una sesión autorizada. No se importan automáticamente ni se concede acceso al vincularlos.');
    n.append(htmlLink('https://tc.hypenosys.com/dashboard/files','Abrir archivos y proyectos en TC'));
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
    if(!api?.validateToken||!window.taskOps?.getAllTasks) {status.textContent='El conector GitHub no está disponible. Vuelve al Dashboard y comprueba tu sesión.';status.dataset.state='error';return;}
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
