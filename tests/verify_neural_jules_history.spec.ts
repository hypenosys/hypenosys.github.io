import { test, expect } from '@playwright/test';

test('Verify Jules Execution History loads and renders inside Neural Tab', async ({ page }) => {
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
                            createTime: new Date(Date.now() - 10000).toISOString(),
                            originator: 'agent',
                            description: 'Iniciando el plan de refactorización...',
                            agentMessaged: { agentMessage: 'He analizado el código de la rama y he propuesto un plan.' }
                        },
                        {
                            id: 'act-2',
                            createTime: new Date(Date.now() - 5000).toISOString(),
                            originator: 'agent',
                            description: 'Ejecutando pruebas unitarias...',
                            progressUpdated: { title: 'Paso 2: Pruebas unitarias', description: 'Ejecutando npm test con éxito.' }
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

  expect(textContent).toContain('He analizado el código de la rama');
  expect(textContent).toContain('Pruebas unitarias');

  // Verify the welcome screen placeholder is hidden
  const placeholder = page.locator('#history-welcome-screen');
  await expect(placeholder).toBeHidden();

  // 5. Save a verification screenshot
  await page.screenshot({ path: 'verification/jules_history_neural_verified.png' });
  console.log('SUCCESS: Execution history rendering verified inside Neural tab.');
});
