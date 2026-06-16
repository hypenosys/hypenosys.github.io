const { test, expect } = require('@playwright/test');

test('Verify documentation navigation and relative links', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  // Add console log listener to debug what's happening in the browser
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  // Mock GitHub API responses for documentation
  await page.route('**/repos/hypenosys/docs/contents/', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { name: 'GDD.md', path: 'GDD.md', type: 'file', sha: '1' },
        { name: 'tech', path: 'tech', type: 'dir', sha: '2' }
      ])
    });
  });

  await page.route('**/repos/hypenosys/docs/contents/tech', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { name: 'architecture.md', path: 'tech/architecture.md', type: 'file', sha: '3' }
      ])
    });
  });

  await page.route('**/repos/hypenosys/docs/contents/GDD.md', async route => {
    const content = btoa('Welcome to GDD. [Go to Tech](tech/architecture.md) and [Internal Section](#section).');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: content, name: 'GDD.md', type: 'file', path: 'GDD.md' })
    });
  });

  await page.route('**/repos/hypenosys/docs/contents/tech/architecture.md', async route => {
    const content = btoa('Architecture details. [Back to GDD](../GDD.md) and ![Diagram](img/diagram.png).');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: content, name: 'architecture.md', type: 'file', path: 'tech/architecture.md' })
    });
  });

  // Navigate to documentation
  await page.goto('http://localhost:4000/documentacion.html');

  // Wait for sidebar to be rendered
  await page.waitForSelector('.sidebar-link:has-text("GDD")');

  // 1. Click on GDD in sidebar
  await page.click('button.sidebar-link:has-text("GDD")');

  // Verify content rendered and hash updated
  await expect(page).toHaveURL(/#GDD.md/);

  // Wait for markdown section to show
  await page.waitForFunction(() => !document.getElementById('markdown-section').classList.contains('hidden'));

  await expect(page.locator('#markdown-body')).toContainText('Welcome to GDD');

  // 2. Click relative link to tech/architecture.md
  await page.click('a:has-text("Go to Tech")');

  // Verify hash updated correctly
  await expect(page).toHaveURL(/#tech\/architecture.md/);
  await page.waitForFunction(() => document.getElementById('current-filename').textContent === 'architecture');
  await expect(page.locator('#markdown-body')).toContainText('Architecture details');

  // 3. Verify image URL transformation
  const img = page.locator('#markdown-body img');
  await expect(img).toHaveAttribute('src', 'https://raw.githubusercontent.com/hypenosys/docs/main/tech/img/diagram.png');

  // 4. Click relative link back to GDD.md
  await page.click('a:has-text("Back to GDD")');
  await expect(page).toHaveURL(/#GDD.md/);
  await page.waitForFunction(() => document.getElementById('current-filename').textContent === 'GDD');
  await expect(page.locator('#markdown-body')).toContainText('Welcome to GDD');

  // 5. Test search functionality
  await page.fill('#doc-search', 'GDD');
  await expect(page.locator('.group:has(button:has-text("GDD"))')).toBeVisible();

  await page.fill('#doc-search', 'nonexistent');
  await expect(page.locator('.group:has(button:has-text("GDD"))')).toHaveClass(/hidden/);

  await page.screenshot({ path: 'verification/docs_test.png' });
});
