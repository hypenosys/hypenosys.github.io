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

  test('Verification 1: Session switching updates Neural Context', async ({ page }) => {
    await page.goto('http://localhost:4000/chat/neural/');
    await page.waitForSelector('#claude-main-interface', { state: 'visible', timeout: 30000 });

    // Click on session 1
    await page.click('.session-item[data-id="session_1"]');

    // Check localStorage hy_neural_session_id is jules_123
    let neuralId = await page.evaluate(() => localStorage.getItem('hy_neural_session_id'));
    expect(neuralId).toBe('jules_123');

    // Click on session 2 (no jules link)
    await page.click('.session-item[data-id="session_2"]');

    // Check localStorage hy_neural_session_id is removed
    neuralId = await page.evaluate(() => localStorage.getItem('hy_neural_session_id'));
    expect(neuralId).toBeNull();
  });

  test('Verification 2: Enviar a Jules redirection logic', async ({ page }) => {
    await page.goto('http://localhost:4000/chat/neural/');
    await page.waitForSelector('#claude-main-interface', { state: 'visible', timeout: 30000 });

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

    // Should redirect to jules-panel
    await page.waitForURL(url => url.pathname.includes('/jules-panel/'), { timeout: 10000 });
    const url = page.url();
    expect(url).not.toContain('task_data=');

    // Check localStorage has the payload
    const payload = await page.evaluate(() => localStorage.getItem('jules_task_payload'));
    expect(payload).not.toBeNull();
    expect(JSON.parse(payload).claude_response).toContain('I recommend changing line 10');
  });

  test('Verification 3: Sidebar session deletion cleanup', async ({ page }) => {
    await page.goto('http://localhost:4000/chat/neural/');
    await page.waitForSelector('#claude-main-interface', { state: 'visible', timeout: 30000 });

    // Delete session 1
    await page.evaluate(() => {
        window.deleteSession('session_1');
    });

    // Click delete on toast
    await page.waitForSelector('#confirm-btn', { state: 'visible', timeout: 10000 });
    await page.click('#confirm-btn');

    // Check that hy_neural_session_id_session_1 is gone
    const mapping = await page.evaluate(() => localStorage.getItem('hy_neural_session_id_session_1'));
    expect(mapping).toBeNull();
  });

  test('Verification 4: Dashboard to Neural Chat handoff via localStorage', async ({ page }) => {
    // Manually set up the localStorage state as if coming from Dashboard
    await page.addInitScript(() => {
      window.localStorage.setItem('hy_neural_task_context', JSON.stringify({
        id: '101',
        title: 'New Dashboard Task'
      }));
      window.localStorage.setItem('hy_neural_active', 'true');
      window.localStorage.setItem('hy_neural_new_task_sent', 'true');
    });

    await page.goto('http://localhost:4000/chat/neural/');
    await page.waitForSelector('#claude-main-interface', { state: 'visible', timeout: 30000 });

    // Check that the prompt was pre-filled
    const inputValue = await page.inputValue('#chat-input');
    expect(inputValue).toContain('New Dashboard Task');
    expect(inputValue).toContain('#101');

    // Check that the flag was cleared
    const isNewTaskSent = await page.evaluate(() => localStorage.getItem('hy_neural_new_task_sent'));
    expect(isNewTaskSent).toBeNull();
  });
});
