const { test, expect } = require('@playwright/test');

const homeUrl = 'http://localhost:4000/';

test.describe('Global header — GitHub mobile auth', () => {
  for (const width of [320, 375, 390, 430, 750]) {
    test(`guest login stays visible and inside viewport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 820 });
      await page.goto(homeUrl);
      await expect(page.locator('#btn-sign-in-mobile')).toBeVisible();
      await expect(page.locator('#gh-mobile-toggle')).toBeVisible();
      await expect(page.locator('#gh-mobile-toggle')).toHaveAttribute('aria-label', 'Abrir menú');
      const geometry = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        controls: ['.gh-logo', '#btn-sign-in-mobile', '#gh-mobile-toggle'].map(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { selector, left: rect.left, right: rect.right, width: rect.width };
        })
      }));
      for (const rect of geometry.controls) {
        expect(rect.width, rect.selector).toBeGreaterThan(0);
        expect(rect.left, rect.selector).toBeGreaterThanOrEqual(-1);
        expect(rect.right, rect.selector).toBeLessThanOrEqual(geometry.viewport + 1);
      }
    });
  }

  test('mobile login reuses AuthManager OAuth handler', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 820 });
    await page.goto(homeUrl);
    await page.waitForFunction(() => !!window.authManager);
    await page.evaluate(() => {
      window.__mobileSignInCalled = false;
      window.authManager.handleLogin = () => { window.__mobileSignInCalled = true; };
    });
    await page.locator('#btn-sign-in-mobile').click();
    await expect.poll(() => page.evaluate(() => window.__mobileSignInCalled)).toBe(true);
  });

  test('authenticated mobile user gets accessible account actions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 820 });
    await page.goto(homeUrl);
    await page.waitForSelector('.gh-navbar');
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('authReady', {
        detail: { user: { login: 'test-maintainer' } }
      }));
    });
    const account = page.locator('#gh-mobile-account-toggle');
    await expect(account).toBeVisible();
    await expect(page.locator('#btn-sign-in-mobile')).toHaveCount(0);
    await account.click();
    await expect(account).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#btn-logout-mobile')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(account).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#gh-mobile-account-menu')).toBeHidden();
  });

  test('desktop auth remains in the existing navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto(homeUrl);
    await expect(page.locator('#btn-sign-in')).toBeVisible();
    await expect(page.locator('#gh-mobile-actions')).toHaveCount(0);
    await expect(page.locator('#gh-mobile-auth')).toBeHidden();
  });
});
