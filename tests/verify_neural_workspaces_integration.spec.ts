import { test, expect } from '@playwright/test';

test('Verify Complete Neural Claude/Jules Workspace Integration and Invariants (Cases A-F)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1024 });

  // Listen to console logs and page errors
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Add init script to mock APIs before page load
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
                            id: 'act-jules-1',
                            createTime: "2026-07-12T13:40:00.000Z",
                            originator: 'agent',
                            description: 'Activities of Jules 1',
                            agentMessaged: { agentMessage: 'Jules Agent processing...' }
                        }
                    ]
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (urlStr.match(/\/sessions\/[^/]+$/)) {
                return new Response(JSON.stringify({
                    name: 'sessions/jules_task_1',
                    state: 'RUNNING',
                    prompt: 'Mock Task Title 1'
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
        id: 'session_claude_1',
        title: 'Claude Conversation 1',
        messages: [
          { role: 'user', content: 'Message 1', timestamp: Date.now() - 5000 },
          { role: 'assistant', content: 'Response 1', timestamp: Date.now() }
        ],
        createdAt: new Date().toISOString(),
        metadata: {
          linkedJulesTaskId: 'jules_task_1',
          linkedJulesTaskTitle: 'Mock Task Title 1'
        }
      },
      {
        id: 'session_claude_unlinked',
        title: 'Claude Unlinked Conversation',
        messages: [
          { role: 'user', content: 'Hello', timestamp: Date.now() }
        ],
        createdAt: new Date().toISOString(),
        metadata: {} // Unlinked conversation
      }
    ];

    // Seed Jules sessions cache
    const julesCache = [
      {
        name: 'sessions/jules_task_1',
        title: 'Mock Task Title 1',
        state: 'RUNNING',
        prompt: 'Mock Task Title 1',
        sourceContext: { source: 'sources/github/mockuser/mockrepo' }
      },
      {
        name: 'sessions/jules_task_2',
        title: 'Mock Task Title 2',
        state: 'RUNNING',
        prompt: 'Mock Task Title 2',
        sourceContext: { source: 'sources/github/mockuser/mockrepo' }
      }
    ];

    localStorage.setItem('claude_chat_sessions', JSON.stringify(sessions));
    localStorage.setItem('hy_active_claude_session_id', 'session_claude_unlinked');
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

  const tabClaude = page.locator('#neural-tab-claude');
  const tabJules = page.locator('#neural-tab-jules');

  // ==========================================
  // CASO A: Cambio Claude -> Jules
  // ==========================================
  await expect(tabClaude).toHaveAttribute('aria-selected', 'true');

  // Click JULES upper tab
  await tabJules.click();

  // Verify Mode changed to Jules and persisted
  const activeMode = await page.evaluate(() => window.NeuralWorkspaceState.activeMode);
  expect(activeMode).toBe('jules');

  const persistedMode = await page.evaluate(() => localStorage.getItem('hypenosys_neural_workspace_mode'));
  expect(persistedMode).toBe('jules');

  // Verify UI classes, active controls and visibilities
  await expect(tabJules).toHaveClass(/active/);
  await expect(tabClaude).not.toHaveClass(/active/);
  await expect(page.locator('#neural-claude-workspace')).toBeHidden();
  await expect(page.locator('#neural-jules-workspace')).toBeVisible();
  await expect(page.locator('#ng-history')).toBeVisible();

  // ==========================================
  // CASO B: Conversación sin vínculo
  // ==========================================
  // Currently selected Claude conversation is "session_claude_unlinked" (which has NO linked Jules session).
  // Clicking Jules workspace should display general history and NOT be blocked by any Claude linking block.
  await expect(page.locator('#jules-history-container')).toBeVisible();
  await expect(page.locator('#neural-jules-history')).toBeVisible();

  // Checking that "esta conversación todavía no tiene una sesión..." is NOT displayed/blocking
  const welcomeText = await page.locator('#history-welcome-screen').innerText();
  expect(welcomeText).not.toContain('Esta conversación todavía no tiene una sesión Jules vinculada');

  // ==========================================
  // CASO C: Regreso a Claude
  // ==========================================
  // Select a Jules session in Jules mode
  await page.evaluate(() => {
    window.selectLinkedJulesSession('jules_task_2');
  });

  // Switch to Claude Mode
  await tabClaude.click();

  // Verify Claude elements visible, Jules elements hidden
  await expect(page.locator('#neural-claude-workspace')).toBeVisible();
  await expect(page.locator('#jules-history-container')).toBeHidden();

  // Switch back to Jules
  await tabJules.click();

  // Confirm last active session (jules_task_2) is restored and preserved
  const restoredSessionId = await page.evaluate(() => window.NeuralWorkspaceState.activeJulesSessionId);
  expect(restoredSessionId).toBe('jules_task_2');

  // ==========================================
  // CASO D: Persistencia
  // ==========================================
  await page.reload();
  await page.evaluate(() => {
    if (window.forceOpenPanel) window.forceOpenPanel();
  });

  // Confirm Jules remains active and segmented controls are synchronized
  await expect(tabJules).toHaveAttribute('aria-selected', 'true');
  const composerJulesOption = page.locator('.jules-neural-mode-option[data-mode="jules"]');
  await expect(composerJulesOption).toHaveClass(/active/);

  // ==========================================
  // CASO E: Listeners duplicados
  // ==========================================
  // Toggle Claude/Jules modes 10 times to verify no memory leaks or duplicate events
  for (let i = 0; i < 5; i++) {
    await tabClaude.click();
    await tabJules.click();
  }

  // Verify everything is still responsive and single active classes remain
  await expect(tabJules).toHaveClass(/active/);
  await expect(tabClaude).not.toHaveClass(/active/);

  // ==========================================
  // CASO F: Accesibilidad
  // ==========================================
  await expect(tabJules).toHaveAttribute('aria-selected', 'true');
  await expect(tabJules).toHaveAttribute('tabindex', '0');
  await expect(tabClaude).toHaveAttribute('aria-selected', 'false');
  await expect(tabClaude).toHaveAttribute('tabindex', '-1');

  // Save screenshot
  await page.screenshot({ path: 'verification/verify_neural_workspaces_integration.png' });
  console.log('SUCCESS: All integration cases A-F passed successfully.');
});
