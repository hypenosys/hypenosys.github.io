'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'assets/javascript/jules-panel-neural.js'),'utf8');
const from=src.indexOf('window.sendNeuralMessage = async function() {');
const to=src.indexOf('window.approvePlan = async function(',from);
assert.ok(from>0&&to>from);
const code=src.slice(from,to);
const repository=fs.readFileSync(path.join(root,'assets/javascript/jules-panel-repo.js'),'utf8');
const helperStart=repository.indexOf('window.resolveJulesTaskBranch = function(');
const helperEnd=repository.indexOf('window._loadBranchesRequestId',helperStart);
assert.ok(helperStart>=0&&helperEnd>helperStart);
const contextBranch={window:{}};
vm.createContext(contextBranch);
vm.runInContext(repository.slice(helperStart,helperEnd),contextBranch);
const choose=contextBranch.window.resolveJulesTaskBranch;
assert.equal(choose('Desarrollo (develop)',['master','develop']),'develop');
assert.equal(choose('develop',['master','develop']),'develop');
assert.equal(choose('release/production',['master','develop']),'');
assert.equal(choose('Producción (master)',['master','develop']),'master');

function fixture({initialLink=null,created='new-sid',sendFails=false,launchFails=false}={}){
 const input={value:'Primera instrucción\n\nDetalle',dispatchEvent(){}};
 const session={id:'claude-1',messages:[],metadata:initialLink?{linkedJulesTaskId:initialLink}:{}};
 const calls={create:[],send:[],remote:[],saved:0,refresh:[],toast:[]};
 const elements={
   'v2-chat-input':input,
   'branch-sel':{disabled:false,dataset:{repo:'hypenosys/hais'},value:'develop'},
   'session-prompt':{value:'',scrollHeight:260,style:{}}
 };
 const store=new Map([['hy_neural_task_context',JSON.stringify({id:25,repo:'hypenosys/HAIS',rama:'Desarrollo (develop)'})]]);
 const obj={
   console,Event:class{constructor(type){this.type=type;}},Date,
   document:{getElementById:k=>elements[k]||null},
   $:k=>elements[k]||null,
   localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
   currentJulesPanelSessionId:'claude-1',
   julesPanelSessions:[session],
   JulesPanelState:{activeRepo:'sources/github/hypenosys/HAIS',activeBranch:'develop',_handoffBranchBlocked:false},
   _julesNeuralDrafts:{jules:''},
   getCanonicalRepoName:s=>String(s||'').replace(/^sources\/github\//,'').toLowerCase(),
   resolveLinkedJulesId:s=>s.metadata?.linkedJulesTaskId||null,
   switchView:()=>{},resizeJulesDraftTextarea:()=>{},
   showToast:(s)=>calls.toast.push(s),addTel:()=>{},
   renderChatV2Messages:()=>{},saveJulesPanelSessions:()=>{calls.saved++;},
   julesApi:{
     getSession:async id=>{calls.remote.push(id);return {name:id,state:'AWAITING_USER_FEEDBACK',sourceContext:{source:'sources/github/hypenosys/HAIS'}};},
     sendMessage:async (id,prompt)=>{calls.send.push([id,prompt]);if(sendFails)throw new Error('API error');return {};}
   },
   launchSession:async options=>{calls.create.push(options);if(launchFails)return null;session.metadata.linkedJulesTaskId=created;return created;},
   refreshActivities:async id=>calls.refresh.push(id)
 };
 obj.window=obj;
 vm.createContext(obj);
 vm.runInContext(code,obj);
 return {obj,input,session,calls};
}
(async()=>{
 const fresh=fixture();
 assert.equal(await fresh.obj.sendNeuralMessage(),true);
 assert.equal(fresh.calls.create.length,1,'first message must create exactly once');
 assert.equal(fresh.calls.send.length,0,'first message must not be sent again');
 assert.equal(fresh.calls.create[0].promptOverride,'Primera instrucción\n\nDetalle');
 assert.equal(fresh.calls.create[0].fromChat,true);
 assert.equal(fresh.input.value,'');
 fresh.input.value='Segundo mensaje';
 assert.equal(await fresh.obj.sendNeuralMessage(),true);
 assert.equal(fresh.calls.create.length,1);
 assert.deepEqual(fresh.calls.send[0],['sessions/new-sid','Segundo mensaje']);
 assert.equal(fresh.session.messages.length,1);
 assert.equal(fresh.session.messages[0].source,'human_to_jules');

 const failed=fixture({launchFails:true});
 assert.equal(await failed.obj.sendNeuralMessage(),false);
 assert.equal(failed.input.value,'Primera instrucción\n\nDetalle');
 assert.equal(failed.calls.send.length,0);
 const blocked=fixture({initialLink:'existing-sid',sendFails:true});
 assert.equal(await blocked.obj.sendNeuralMessage(),false);
 assert.equal(blocked.input.value,'Primera instrucción\n\nDetalle','retain draft after upstream failure');
 assert.equal(blocked.session.messages.length,0,'do not log unsent messages');
 const stale=fixture();
 stale.obj.localStorage.setItem('hy_neural_session_id','old-global-id');
 await stale.obj.sendNeuralMessage();
 assert.equal(stale.calls.send.length,0,'global stale Jules ID must never receive first message');
 console.log('Jules first-message create / subsequent send / stale-link / failure recovery / branch-label tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
