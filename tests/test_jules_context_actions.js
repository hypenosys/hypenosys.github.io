// Browser-agnostic contract: contextual routing in Jules Panel, without real API calls.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const base = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(base,'assets/javascript/jules-panel-neural.js'),'utf8');
const page = fs.readFileSync(path.join(base,'pages/jules-panel.html'),'utf8');
const start = source.indexOf('window._selectedJulesActivityKeys =');
const end = source.indexOf('window.renderChatV2Messages = function()',start);
assert.ok(start >= 0 && end > start);
const sub = source.slice(start,end);
assert.doesNotMatch(source,/aria-label="Seleccionar mensaje"/);
assert.doesNotMatch(source,/aria-label="Seleccionar actividad Jules"/);
assert.match(source, /window\.capturePanelTextSelection/);
assert.match(source, /window\.routePanelQuote/);
assert.match(source, /data-jules-activity-index/);
assert.match(source, /data-panel-message-index/);
assert.match(page, /id="claude-selected-toolbar" style="display:none/);
assert.match(page, /id="jules-selected-toolbar" style="display:none/);

const drafts = [], modes=[], views=[];
const session = { id:'claude-1',messages:[{ role:'assistant', content:'Important diagnostic. Leave the production config unchanged.' }],
    metadata:{linkedJulesTaskId:'jules-123'} };
const activity = {name:'sessions/jules-123/activities/1',createTime:'2026-11-01T11:00:00Z',
    agentMessaged:{agentMessage:'Jules has completed initial research, awaiting user input.'} };
const toolbar = () => ({style:{},textContent:''});
const nodes = {'jules-selected-toolbar':toolbar(),'claude-selected-toolbar':toolbar(),
    'jules-selection-count':toolbar(),'claude-selection-count':toolbar()};
let selectionText = 'Important diagnostic';
const ctx = { console,
    document:{getElementById:id=>nodes[id]||null,querySelector:()=>null,querySelectorAll:()=>[]},
    getSelection:()=>({anchorNode:{},focusNode:{},toString:()=>selectionText}),
    showToast:()=>{},switchView:view=>views.push(view),
    setNeuralWorkspaceMode:mode=>modes.push(mode),
    setJulesComposerDraft:(mode,text)=>drafts.push({mode,text}),
    resolveLinkedJulesId:()=> 'jules-123',
    julesPanelSessions:[session],currentJulesPanelSessionId:'claude-1',
    lastNormalizedList:[activity],
    NeuralWorkspaceState:{activeMode:'claude'},
    $:()=>null
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(sub,ctx);
ctx._julesRenderedActivityRefs=[activity];

const surface = {contains:()=>true};
const mousedown={target:{closest:()=>surface}};
ctx.capturePanelTextSelection(mousedown,'claude',0);
ctx.routePanelQuote({stopPropagation(){}},'claude',0,'jules');
assert.equal(drafts.length,1);
assert.equal(drafts[0].mode,'jules');
assert.match(drafts[0].text,/Important diagnostic/);
assert.doesNotMatch(drafts[0].text,/Leave the production config/);
assert.equal(modes.at(-1),'jules');
assert.equal(views.at(-1),'chat');

selectionText = '';
ctx.routePanelQuote(null,'jules',0,'claude');
assert.equal(drafts.length,2);
assert.equal(drafts[1].mode,'claude');
assert.match(drafts[1].text,/awaiting user input/);

ctx.getSelection = ()=>null;
const shiftClick = {shiftKey:true,target:{closest:()=>null},preventDefault(){}};
ctx.handlePanelSelectionClick(shiftClick,'claude',0);
assert.equal(ctx._selectedClaudeMessageKeys.size,1);
assert.equal(nodes['claude-selected-toolbar'].style.display,'flex');
ctx.handlePanelSelectionClick(shiftClick,'claude',0);
assert.equal(ctx._selectedClaudeMessageKeys.size,0);
assert.equal(nodes['claude-selected-toolbar'].style.display,'none');
ctx.handlePanelSelectionClick(shiftClick,'jules',0);
assert.equal(ctx._selectedJulesActivityKeys.size,1);
assert.equal(nodes['jules-selected-toolbar'].style.display,'flex');
ctx.clearPanelMessageSelection('jules');
assert.equal(nodes['jules-selected-toolbar'].style.display,'none');
console.log('Jules contextual UI: highlighted text, whole messages, Claude/Jules recipients and Shift+click selection passed');
