const { test, expect } = require('@playwright/test');

test.describe('Write Permission Modal Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(url => url.href.includes('api.github.com'), route => {
      const u = route.request().url();
      if (u.includes('/user')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ login: 'Axlfc', name: 'Axlfc', avatar_url: '' })
        });
      } else if (u.includes('organizations.json')) {
        const payload = JSON.stringify({ organizations: [{ id: 'empty-space-videogames', name: 'Empty Space', createdBy: 'Axlfc' }] });
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ content: Buffer.from(payload).toString('base64'), encoding: 'base64', sha: '123' })
        });
      } else {
        const payload = JSON.stringify({ tasks: [], schema_version: '1.2.0' });
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ content: Buffer.from(payload).toString('base64'), encoding: 'base64', sha: '123' })
        });
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('gh_access_token', 'mock_token_12345_67890');
      sessionStorage.setItem('gh_access_token', 'mock_token_12345_67890');
      localStorage.setItem('github_user', JSON.stringify({ login: 'Axlfc', name: 'Axlfc', avatar_url: '' }));
      localStorage.setItem('hy_active_workspace', 'empty-space-videogames');
    });

    await page.goto('http://localhost:4000/dashboard.html');
    await page.waitForFunction('typeof window.isWritePermissionError === "function"');

    // Ensure login overlay is hidden if present
    await page.evaluate(() => {
      const loginOverlay = document.getElementById('login-overlay');
      if (loginOverlay) loginOverlay.classList.add('hidden');
    });
  });

  test('isWritePermissionError correctly detects 403/404 when token exists and workspace is not personal', async ({ page }) => {
    const result = await page.evaluate(() => {
      localStorage.setItem('gh_access_token', 'mock_token_12345_67890');
      sessionStorage.setItem('gh_access_token', 'mock_token_12345_67890');
      localStorage.setItem('hy_active_workspace', 'empty-space-videogames');

      if (window.githubApi) window.githubApi.token = 'mock_token_12345_67890';

      const err404 = { status: 404, message: 'Not Found' };
      const err403 = { status: 403, message: 'Forbidden' };
      const err500 = { status: 500, message: 'Internal Server Error' };

      const is404 = window.isWritePermissionError(err404);
      const is403 = window.isWritePermissionError(err403);
      const is500 = window.isWritePermissionError(err500);

      // Guard check: personal workspace should return false
      localStorage.setItem('hy_active_workspace', 'personal');
      const isPersonal = window.isWritePermissionError(err404);

      // Reset back
      localStorage.setItem('hy_active_workspace', 'empty-space-videogames');

      return { is404, is403, is500, isPersonal };
    });

    expect(result.is404).toBe(true);
    expect(result.is403).toBe(true);
    expect(result.is500).toBe(false);
    expect(result.isPersonal).toBe(false);
  });

  test('showWritePermissionModal displays modal with creator name and closes correctly', async ({ page }) => {
    await page.evaluate(() => {
      window.showWritePermissionModal('Axlfc');
    });

    const modal = page.locator('#write-permission-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Permisos Insuficientes');
    await expect(modal).toContainText('Axlfc');

    // Close modal
    await page.click('#close-write-perm-modal-btn');
    await expect(modal).toBeHidden();
  });

  test('showWritePermissionModal fallback when creator is not provided', async ({ page }) => {
    await page.evaluate(() => {
      window.showWritePermissionModal(null);
    });

    const modal = page.locator('#write-permission-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Contacta con un administrador de la organización');
  });
});
