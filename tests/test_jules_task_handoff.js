// Dashboard → Jules → Claude handoff and supervision contract (no external API calls).
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const read = rel => fs.readFileSync(path.join(root,rel),'utf8');
const auth = read('assets/javascript/jules-panel-auth.js');
const panel = read('pages/jules-panel.html');
const dashboard = read('dashboard.html');
const kanban = read('assets/javascript/kanban-ui.js');
const neural = read('assets/javascript/jules-panel-neural.js');
const core = read('assets/javascript/neural-chat-core.js');
const standalone = read('assets/javascript/neural-chat-jules.js');
const selectorSource = auth.slice(auth.indexOf('window.resizeJulesDraftTextarea ='),auth.indexOf('window.handleUrlParams ='));
assert.ok(selectorSource.length > 2500);
assert.match(dashboard, /window\._openTaskInJules/);
// The dashboard robot must enter Claude first, never create a Jules task.
assert.match(kanban, /window\._openTaskInClaude\(taskData\)/);
assert.doesNotMatch(kanban, /window\._openTaskInJules\(taskData\)/);
assert.match(panel, /id="opt-supervised"/);
assert.match(auth,/requirePlanApproval: isReview \|\| isSupervised/);
assert.match(auth,/window\.JulesPanelState\._handoffBranchBlocked/);
assert.match(neural,/window\.prepareSelectedJulesForClaude/);
assert.match(neural,/window\.prepareSelectedClaudeForJules/);
assert.match(neural,/window\.setJulesComposerDraft/);
assert.match(core,/fromJules \? 'user'/);
assert.match(standalone,/claude_conversation_id/);
assert.match(standalone,/linked_jules_session_id/);
assert.match(auth,/const handoffClaudeId = options\.fromChat\s*\? window\.currentJulesPanelSessionId\s*:\s*pendingClaudeId/,
    'chat launch must prefer the currently visible Claude conversation over stale pending handoff state');
assert.match(neural,/if \(unique\.length === 0\)[\s\S]*setJulesHistoryState\('empty'\)/,
    'a fresh Jules session with no activities must render a clean waiting state');

function makeContext(withLinkedSession) {
    const storage=new Map();
    const task={id:42,title:'Implementar módulo',repo:'hypenosys/hypenosys.github.io',rama:'develop',descripcion:'Dos párrafos\n\nmás contexto'};
    const area={value:'',scrollHeight:290,style:{},classList:{add(){},remove(){}}};
    const select={value:'main',disabled:false,dataset:{repo:'hypenosys/hypenosys.github.io'},options:[{value:'main'},{value:'develop'}],
      dispatchEvent(){state.activeBranch=this.value;}};
    const launch={disabled:false,title:''};
    const classes={add(){},remove(){}};
    const elements={
        'session-prompt':area,'branch-sel':select,'launch-btn':launch,
        'opt-review':{classList:{add(){},remove(){}}},
        'opt-auto':{classList:{add(){},remove(){}}},
        'opt-supervised':{classList:{add(){},remove(){}}},
        'neural-session-banner':{classList:classes},
        'neural-banner-task':{textContent:'',classList:classes},
        'v2-chat-input':{value:'',dispatchEvent(){}}
    };
    const state={activeBranch:'main'};
    const calls={sends:0,views:[],linked:[],drafts:[],loaded:[],selectedRepo:[],remoteCalls:0};
    const context={
        console,Date,JSON,Event:class {constructor(type){this.type=type;}},
        setTimeout:()=>{}, 
        localStorage:{
            getItem:k=>storage.has(k)?storage.get(k):null,
            setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)
        },
        document:{getElementById:k=>elements[k]||null},
        $:k=>elements[k]||null,
        switchView:mode=>calls.views.push(mode),
        showToast:()=>{},
        showTaskContextInChat:()=>{}
    };
    context.window=context;
    context.JulesPanelState=state;
    context.NeuralWorkspaceState={activeJulesSessionId:null};
    context.julesPanelSessions=withLinkedSession?[{id:'claude-1',messages:[]}]:[];
    context.julesSessionsCache=[];
    context.getCanonicalRepoName=repo=>String(repo||'').replace(/^sources\/github\//,'').toLowerCase();
    context.resolveJulesTaskBranch=(hint,branches)=>{
        const raw=String(hint||'').trim();
        return branches.includes(raw)?raw:(branches.includes(raw.match(/\(([^()]+)\)$/)?.[1])?raw.match(/\(([^()]+)\)$/)[1]:'');
    };
    context.selectRepo=async repo=>{
        calls.selectedRepo.push(repo);
        select.dataset.repo=repo;
        select.disabled=false;
        state.activeRepo='sources/github/'+repo;
    };
    context.julesApi={
        getSession:async sid=>{
            calls.remoteCalls++;
            return {name:sid,state:'AWAITING_USER_FEEDBACK',
                sourceContext:{source:'sources/github/hypenosys/hypenosys.github.io',githubRepoContext:{startingBranch:'develop'}}};
        },
        sendMessage:async()=>{calls.sends++;throw Error('Must not send automatically');}
    };
    context.linkClaudeToJulesTask=(...args)=>calls.linked.push(args);
    context.loadJulesPanelSession=id=>calls.loaded.push(id);
    context.setNeuralWorkspaceMode=mode=>{context.currentSendMode=mode;};
    context.setJulesComposerDraft=(mode,text)=>calls.drafts.push([mode,text]);
    vm.createContext(context);
    vm.runInContext(selectorSource,context);
    return {context,storage,task,area,select,launch,calls,state};
}

(async()=>{
    const handoff=makeContext(false);
    await handoff.context.prefillTaskFromHandoff(handoff.task,{source:'dashboard',intent:'new-task'});
    assert.equal(handoff.calls.sends,0);
    assert.deepEqual(handoff.calls.selectedRepo,['hypenosys/hypenosys.github.io']);
    assert.equal(handoff.select.value,'develop');
    assert.equal(handoff.state.activeBranch,'develop');
    assert.equal(handoff.launch.disabled,false);
    assert.match(handoff.area.value,/Dos párrafos\n\nmás contexto/);
    assert.ok(handoff.area.style.height.endsWith('px'));
    assert.equal(handoff.storage.get('hy_handoff_autolink'),'true');
    assert.equal(handoff.calls.views.at(-1),'neural');

    const existing=makeContext(true);
    const payload={claude_conversation_id:'claude-1',linked_jules_session_id:'jules-123',source_task:existing.task,
      claude_response:'Por favor revisa este código\n\n1. Segunda línea',timestamp:Date.now()};
    existing.storage.set('jules_task_payload',JSON.stringify(payload));
    await existing.context.prefillTaskFromHandoff(existing.task,{source:'claude-chat'});
    assert.equal(existing.calls.remoteCalls,1);
    assert.equal(existing.calls.sends,0);
    assert.equal(existing.calls.views.at(-1),'chat');
    assert.deepEqual(existing.calls.linked[0],['claude-1','jules-123','jules-123']);
    assert.equal(existing.calls.drafts[0][0],'jules');
    assert.match(existing.calls.drafts[0][1],/RESPUESTA DE CLAUDE/);
    assert.equal(existing.context.NeuralWorkspaceState.activeJulesSessionId,'jules-123');
    assert.equal(existing.storage.get('jules_task_payload'),undefined);

    const labeled=makeContext(false);
    labeled.task.rama='Desarrollo (develop)';
    await labeled.context.prefillTaskFromHandoff(labeled.task,{source:'dashboard',intent:'new-task'});
    assert.equal(labeled.select.value,'develop','human label must resolve to GitHub branch');
    assert.equal(labeled.launch.disabled,false);

    const withoutRepo=makeContext(false);
    withoutRepo.storage.set('jules_task_payload',JSON.stringify({claude_response:'Primera consulta',timestamp:Date.now()}));
    await withoutRepo.context.prefillTaskFromHandoff(null,{source:'claude-chat'});
    assert.equal(withoutRepo.context.JulesPanelState._handoffRepoUnconfirmed,true,
        'no-task Claude handoffs cannot silently reuse another repository');
    assert.equal(withoutRepo.calls.sends,0);

    const noLink=makeContext(false);
    noLink.storage.set('hy_neural_session_id','stale-global-session');
    await noLink.context.prefillTaskFromHandoff(noLink.task,{source:'dashboard',intent:'new-task'});
    assert.equal(noLink.calls.remoteCalls,0,'stale global sessions cannot receive handoff');
    assert.equal(noLink.calls.sends,0);
    console.log('Task handoff tests passed: explicit draft, awaited repository, branch selection, linked chat, no silent sends');
})().catch(error=>{console.error(error);process.exitCode=1;});
