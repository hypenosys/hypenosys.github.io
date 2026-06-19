const { test, expect } = require('@playwright/test');

const panels = [
  { name: 'Production Panel', url: 'http://localhost:4000/jules-panel/' },
  { name: 'Test Panel V2', url: 'http://localhost:4000/jules-panel/' },
  { name: 'Claude Chat', url: 'http://localhost:4000/chat/neural/' }
];

for (const panel of panels) {
  test(`Verify ${panel.name} on desktop`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Pre-set some state to bypass auth gate if possible or just show it's clear
    await page.addInitScript(() => {
        window.localStorage.setItem('gh_access_token', 'mock');
        window.localStorage.setItem('github_user', JSON.stringify({login: 'testuser'}));
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('authReady', { detail: { user: { login: 'testuser' } } }));
        }, 500);
    });

    await page.goto(panel.url);
    await page.waitForTimeout(3000); // Wait for animations
    await page.screenshot({ path: `verification/${panel.name.replace(/ /g, '_')}_desktop.png`, fullPage: true });
  });

  test(`Verify ${panel.name} on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
        window.localStorage.setItem('gh_access_token', 'mock');
        window.localStorage.setItem('github_user', JSON.stringify({login: 'testuser'}));
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('authReady', { detail: { user: { login: 'testuser' } } }));
        }, 500);
    });
    await page.goto(panel.url);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `verification/${panel.name.replace(/ /g, '_')}_mobile.png`, fullPage: true });
  });
}
