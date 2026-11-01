'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
const read = rel => fs.readFileSync(path.join(root,rel),'utf8');

const orchestrator = read('assets/javascript/hypenosys-task-orchestrator.js');
const claudePage = read('pages/claude-chat.html');
const send = read('assets/javascript/neural-chat-send.js');
const auth = read('assets/javascript/jules-panel-auth.js');
const bridge = read('assets/javascript/jules-claude-bridge.js');
const supervisor = read('assets/javascript/jules-task-supervisor.js');
const panel = read('pages/jules-panel.html');

assert.match(orchestrator,/hy_task_orchestrator_v1/);
assert.match(orchestrator,/currentTaskId/);
assert.match(orchestrator,/blocked_by/);
assert.match(orchestrator,/DONE_STATES/);
assert.match(orchestrator,/estado:'Working'/);
assert.match(orchestrator,/\/chat\/neural\/\?from=orchestrator/);
assert.match(orchestrator,/handleTaskCompleted/);
assert.match(orchestrator,/enqueueReady/);
assert.match(orchestrator,/data-orch-up/);
assert.match(orchestrator,/data-orch-remove/);

assert.match(claudePage,/fromOrchestrator/);
assert.match(claudePage,/hy_orchestrator_claude_sent_/);
assert.match(claudePage,/window\.sendMessage\(\)/);

assert.match(send,/phase === 'claude-running'/);
assert.match(send,/handoffClaudeToJules/);
assert.match(send,/handoff-jules/);

assert.match(auth,/orchestratorState\.phase === 'handoff-jules'/);
assert.match(auth,/orchestrator: true/);
assert.match(auth,/jules-running/);

assert.match(bridge,/orchestratorAuthorized/);
assert.match(bridge,/skipConfirm/);

assert.match(supervisor,/HypenosysTaskOrchestrator.*handleTaskCompleted/s);
assert.match(panel,/id="hypenosys-task-orchestrator"/);
assert.match(panel,/hypenosys-task-orchestrator\.js/);

console.log('Hypenosys task orchestrator contract OK');
