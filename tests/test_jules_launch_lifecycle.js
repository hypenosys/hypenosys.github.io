'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../assets/javascript/jules-panel-auth.js'),'utf8');
const start=code.indexOf('window.launchSession = async function(');
const end=code.indexOf('window.startJulesPolling = function()',start);
assert.ok(start>0&&end>start);
const method=code.slice(start,end);

function setup({active=0,blockedBy=[],blocked=false}={}){
    const task={id:25,title:'HAIS task',repo:'hypenosys/HAIS',rama:'Desarrollo (develop)',
        estado:blocked?'BLOCKED':'TODO',blocked_by:blockedBy};
    const local=new Map([
        ['hy_neural_task_context',JSON.stringify(task)],
        ['hypenosys_active_repo','hypenosys/HAIS']
    ]);
    const messages=[], payloads=[], updates=[], linked=[];
    const classes=active=>({contains:()=>active});
    const elements={
       'session-prompt':{value:'Initial Jules task',disabled:false,focus(){}},
       'branch-sel':{value:'develop',disabled:false,dataset:{repo:'hypenosys/hais'}},
       'launch-btn':{disabled:false,innerHTML:'Iniciar Ejecución'},
       'opt-auto':{classList:classes(false)},'opt-review':{classList:classes(false)},
       'opt-supervised':{classList:classes(true)},'opt-tests':{classList:classes(false)},
       'opt-branch':{classList:classes(false)}
    };
    const app={
       console,Date,JSON,window:null,$:key=>elements[key]||null,
       document:{getElementById:key=>elements[key]||null},
       localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)},
       JulesPanelState:{activeRepo:'sources/github/hypenosys/HAIS',activeBranch:'develop',
           linkedTaskId:25,_handoffBranchBlocked:false},
       NeuralWorkspaceState:{activeJulesSessionId:null},
       julesPanelSessions:[{id:'claude-1',messages:[]}],
       currentJulesPanelSessionId:'claude-1',
       julesSessionsCache:[],
       githubApi:{user:{login:'tester'}},user:{login:'tester'},
       getCanonicalRepoName:s=>String(s||'').replace(/^sources\/github\//,'').toLowerCase(),
       julesApi:{
           getSessions:async(pageSize,pageToken)=>({
               sessions:Array.from({length:active},(_,i)=>({name:'sessions/'+i,state:'IN_PROGRESS'})),
               nextPageToken:null
           }),
           createSession:async body=>{payloads.push(body);return{name:'sessions/first-001',state:'QUEUED'};}
       },
       taskOps:{
           getAllTasks:async()=>blockedBy.map(id=>({id,estado:'WORKING'})),
           updateTask:async(id,changes)=>{updates.push([id,changes]);}
       },
       showToast:t=>messages.push(t),addTel:()=>{},
       startNeuralPolling:()=>{},switchView:()=>{},setNeuralWorkspaceMode:()=>{},
       linkClaudeToJulesTask:(...a)=>linked.push(a),loadJulesPanelSession:()=>{},
       refreshDashboard:async()=>{},persistNeuralWorkspaceState:()=>{}
    };
    app.window=app;
    vm.createContext(app);
    vm.runInContext(method,app);
    return {app,elements,local,payloads,updates,messages,linked};
}
(async()=>{
    const happy=setup();
    const result=await happy.app.launchSession({promptOverride:'First instruction\n\nwith lines',fromChat:true});
    assert.equal(result,'first-001');
    assert.equal(happy.payloads.length,1);
    assert.equal(happy.payloads[0].sourceContext.githubRepoContext.startingBranch,'develop');
    assert.equal(happy.payloads[0].requirePlanApproval,true,'supervised plan approval enforced');
    assert.equal(happy.payloads[0].automationMode,undefined);
    assert.equal(happy.payloads[0].prompt.startsWith('First instruction\n\nwith lines'),true);
    assert.equal(happy.updates.length,1);
    assert.equal(happy.updates[0][1].estado,'WORKING');
    assert.equal(happy.updates[0][1].jules_session.session_id,'first-001');
    assert.equal(happy.linked.length,1);
    assert.equal(happy.app._julesLaunchInFlight,false);

    const cap=setup({active:3});
    assert.equal(await cap.app.launchSession({promptOverride:'Test'}),null);
    assert.equal(cap.payloads.length,0,'max 3 active Jules sessions');
    assert.ok(cap.messages.some(x=>String(x).includes('máximo 3')));
    assert.equal(cap.app._julesLaunchInFlight,false);

    const deps=setup({blockedBy:[44]});
    assert.equal(await deps.app.launchSession({promptOverride:'Test'}),null);
    assert.equal(deps.payloads.length,0,'unresolved dependencies block launch');
    assert.ok(deps.messages.some(x=>String(x).includes('dependencias')));

    console.log('Jules lifecycle: supervised first create, correct develop branch, max-3 cap, dependency blockers, task status sync passed');
})().catch(e=>{console.error(e);process.exitCode=1});
