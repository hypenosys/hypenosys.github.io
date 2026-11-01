'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../assets/javascript/jules-task-supervisor.js'),'utf8');
const status={textContent:''};
const log=[];
let approval=false,activeWorkspace='hypenosys';
const savedTask={id:72,titulo:'Corregir Panel Jules',organizationId:'hypenosys',
    estado:'WORKING',jules_session:{session_id:'js-123'}};
const store=new Map([['hy_neural_task_context',JSON.stringify(savedTask)]]);
const context={
    console,JSON,document:{getElementById:id=>id==='jules-task-supervisor-status'?status:null},
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,v)=>store.set(key,v),removeItem:key=>store.delete(key)},
    NeuralWorkspaceState:{activeJulesSessionId:'js-123'},
    githubApi:{
        getActiveWorkspace:()=>activeWorkspace,
        archiveTask:async id=>log.push(['archive',id])
    },
    taskOps:{
        getAllTasks:async()=>[savedTask],
        updateTask:async(id,delta)=>log.push(['update',id,delta])
    },
    julesApi:{getSession:async()=>({state:'AWAITING_PLAN_APPROVAL'})},
    refreshDashboard:async()=>{},
    confirm:()=>approval,
    prompt:()=>null
};
context.window=context;
vm.createContext(context);
vm.runInContext(script,context);
(async()=>{
    assert.equal(log.length,0,'initialization must be read-only');
    await context.JulesTaskSupervisor.review();
    assert.match(status.textContent,/espera aprobación humana/);
    assert.equal(log.length,0,'review must be read-only');
    await context.JulesTaskSupervisor.applyStatus('BLOCKED');
    assert.equal(log.length,0,'declined state change must not write');
    approval=true;
    await context.JulesTaskSupervisor.applyStatus('BLOCKED');
    assert.equal(log.length,1);
    assert.equal(log[0][1],72);
    assert.equal(log[0][2].estado,'BLOCKED');
    activeWorkspace='otro-workspace';
    await context.JulesTaskSupervisor.archive();
    assert.equal(log.length,1,'cannot archive in wrong workspace');
    activeWorkspace='hypenosys';
    context.NeuralWorkspaceState.activeJulesSessionId='different-session';
    await context.JulesTaskSupervisor.archive();
    assert.equal(log.length,1,'cannot archive when linked Jules session mismatches');
    context.NeuralWorkspaceState.activeJulesSessionId='js-123';
    await context.JulesTaskSupervisor.archive();
    assert.equal(log.length,2);
    assert.deepEqual(log[1],['archive',72]);

    // Lifecycle transitions require fresh Jules status and explicit approval.
    store.set('hy_neural_task_context',JSON.stringify(savedTask));
    context.NeuralWorkspaceState.activeJulesSessionId='js-123';
    context.julesApi.getSession=async()=>({name:'sessions/js-123',state:'COMPLETED'});
    approval=false;
    await context.JulesTaskSupervisor.applySuggestedLifecycle();
    assert.equal(log.length,2,'no change without lifecycle approval');
    approval=true;
    await context.JulesTaskSupervisor.applySuggestedLifecycle();
    assert.equal(log.length,3);
    assert.equal(log[2][2].estado,'OK','COMPLETED uses the canonical completed Kanban state');
    context.julesApi.getSession=async()=>({name:'sessions/js-123',state:'IN_PROGRESS'});
    savedTask.blocked_by=[88];
    await context.JulesTaskSupervisor.applySuggestedLifecycle();
    assert.equal(log.length,3,'unresolved blockers prevent moving to WORKING');

    // Automatic completion only applies to the exact task/session pair, once.
    const supervisor=context.JulesTaskSupervisor;
    const completed={name:'sessions/js-123',state:'COMPLETED'};
    approval=false;
    savedTask.blocked_by=[];
    assert.equal(await supervisor.syncCompletedFromJules('js-123',{...completed,state:'IN_PROGRESS'}),false);
    assert.equal(log.length,3,'unfinished sessions cannot complete tasks');
    assert.equal(await supervisor.syncCompletedFromJules('other-session',{name:'sessions/other-session',state:'COMPLETED'}),false);
    assert.equal(await supervisor.syncCompletedFromJules('js-123',{name:'sessions/other-session',state:'COMPLETED'}),false);
    assert.equal(log.length,3,'mismatched requested or returned sessions cannot complete tasks');
    const association=savedTask.jules_session;
    savedTask.jules_session=null;
    assert.equal(await supervisor.syncCompletedFromJules('js-123',completed),false);
    assert.equal(log.length,3,'automatic completion cannot create a missing task/session association');
    savedTask.jules_session=association;
    activeWorkspace='otro-workspace';
    assert.equal(await supervisor.syncCompletedFromJules('js-123',completed),false);
    assert.equal(log.length,3,'automatic completion respects workspace isolation');
    activeWorkspace='hypenosys';
    assert.equal(await supervisor.syncCompletedFromJules('sessions/js-123',completed),true);
    assert.equal(log.length,4);
    assert.equal(log[3][2].estado,'OK');
    assert.equal(log[3][2].jules_session.status,'COMPLETED');
    assert.equal(JSON.parse(store.get('hy_neural_task_context')).estado,'OK');
    assert.equal(await supervisor.syncCompletedFromJules('js-123',completed),true);
    assert.equal(log.length,4,'repeated completion notifications are idempotent');
    store.delete('hy_jules_task_synced_completed_js-123');
    savedTask.estado='OK';
    assert.equal(await supervisor.syncCompletedFromJules('js-123',completed),true);
    assert.equal(log.length,4,'already-completed tasks are not rewritten');

    console.log('HAIS supervisor: manual approval, canonical OK completion, session/workspace isolation and idempotence passed');
})().catch(e=>{console.error(e);process.exitCode=1});

