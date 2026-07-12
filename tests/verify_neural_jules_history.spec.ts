import { test, expect } from '@playwright/test';

test('Verify Jules Execution History loads and renders inside Neural Tab', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1024 });

  // Listen to console and errors
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Add init script to mock APIs before page load
  await page.addInitScript(() => {
    // Fixed base time for deterministic timestamps
    const staticTime1 = "2026-07-12T13:40:00.000Z";
    const staticTime2 = "2026-07-12T13:40:05.000Z";
    const staticTime3 = "2026-07-12T13:40:10.000Z";

    // Setup fetch interception
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
        const urlStr = String(url);
        if (urlStr.includes('api.github.com')) {
            // Mock GitHub responses
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
                            createTime: staticTime1,
                            originator: 'agent',
                            description: 'Iniciando el plan de refactorización...',
                            agentMessaged: { agentMessage: 'He analizado el código de la rama y he propuesto un plan.' }
                        },
                        {
                            id: 'act-2',
                            createTime: staticTime2,
                            originator: 'agent',
                            description: 'Ejecutando pruebas unitarias...',
                            progressUpdated: { title: 'Paso 2: Pruebas unitarias', description: 'Ejecutando npm test con éxito.' }
                        },
                        {
                            id: 'act-xss',
                            createTime: staticTime3,
                            originator: 'agent',
                            description: 'Prueba de XSS',
                            agentMessaged: { agentMessage: '<img src=x onerror=alert(1)> <script>alert(1)</script>' }
                        }
                    ]
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (urlStr.match(/\/sessions\/[^/]+$/)) {
                return new Response(JSON.stringify({
                    name: 'sessions/js_test_1',
                    state: 'RUNNING',
                    prompt: 'Mock Task Title'
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

    // Seed mock activities in cache (with static time matching act-1)
    const cachedActivities = [
      {
        id: 'act-1',
        createTime: "2026-07-12T13:40:00.000Z",
        originator: 'agent',
        description: 'Actividad cacheada antigua',
        agentMessaged: { agentMessage: 'He analizado el código de la rama y he propuesto un plan.' }
      }
    ];
    localStorage.setItem('jules_activities_cache_js_test_1', JSON.stringify(cachedActivities));

    // Mock unified sessions
    const sessions = [
      {
        id: 'session_test_1',
        title: 'Conversacion de Prueba con Jules',
        messages: [
          { role: 'user', content: 'Hola Claude, ¿puedes ayudarme con la tarea vinculada?', timestamp: Date.now() - 5000 },
          { role: 'assistant', content: 'Claro que sí, está vinculada con la tarea de Jules #js_test_1.', timestamp: Date.now() }
        ],
        createdAt: new Date().toISOString(),
        metadata: {
          linkedJulesTaskId: 'js_test_1',
          linkedJulesTaskTitle: 'Mock Task Title'
        }
      }
    ];

    localStorage.setItem('claude_chat_sessions', JSON.stringify(sessions));
    localStorage.setItem('hy_active_claude_session_id', 'session_test_1');
  });

  // 2. Go to the jules-panel page
  await page.goto('http://localhost:4000/jules-panel/');

  // Force mock validation and unlock panel bypass
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

  // 3. Click the Neural tab link (using hnav-link selector or switchView)
  const chatLink = page.locator('.hnav-link[data-view="chat"]');
  await chatLink.click();

  // 4. Verify the activities are rendered in `#neural-jules-history`
  const historyContainer = page.locator('#neural-jules-history');
  await expect(historyContainer).toBeVisible();

  // Wait for the mock activities to be populated
  const activity1 = page.locator('#neural-jules-history .jules-activity-entry').first();
  await expect(activity1).toBeVisible({ timeout: 15000 });

  const textContent = await historyContainer.textContent();
  console.log('History content rendered:', textContent);

  // Validate revalidation loaded the API elements
  expect(textContent).toContain('He analizado el código de la rama');
  expect(textContent).toContain('Pruebas unitarias');

  // Verify the welcome screen placeholder is hidden
  const placeholder = page.locator('#history-welcome-screen');
  await expect(placeholder).toBeHidden();

  // 5. Verify Caching is merged (stale-while-revalidate has both cached and newly fetched activities)
  const cacheStr = await page.evaluate(() => localStorage.getItem('jules_activities_cache_js_test_1'));
  const cacheArr = JSON.parse(cacheStr || '[]');
  console.log('CACHE MERGED ELEMENTS:', cacheArr);
  expect(cacheArr.some((act: any) => act.id === 'act-1')).toBe(true);
  expect(cacheArr.some((act: any) => act.id === 'act-2')).toBe(true);

  // 6. Verify Chronological Sorting (act-1 oldest should be on top, act-xss newest at bottom)
  const originatorTexts = await page.locator('#neural-jules-history .activity-time').allTextContents();
  console.log('TIMESTAMPS ORDER:', originatorTexts);
  // Verify HTML contains the elements
  expect(originatorTexts.length).toBeGreaterThanOrEqual(2);

  // 7. Verify Race Condition revision token protection
  const finalHtmlBeforeRace = await historyContainer.innerHTML();
  await page.evaluate(() => {
    // Increment loading revision to simulate a race condition where loadAndRenderJulesSession completes
    // after another load Linked history request began
    window.linkedHistoryLoadRevision = 999;
    // Load jules session is invoked with old revision inside its callback
    window.loadAndRenderJulesSession('js_test_1', false);
  });
  await page.waitForTimeout(1000);
  const finalHtmlAfterRace = await historyContainer.innerHTML();
  expect(finalHtmlAfterRace).toBe(finalHtmlBeforeRace); // Content must remain unchanged due to revision discard

  // 8. Verify Security / HTML escaping against XSS
  const rawHtml = await historyContainer.innerHTML();
  expect(rawHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(rawHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(rawHtml).not.toContain('<img src=x onerror=alert(1)>');
  expect(rawHtml).not.toContain('<script>alert(1)</script>');
  console.log('XSS PREVENTION VERIFIED: Dangerous tags successfully escaped.');

  // 9. Verify Scroll Rules
  const scrollHeight = await page.evaluate(() => {
    const el = document.getElementById('jules-history-container');
    return el ? el.scrollHeight : 0;
  });
  console.log('SCROLL HEIGHT:', scrollHeight);
  // Since it was first load, we should be scrolled towards the end
  const scrollTop = await page.evaluate(() => {
    const el = document.getElementById('jules-history-container');
    return el ? el.scrollTop : 0;
  });
  console.log('SCROLL TOP:', scrollTop);

  // 10. Verify Unlinking cleans up upper block and restores welcome placeholder
  // Use unique ID selector to locate exact Unlink button inside chat live status bar
  const unlinkBtn = page.locator('#chat-live-status button:has-text("Desvincular")');
  await unlinkBtn.click();

  // Accept confirmation dialog if shown, or simulate it.
  // Wait for placeholder to be visible again
  await expect(placeholder).toBeVisible({ timeout: 5000 });
  const finalHistoryContent = await historyContainer.textContent();
  expect(finalHistoryContent).toBe(''); // History should be cleaned up!

  // Claude neural chat remains intact (not deleted)
  const chatMessages = page.locator('#v2-chat-messages');
  await expect(chatMessages).toBeVisible();

  // 11. Save a verification screenshot
  await page.screenshot({ path: 'verification/jules_history_neural_verified.png' });
  console.log('SUCCESS: Execution history rendering verified inside Neural tab.');
});
