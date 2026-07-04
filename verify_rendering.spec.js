const { test, expect } = require('@playwright/test');

test('verify code block rendering and selector', async ({ page }) => {
  await page.goto('http://localhost:4000/chat/neural/');

  // Bypass auth and set config
  await page.evaluate(() => {
    localStorage.setItem('gh_user', JSON.stringify({ login: 'testuser', name: 'Test User' }));
    localStorage.setItem('hy_ai_config', JSON.stringify({ provider: 'openai', model: 'gpt-4' }));
    window.location.reload();
  });

  // Wait for the UI to show up or force it
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
     const ids = ['claude-auth-loading', 'claude-auth-gate', 'claude-main-interface', 'chat-main-area'];
     ids.forEach(id => {
         const el = document.getElementById(id);
         if (el) {
             if (id.includes('loading') || id.includes('gate')) el.classList.add('hidden');
             else el.classList.remove('hidden');
         }
     });
  });

  // Check Runners Mode Language Selector
  const modeBtn = page.locator('#mode-selector-btn');
  await modeBtn.click();
  const runnersBtn = page.locator('button:has-text("Runners")');
  await runnersBtn.click();

  const langSelector = page.locator('#runners-lang-selector');
  await expect(langSelector).toBeVisible();

  // Inject a message with a python code block
  await page.evaluate(() => {
    if (!window.currentSessionId) window.createNewSession();
    const session = window.sessions.find(s => s.id === window.currentSessionId);
    session.messages.push({
      role: 'assistant',
      content: 'Code:\n```python\nprint("hello")\n```'
    });
    window.renderMessages();
  });

  // Verify execution button
  const execBtn = page.locator('.exec-code-container button');
  await expect(execBtn).toBeVisible();
  await expect(execBtn).toContainText('EJECUTAR PYTHON');

  // Verify marked didn't break (no [object Object])
  const codePre = page.locator('.exec-code-container pre');
  const codeHtml = await codePre.innerHTML();
  console.log('Code HTML:', codeHtml);
  expect(codeHtml).not.toContain('[object Object]');

  await page.screenshot({ path: 'runners_ui_test.png' });
});
