const { test, expect } = require('@playwright/test');

test.describe('Neural Chat Persistence Reproduction', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    // Setup initial state: mock authentication and configuration
    await page.addInitScript(() => {
      window.localStorage.setItem('gh_access_token', 'mock_token');
      window.localStorage.setItem('github_user', JSON.stringify({ login: 'testuser', name: 'Test User', avatar_url: '' }));
      window.localStorage.setItem('hy_ai_config', JSON.stringify({
        provider: 'custom',
        base_url: 'http://localhost:9999/v1',
        model: 'mock-model',
        api_key: 'mock_key'
      }));

      // Mock githubApi
      window.githubApi = {
        user: { login: 'testuser', name: 'Test User', avatar_url: '' },
        getAuthToken: () => 'mock_token'
      };

      // Mock marked if not loaded
      if (typeof window.marked === 'undefined') {
        window.marked = {
          parse: (text) => text,
          setOptions: () => {}
        };
      }
    });

    // Mock the AI provider response
    await page.route('**/chat/completions', async (route) => {
      console.log('MOCKING API CALL');
      const response = {
        choices: [{
          delta: { content: 'ok' },
          index: 0,
          finish_reason: null
        }]
      };

      const body = `data: ${JSON.stringify(response)}\n\ndata: [DONE]\n\n`;

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: body
      });
    });
  });

  test('Reproduction: Message should persist after refresh', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('http://localhost:4000/chat/neural/', { waitUntil: 'domcontentloaded' });

    // Fallback to bypass auth loading
    await page.evaluate(() => {
      const loading = document.getElementById('claude-auth-loading');
      if (loading) loading.classList.add('hidden');
      const gate = document.getElementById('claude-auth-gate');
      if (gate) gate.classList.add('hidden');
      const main = document.getElementById('claude-main-interface');
      if (main) main.classList.remove('hidden');
      const chatArea = document.getElementById('chat-main-area');
      if (chatArea) chatArea.classList.remove('hidden');

      // Force init if not called
      if (window.init) window.init();
    });

    await page.waitForSelector('#claude-main-interface', { state: 'visible' });

    // 1. Create new conversation
    await page.click('button:has-text("NUEVA CONVERSACIÓN")');

    // 2. Send message
    const input = page.locator('#chat-input');
    await input.fill('Si recibiste este mensaje di ok.');
    await page.click('#send-btn');

    // 3. Wait for assistant response "ok" to appear
    await page.waitForSelector('.message-claude:has-text("ok")', { timeout: 15000 });

    // 4. Verify user message is also visible
    await expect(page.locator('.message-user:has-text("Si recibiste este mensaje di ok.")')).toBeVisible();

    // 5. Inspect localStorage before refresh
    const sessionsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('claude_chat_sessions') || '[]'));
    console.log('Sessions before refresh:', JSON.stringify(sessionsBefore, null, 2));

    // 6. Refresh the page
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Re-apply fallback
    await page.evaluate(() => {
      const loading = document.getElementById('claude-auth-loading');
      if (loading) loading.classList.add('hidden');
      const gate = document.getElementById('claude-auth-gate');
      if (gate) gate.classList.add('hidden');
      const main = document.getElementById('claude-main-interface');
      if (main) main.classList.remove('hidden');
      const chatArea = document.getElementById('chat-main-area');
      if (chatArea) chatArea.classList.remove('hidden');
    });

    await page.waitForSelector('#claude-main-interface', { state: 'visible' });

    // 7. Verify session and messages are still visible
    const userMessage = page.locator('.message-user:has-text("Si recibiste este mensaje di ok.")');
    const assistantMessage = page.locator('.message-claude:has-text("ok")');

    await expect(userMessage).toBeVisible();
    await expect(assistantMessage).toBeVisible();

    const sessionTitle = await page.textContent('#session-title');
    expect(sessionTitle).not.toBe('Nueva Conversación');
  });
});
