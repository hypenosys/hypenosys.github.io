const { test, expect } = require('@playwright/test');

test('Verify Jules Panel V2 is accessible and has Neural Chat', async ({ page }) => {
  // We need to bypass the auth overlay.
  // The page has a forceOpenPanel() function and a "Bypass (Read Only)" button.
  await page.goto('http://localhost:4000/jules-panel/');

  // Wait for the auth overlay to appear
  await page.waitForSelector('#auth-overlay.show');

  // Click the bypass button
  await page.click('text=Bypass (Read Only)');

  // Wait for the overlay to disappear
  await page.waitForSelector('#auth-overlay:not(.show)');

  // Verify sidebar links
  await expect(page.locator('#nav-chat')).toBeVisible();

  // Switch to chat view
  await page.click('#nav-chat');

  // Verify chat components are visible
  await expect(page.locator('#v2-chat-messages')).toBeVisible();
  await expect(page.locator('#v2-chat-input')).toBeVisible();

  // Verify "Sesiones" button
  await expect(page.locator('text=Sesiones')).toBeVisible();

  console.log('Jules Panel V2 basic verification passed.');
});
