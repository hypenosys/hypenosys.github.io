const { test, expect } = require('@playwright/test');

test('Verify Claude Chat - Documentation Integration', async ({ page }) => {
  // 1. Setup viewport and console logging
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  // 2. Mock GitHub API responses for the documentation repo
  await page.route('**/repos/hypenosys/docs/contents/**', async route => {
    const url = route.request().url();
    if (url.includes('/contents/')) {
        // Mock list files (root)
        if (url.endsWith('/contents/')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { name: 'README.md', path: 'README.md', type: 'file', sha: 'sha1' },
                    { name: '04-Dev', path: '04-Dev', type: 'dir', sha: 'sha2' }
                ])
            });
        } else if (url.includes('README.md')) {
             await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    name: 'README.md',
                    path: 'README.md',
                    type: 'file',
                    content: btoa('This is the documentation README for testing purposes.')
                })
            });
        } else {
             await route.fulfill({ status: 404 });
        }
    }
  });

  // 3. Navigate to Claude Chat (Neural Chat)
  await page.goto('http://localhost:4000/chat/neural/');

  // 4. Bypass Auth and Setup State
  await page.evaluate(() => {
    localStorage.setItem('gh_access_token', 'fake-token');
    localStorage.setItem('hy_ai_config', JSON.stringify({
        provider: 'anthropic',
        api_key: 'sk-fake-key',
        model: 'claude-3-5-sonnet'
    }));

    // Dispatch authReady to initialize the app
    const event = new CustomEvent('authReady', {
        detail: { user: { login: 'testuser' } }
    });
    document.dispatchEvent(event);
  });

  // 5. Wait for the interface to load
  await page.waitForSelector('#claude-main-interface:not(.hidden)');

  // 6. Test buildSystemPrompt logic
  const promptWithDocs = await page.evaluate(async () => {
    // keyword 'documentación' should trigger docs fetch
    return await window.buildSystemPrompt('Explica la documentación', '');
  });

  console.log('Generated Prompt with Docs:', promptWithDocs);

  expect(promptWithDocs).toContain('## Repositorio hypenosys/docs');
  expect(promptWithDocs).toContain('README.md');
  expect(promptWithDocs).toContain('This is the documentation README for testing purposes.');

  // 7. Test without keywords
  const promptWithoutDocs = await page.evaluate(async () => {
    return await window.buildSystemPrompt('Hola', '');
  });

  expect(promptWithoutDocs).not.toContain('## Repositorio hypenosys/docs');

  await page.screenshot({ path: 'verification/neural_docs_verification.png' });
});
