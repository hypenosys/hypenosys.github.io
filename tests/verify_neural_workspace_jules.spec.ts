import { test, expect } from '@playwright/test';

test('Verify Jules Workspace inside Neural view', async ({ page }) => {
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
                return new Response(JSON.stringify({
                    activities: [
                        {
                            id: 'act-1',
                            createTime: "2026-07-12T13:40:00.000Z",
                            originator: 'agent',
                            description: 'Working...',
                            agentMessaged: { agentMessage: 'He analizado la rama y estoy trabajando en la tarea.' }
                        }
                    ]
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (urlStr.match(/\/sessions\/[^/]+$/)) {
                return new Response(JSON.stringify({
                    name: 'sessions/jules_task_1',
                    state: 'RUNNING',
                    prompt: 'Jules running task prompt'
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
    localStorage.setItem('hypenosys_neural_workspace_mode', 'jules');

    // Seed mock sessions
    const sessions = [
      {
        id: 'session_claude_1',
        title: 'Claude Chat Conversation 1',
        messages: [],
        createdAt: new Date().toISOString(),
        metadata: {
          linkedJulesTaskId: 'jules_task_1',
          linkedJulesTaskTitle: 'Jules running task prompt'
        }
      }
    ];

    // Seed Jules sessions cache
    const julesCache = [
      {
        name: 'sessions/jules_task_1',
        title: 'Jules running task prompt',
        state: 'RUNNING',
        prompt: 'Jules running task prompt',
        sourceContext: { source: 'sources/github/mockuser/mockrepo' }
      }
    ];

    localStorage.setItem('claude_chat_sessions', JSON.stringify(sessions));
    localStorage.setItem('hy_active_claude_session_id', 'session_claude_1');
    localStorage.setItem('hy_neural_session_id', 'jules_task_1');
    localStorage.setItem('jules_sessions_cache', JSON.stringify(julesCache));
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

  // 1. Verify JULES mode is active initially based on stored mode
  const tabJules = page.locator('#neural-tab-jules');
  await expect(tabJules).toHaveAttribute('aria-selected', 'true');

  // 2. Verify sidebar list visibilities - Jules History shown, Claude hidden
  const claudeSidebarList = page.locator('#ng-chat-history');
  const julesSidebarList = page.locator('#ng-history');
  await expect(claudeSidebarList).toBeHidden();
  await expect(julesSidebarList).toBeVisible();
  await expect(julesSidebarList).toContainText('JULES HISTORY');

  // 3. Verify task context header and jules history visible
  const taskContext = page.locator('#v2-task-context');
  const julesHistoryContainer = page.locator('#jules-history-container');
  await expect(taskContext).toBeVisible();
  await expect(julesHistoryContainer).toBeVisible();

  // 4. Verify inverse linking bar in Jules workspace
  const julesLinkingBar = page.locator('#jules-linking-bar');
  await expect(julesLinkingBar).toBeVisible();
  await expect(julesLinkingBar).toContainText('Claude + Jules');
  await expect(julesLinkingBar).toContainText('Claude Chat Conversation 1');

  // 5. Verify composer placeholder for Jules instruction
  const composerInput = page.locator('#v2-chat-input');
  await expect(composerInput).toHaveAttribute('placeholder', /Jules/i);

  // 6. Verify activities are rendered from mock API
  const julesHistory = page.locator('#neural-jules-history');
  await expect(julesHistory).toContainText('He analizado la rama');

  // Save screenshot
  await page.screenshot({ path: 'verification/verify_neural_workspace_jules.png' });
  console.log('SUCCESS: Jules Workspace verified.');
});
