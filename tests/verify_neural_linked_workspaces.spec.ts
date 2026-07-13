import { test, expect } from '@playwright/test';

test('Verify Neural Linked Workspaces Birectional Integration and Invariants', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1024 });

  // Listen to console and errors
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Add init script to mock APIs before page load
  await page.addInitScript(() => {
    // Setup fetch interception
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
        const urlStr = String(url);
        if (urlStr.includes('api.github.com')) {
            if (urlStr.includes('/user')) {
                return new Response(JSON.stringify({ login: 'mockuser', name: 'Mock User', avatar_url: '' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('jules.googleapis.com')) {
            if (urlStr.includes('/activities')) {
                return new Response(JSON.stringify({
                    activities: [
                        {
                            id: 'act-jules-a',
                            createTime: "2026-07-12T13:40:00.000Z",
                            originator: 'agent',
                            description: 'Activities of Jules A',
                            agentMessaged: { agentMessage: 'He analizado la rama y estoy trabajando en la tarea.' }
                        }
                    ]
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (urlStr.match(/\/sessions\/[^/]+$/)) {
                return new Response(JSON.stringify({
                    name: 'sessions/js_test_a',
                    state: 'RUNNING',
                    prompt: 'Mock Task Title A'
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
    };
  });

  // 1. Visit index page to set up localStorage
  await page.goto('http://localhost:4000/');
  await page.evaluate(() => {
    localStorage.setItem('github_token', 'fake-token');
    localStorage.setItem('jules_api_key', 'fake-jules-key');
    localStorage.setItem('hypenosys_neural_workspace_mode', 'claude');

    // Seed mock sessions
    const sessions = [
      {
        id: 'session_claude_a',
        title: 'Claude Conversation A',
        messages: [
          { role: 'user', content: 'Help me with A', timestamp: Date.now() - 5000 },
          { role: 'assistant', content: 'Yes, A', timestamp: Date.now() }
        ],
        createdAt: new Date().toISOString(),
        metadata: {
          linkedJulesTaskId: 'js_test_a',
          linkedJulesTaskTitle: 'Mock Task Title A'
        }
      },
      {
        id: 'session_claude_b',
        title: 'Claude Conversation B',
        messages: [
          { role: 'user', content: 'Help me with B', timestamp: Date.now() - 5000 },
          { role: 'assistant', content: 'Yes, B', timestamp: Date.now() }
        ],
        createdAt: new Date().toISOString(),
        metadata: {
          linkedJulesTaskId: 'js_test_b',
          linkedJulesTaskTitle: 'Mock Task Title B'
        }
      }
    ];

    // Seed Jules sessions cache
    const julesCache = [
      {
        name: 'sessions/js_test_a',
        title: 'Mock Task Title A',
        state: 'RUNNING',
        prompt: 'Mock Task Title A',
        sourceContext: { source: 'sources/github/mockuser/mockrepo' }
      },
      {
        name: 'sessions/js_test_b',
        title: 'Mock Task Title B',
        state: 'RUNNING',
        prompt: 'Mock Task Title B',
        sourceContext: { source: 'sources/github/mockuser/mockrepo' }
      }
    ];

    localStorage.setItem('claude_chat_sessions', JSON.stringify(sessions));
    localStorage.setItem('hy_active_claude_session_id', 'session_claude_a');
    localStorage.setItem('hy_neural_session_id', 'js_test_a');
    localStorage.setItem('jules_sessions_cache', JSON.stringify(julesCache));
  });

  // 2. Go to the jules-panel page
  await page.goto('http://localhost:4000/jules-panel/');

  // Bypass Auth
  await page.evaluate(() => {
    if (window.githubApi) {
      window.githubApi.validateToken = async () => {
        return { valid: true, user: { login: 'mockuser', name: 'Mock User', avatar_url: '' } };
      };
    }
    if (window.forceOpenPanel) window.forceOpenPanel();
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      overlay.style.display = 'none';
    }
    document.getElementById('app-root')?.classList.remove('locked');
  });

  // Switch to Neural view
  const chatLink = page.locator('.hnav-link[data-view="chat"]');
  await chatLink.click();

  // 3. Verify Claude A ↔ Jules A linked navigation (Claude -> Jules)
  const tabClaude = page.locator('#neural-tab-claude');
  const tabJules = page.locator('#neural-tab-jules');
  await expect(tabClaude).toHaveAttribute('aria-selected', 'true');

  // Verify Claude A is selected
  const stateClaudeId = await page.evaluate(() => window.NeuralWorkspaceState.activeClaudeConversationId);
  expect(stateClaudeId).toBe('session_claude_a');

  // Click Ver en Jules button in the premium bar
  const btnViewInJules = page.locator('#btn-view-in-jules');
  await expect(btnViewInJules).toBeVisible();
  await btnViewInJules.click();

  // Mode should change to Jules, active Claude ID remains Claude A, active Jules ID is Jules A
  await expect(tabJules).toHaveAttribute('aria-selected', 'true');
  const afterSwitchState = await page.evaluate(() => window.NeuralWorkspaceState);
  expect(afterSwitchState.activeMode).toBe('jules');
  expect(afterSwitchState.activeClaudeConversationId).toBe('session_claude_a');
  expect(afterSwitchState.activeJulesSessionId).toBe('js_test_a');

  // 4. Verify linked navigation Jules -> Claude
  const btnViewInClaude = page.locator('#btn-view-in-claude');
  await expect(btnViewInClaude).toBeVisible();
  await btnViewInClaude.click();

  // Mode should switch back to Claude, selecting exact linked conversation Claude A
  await expect(tabClaude).toHaveAttribute('aria-selected', 'true');
  const afterSwitchBackState = await page.evaluate(() => window.NeuralWorkspaceState);
  expect(afterSwitchBackState.activeMode).toBe('claude');
  expect(afterSwitchBackState.activeClaudeConversationId).toBe('session_claude_a');

  // 5. Prohibit crossed selections (Reconciliation)
  // Manually force an inconsistent/crossed state in localStorage and trigger hydration/switching
  await page.evaluate(() => {
    localStorage.setItem('hy_active_claude_session_id', 'session_claude_a');
    localStorage.setItem('hy_neural_session_id', 'js_test_b'); // Crossed: Claude A is linked to js_test_a, but we force B
    window.restoreNeuralWorkspaceState();
  });
  const reconciledJulesId = await page.evaluate(() => window.NeuralWorkspaceState.activeJulesSessionId);
  expect(reconciledJulesId).toBe('js_test_a'); // It must automatically repair the crossed session ID!

  // 6. Verify LINKED_SESSION_MISMATCH safety check in composer
  await page.evaluate(() => {
    window.setNeuralWorkspaceMode('jules');
    window.NeuralWorkspaceState.activeJulesSessionId = 'js_test_b'; // Force a mismatch in memory
  });
  // Typing into composer and attempting to send
  const composerInput = page.locator('#v2-chat-input');
  await composerInput.fill('Run build');
  const sendBtn = page.locator('#v2-send-btn');
  await sendBtn.click();

  // Send should be blocked, state reconciled back to A, message not sent
  const postMismatchState = await page.evaluate(() => window.NeuralWorkspaceState);
  expect(postMismatchState.activeJulesSessionId).toBe('js_test_a'); // Reconciled back to js_test_a!

  // 7. Verify unlinking from Claude side
  await tabClaude.click();
  const btnUnlink = page.locator('#btn-unlink-jules-task');
  await expect(btnUnlink).toBeVisible();
  await btnUnlink.click();

  // Connection should break: both sessions remain intact, but relation cleared (Claude Only)
  const linkingBar = page.locator('#claude-linking-bar');
  await expect(linkingBar).toContainText('Claude Only');

  const afterUnlinkState = await page.evaluate(() => window.NeuralWorkspaceState);
  expect(afterUnlinkState.activeJulesSessionId).toBeNull();
  expect(afterUnlinkState.activeClaudeConversationId).toBe('session_claude_a');

  // Verify reload restores valid pair
  await page.reload();
  await page.evaluate(() => {
    if (window.forceOpenPanel) window.forceOpenPanel();
  });
  const reloadedState = await page.evaluate(() => window.NeuralWorkspaceState);
  expect(reloadedState.activeClaudeConversationId).toBe('session_claude_a');
  expect(reloadedState.activeJulesSessionId).toBeNull();

  // Save screenshot
  await page.screenshot({ path: 'verification/verify_neural_linked_workspaces.png' });
  console.log('SUCCESS: Bi-directional linked workspaces invariants verified.');
});
