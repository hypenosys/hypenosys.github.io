const { test, expect } = require('@playwright/test');

const pages = [
  { name: 'dashboard', url: 'http://localhost:4000/dashboard.html', scrollSelector: null },
  { name: 'jules-panel', url: 'http://localhost:4000/jules-panel/', scrollSelector: '.main' }
];

const viewports = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 }
];

for (const pageInfo of pages) {
  for (const viewport of viewports) {
    test(`Verify ${pageInfo.name} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);

      // Mock Auth and Layout
      await page.addInitScript(() => {
        window.localStorage.setItem('gh_access_token', 'mock-token');
        window.sessionStorage.setItem('gh_access_token', 'mock-token');
        window.localStorage.setItem('github_token', 'mock-token');

        // Mock API
        window.githubApi = {
          getAuthToken: () => 'mock-token',
          user: { login: 'mock-user' },
          computeFixedFoundRatio: () => 0.5
        };
      });

      await page.goto(pageInfo.url);

      // Force visibility and hide overlays via injected style
      await page.addStyleTag({ content: `
        #login-overlay, #unauthorized-overlay, .auth-overlay, #auth-overlay, .auth-card, [id*="auth-card"] {
          display: none !important;
        }
        #app-root, .app, .desktop-layout, main, .main {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          filter: none !important;
        }
      `});

      await page.waitForSelector('.gh-navbar', { timeout: 10000 });
      await page.waitForTimeout(1000);

      // Initial Screenshot
      await page.screenshot({ path: `tests/screenshots/${pageInfo.name}-${viewport.width}-initial.png` });

      // Scroll
      if (pageInfo.scrollSelector) {
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.scrollTo(0, 500);
        }, pageInfo.scrollSelector);
      } else {
        await page.evaluate(() => window.scrollTo(0, 500));
      }

      await page.waitForTimeout(1000);

      // Scrolled Screenshot
      await page.screenshot({ path: `tests/screenshots/${pageInfo.name}-${viewport.width}-scrolled.png` });
    });
  }
}
