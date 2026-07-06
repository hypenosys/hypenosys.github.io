const { test, expect } = require('@playwright/test');

test.describe('Neural Flow Functional Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Setup initial state: a mock github user and some sessions
    await page.addInitScript(() => {
      window.localStorage.setItem('gh_access_token', 'mock_token');
      window.localStorage.setItem('github_user', JSON.stringify({ login: 'testuser', avatar_url: '' }));

      // Simulate authReady event for the app to start
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent('authReady', {
          detail: { user: { login: 'testuser', avatar_url: '' } }
        }));
      }, 500);

      const sessions = [
        {
          id: 'session_1',
          title: 'Chat 1',
          messages: [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi there' }],
          systemPrompt: '...',
          createdAt: new Date().toISOString()
        },
        {
          id: 'session_2',
          title: 'Chat 2',
          messages: [{ role: 'user', content: 'Fix bug' }],
          systemPrompt: '...',
          createdAt: new Date().toISOString()
        }
      ];
      window.localStorage.setItem('claude_chat_sessions', JSON.stringify(sessions));

      // Link session_1 to a Jules session
      window.localStorage.setItem('hy_neural_session_id_session_1', 'jules_123');

      // Set a task context
      window.localStorage.setItem('hy_neural_active', 'true');
      window.localStorage.setItem('hy_neural_task_context', JSON.stringify({
        id: '42',
        titulo: 'Fix production bug',
        rama: 'bugfix/42'
      }));
    });
  });

  test('Verification 1: Session switching updates Neural Session Banner', async ({ page }) => {
    await page.goto('http://localhost:4000/chat/neural/');
    await page.waitForSelector('#claude-main-interface', { state: 'visible' });

    // Click on session 1
    await page.click('.session-item[data-id="session_1"]');

    // Check banner shows #jules_123
    const bannerText1 = await page.textContent('#task-context-banner');
    expect(bannerText1).toContain('jules_123');

    // Check localStorage hy_neural_session_id is jules_123
    let neuralId = await page.evaluate(() => localStorage.getItem('hy_neural_session_id'));
    expect(neuralId).toBe('jules_123');

    // Click on session 2 (no jules link)
    await page.click('.session-item[data-id="session_2"]');

    // Check banner doesn't show a specific ID or shows default
    const bannerText2 = await page.textContent('#task-context-banner');
    expect(bannerText2).not.toContain('jules_123');

    // Check localStorage hy_neural_session_id is removed
    neuralId = await page.evaluate(() => localStorage.getItem('hy_neural_session_id'));
    expect(neuralId).toBeNull();
  });

  test('Verification 2: Enviar a Jules redirection logic', async ({ page }) => {
    await page.goto('http://localhost:4000/chat/neural/');
    await page.waitForSelector('#claude-main-interface', { state: 'visible' });

    // Switch to session 2 (no jules link)
    await page.click('.session-item[data-id="session_2"]');

    // Hover over assistant message and click "ENVIAR A JULES"
    // (In our mock session 2 only has 1 user message, let's add an assistant one)
    await page.evaluate(() => {
        const sessions = JSON.parse(localStorage.getItem('claude_chat_sessions'));
        sessions[1].messages.push({ role: 'assistant', content: 'I recommend changing line 10' });
        localStorage.setItem('claude_chat_sessions', JSON.stringify(sessions));
    });
    await page.reload();
    await page.click('.session-item[data-id="session_2"]');

    // Click "ENVIAR A JULES"
    await page.click('button:has-text("ENVIAR A JULES")');

    // Should redirect to jules-panel with prompt and task_data
    await page.waitForURL(url => url.pathname.includes('/jules-panel/'));
    const url = page.url();
    expect(url).toContain('prompt=');
    expect(url).toContain('task_data=');
  });

  test('Verification 3: Sidebar session deletion cleanup', async ({ page }) => {
    await page.goto('http://localhost:4000/chat/neural/');
    await page.waitForSelector('#claude-main-interface', { state: 'visible' });

    // Delete session 1
    // We need to trigger the confirmation
    await page.evaluate(() => {
        // Direct call to deleteSession to bypass swipe/hover complexities in test
        window.deleteSession('session_1');
    });

    // Click delete on toast
    await page.click('#confirm-btn');

    // Check that hy_neural_session_id_session_1 is gone
    const mapping = await page.evaluate(() => localStorage.getItem('hy_neural_session_id_session_1'));
    expect(mapping).toBeNull();
  });
});
