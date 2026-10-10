const { test, expect } = require('@playwright/test');

test.describe('Account UX regression', () => {
  test('homepage exposes the shared profile editor after Github auth', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:4000/');
    await page.waitForFunction(() => !!window.authManager && !!window.profileEditor);
    await page.evaluate(() => {
      window.githubApi.user = { login: 'Axlfc', avatar_url: 'https://github.com/Axlfc.png' };
      document.dispatchEvent(new CustomEvent('authReady', { detail: { user: window.githubApi.user } }));
    });
    await page.locator('#gh-mobile-account-toggle').click();
    await page.locator('#btn-open-profile-mobile').click();
    await expect(page.locator('#modalEditProfile')).toBeVisible();
    await expect(page.locator('#prof-display-name')).not.toHaveValue('');
    await expect(page.locator('#gh-mobile-account-menu')).toBeHidden();
  });

  test('account dropdown and modal remain scrollable in mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('http://localhost:4000/');
    await page.waitForFunction(() => !!window.authManager && !!window.profileEditor);
    await page.evaluate(() => {
      window.githubApi.user = { login: 'Axlfc' };
      document.dispatchEvent(new CustomEvent('authReady', { detail: { user: window.githubApi.user } }));
    });
    await page.locator('#gh-mobile-account-toggle').click();
    const menu = page.locator('#gh-mobile-account-menu');
    await expect(menu).toBeVisible();
    const geometry = await menu.evaluate(el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, vw: document.documentElement.clientWidth, vh: innerHeight };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.right).toBeLessThanOrEqual(geometry.vw + 1);
    await page.locator('#btn-open-profile-mobile').click();
    await expect(page.locator('#modalEditProfile')).toBeVisible();
    const modal = await page.locator('#modalEditProfile .modal-content').evaluate(el => ({
      height: el.getBoundingClientRect().height,
      viewport: window.innerHeight,
      scroll: getComputedStyle(document.querySelector('#modalEditProfile .tab-content')).overflowY
    }));
    expect(modal.height).toBeLessThanOrEqual(modal.viewport + 1);
    expect(['auto', 'scroll']).toContain(modal.scroll);
  });

  test('dashboard opens account settings deep link without altering OAuth URL', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:4000/dashboard.html');
    await page.waitForFunction(() => !!window.authManager);
    const modalExists = await page.locator('#settingsModal').count();
    expect(modalExists).toBe(1);
    await page.evaluate(() => window.authManager.showSettingsModal());
    await expect(page.locator('#settingsModal')).toBeVisible();
  });
});
