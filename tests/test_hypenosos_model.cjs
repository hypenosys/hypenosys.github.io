const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../assets/javascript/hypenosys-os-model.js');

const tasks=[
  {id:88,title:'Contracts',estado:'Pending',prioridad:'Critical',blocked_by:[],change_log:[
    {timestamp:'2026-11-06T10:00:00.000Z',author_login:'alex',field:'status',new_value:'Pending'}]},
  {id:90,title:'Mission Control',estado:'Working',prioridad:'Major',blocked_by:[88]},
  {id:91,title:'Task Flow',estado:'In Review',prioridad:'Critical',blocked_by:[]},
  {id:92,title:'Approvals',estado:'OK',prioridad:'Minor',blocked_by:[]},
  {id:93,title:'Other',estado:'Obsolete',prioridad:'Medium',blocked_by:[]},
  {id:94,title:'External blocked',estado:'Pending',prioridad:'Medium',blocked_by:[999]},
];
test('task status grouping never bypasses incomplete or missing dependencies',()=>{
  assert.equal(model.stage(tasks[1],tasks),'blocked');
  assert.deepEqual(model.unresolvedDependencies(tasks[5],tasks),['999']);
  assert.deepEqual(model.summary(tasks),{pending:1,working:0,review:1,blocked:2,done:1,obsolete:1});
});
test('dependency changes are reflected without duplicating tasks',()=>{
  const updated=tasks.map(t=>t.id===88?{...t,estado:'OK'}:t);
  assert.equal(model.stage(updated[1],updated),'working');
  assert.equal(tasks[0].estado,'Pending');
});
test('priorities and historical evidence remain deterministically ordered',()=>{
  assert.deepEqual(model.ordered([tasks[3],tasks[1],tasks[0]]).map(t=>t.id),[88,90,92]);
  assert.equal(model.activity(tasks,10).length,1);
  assert.deepEqual(model.taskEvents(tasks[0]).map(x=>x.kind),['change']);
});
test('a PR link is reference only and external/javascript links never become actions',()=>{
  assert.equal(model.safeArtifact('javascript:alert(1)'),null);
  assert.equal(model.safeArtifact('https://github.com.evil.test/hypenosys/repo/pull/22'),null);
  assert.equal(model.safeArtifact('https://github.com/hypenosys/test/pull/22'),'https://github.com/hypenosys/test/pull/22');
  const task={external_links:[
    {url:'https://github.com/hypenosys/test/pull/22'},
    {url:'https://github.com/hypenosys/test/pull/22'},
    {url:'https://github.com/hypenosys/test/blob/develop/README.md'},
  ]};
  assert.deepEqual(model.taskArtifacts(task).map(x=>x.label),['PR referenciada (merge no verificado)']);
});
test('comments and events are metadata; do not fabricate external confirmations',()=>{
  const sample={id:100,fecha:'2026-11-06',change_log:[
    {timestamp:'2026-11-06T12:00:00.000Z',field:'estado',old_value:'Pending',new_value:'Working',author_login:'axlfc'}],
    comments:[{timestamp:'2026-11-06T12:05:00.000Z',body:'Revisar CI',author_login:'axlfc'}]
  };
  const timeline=model.taskEvents(sample);
  assert.equal(timeline.length,3);
  assert.equal(timeline.at(-1).label,'Nota de tarea');
});
