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
    console.log('HAIS task supervisor approval, organization isolation and linked session checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
