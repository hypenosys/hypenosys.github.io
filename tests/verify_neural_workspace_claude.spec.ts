import { test, expect } from '@playwright/test';

test('Verify Claude Workspace inside Neural view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1024 });

  // Mock APIs before page load
  await page.addInitScript(() => {
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
                return new Response(JSON.stringify({ activities: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
    };
  });

  // Setup localStorage prior to navigation
  await page.goto('http://localhost:4000/');
  await page.evaluate(() => {
    localStorage.setItem('github_token', 'fake-token');
    localStorage.setItem('jules_api_key', 'fake-jules-key');
    localStorage.setItem('hypenosys_neural_workspace_mode', 'claude');

    // Seed mock sessions
    const sessions = [
      {
        id: 'session_claude_1',
        title: 'Claude Chat Conversation 1',
        messages: [
          { role: 'user', content: 'Help me with something', timestamp: Date.now() - 5000 },
          { role: 'assistant', content: 'Sure, I can help.', timestamp: Date.now() }
        ],
        createdAt: new Date().toISOString(),
        metadata: {
          linkedJulesTaskId: 'jules_task_1',
          linkedJulesTaskTitle: 'Mock Task Title 1'
        }
      },
      {
        id: 'session_claude_2',
        title: 'Claude Chat Conversation 2',
        messages: [],
        createdAt: new Date().toISOString()
      }
    ];

    localStorage.setItem('claude_chat_sessions', JSON.stringify(sessions));
    localStorage.setItem('hy_active_claude_session_id', 'session_claude_1');
    localStorage.setItem('hy_neural_session_id', 'jules_task_1');
  });

  // Load Jules Panel page
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

  // 1. Verify top selector and Claude mode defaults
  const tabClaude = page.locator('#neural-tab-claude');
  const tabJules = page.locator('#neural-tab-jules');
  await expect(tabClaude).toBeVisible();
  await expect(tabJules).toBeVisible();

  await expect(tabClaude).toHaveAttribute('aria-selected', 'true');
  await expect(tabJules).toHaveAttribute('aria-selected', 'false');

  // 2. Verify sidebar list visibilities
  const claudeSidebarList = page.locator('#ng-chat-history');
  const julesSidebarList = page.locator('#ng-history');
  await expect(claudeSidebarList).toBeVisible();
  await expect(julesSidebarList).toBeHidden();

  // 3. Verify Claude workspace messages visible, Jules history container hidden
  const claudeChatMessages = page.locator('#v2-chat-messages');
  const julesHistoryContainer = page.locator('#jules-history-container');
  await expect(claudeChatMessages).toBeVisible();
  await expect(julesHistoryContainer).toBeHidden();

  // 4. Verify linking status bar in Claude workspace
  const linkingBar = page.locator('#claude-linking-bar');
  await expect(linkingBar).toBeVisible();
  await expect(linkingBar).toContainText('Claude + Jules');
  await expect(linkingBar).toContainText('jules_task_1');

  // 5. Verify composer placeholder
  const composerInput = page.locator('#v2-chat-input');
  await expect(composerInput).toHaveAttribute('placeholder', /Claude/i);

  // 6. Test tab switching from Claude to Jules
  await tabJules.click();
  await expect(tabClaude).toHaveAttribute('aria-selected', 'false');
  await expect(tabJules).toHaveAttribute('aria-selected', 'true');

  await expect(claudeSidebarList).toBeHidden();
  await expect(julesSidebarList).toBeVisible();
  await expect(claudeChatMessages).toBeHidden();
  await expect(julesHistoryContainer).toBeVisible();

  // 7. Symmetrical update check for header button "+ Nueva sesión"
  const newSessionBtn = page.locator('#hdr-new-btn');
  await expect(newSessionBtn).toContainText(/Jules/i);

  // Switch back to Claude tab
  await tabClaude.click();
  await expect(tabClaude).toHaveAttribute('aria-selected', 'true');
  await expect(newSessionBtn).toContainText(/conversación/i);

  // 8. Verify click on "+ Nueva conversación" creates and selects a new Claude session
  await newSessionBtn.click();
  await expect(claudeChatMessages).toBeVisible();

  // Verify linked Jules session is cleared (since new session has no link)
  await expect(linkingBar).toContainText('Claude Only');
  const stateJulesId = await page.evaluate(() => window.NeuralWorkspaceState.activeJulesSessionId);
  expect(stateJulesId).toBeNull();

  // Save screenshot
  await page.screenshot({ path: 'verification/verify_neural_workspace_claude.png' });
  console.log('SUCCESS: Claude Workspace and mode switching verified.');
});
