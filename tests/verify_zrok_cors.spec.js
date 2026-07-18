const { test, expect } = require('@playwright/test');

test.describe('Zrok CORS and Interstitial Functional Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a blank page or a main page where ui-components.js is loaded
    await page.goto('http://localhost:4000/dashboard.html');
  });

  test('isZrokUrl correctly identifies zrok domains', async ({ page }) => {
    const results = await page.evaluate(() => {
      return {
        sharesDotIo: window.isZrokUrl('https://n8nzimaafaces.shares.zrok.io/webhook/music-gen'),
        shareDotIo: window.isZrokUrl('https://foo.share.zrok.io/something'),
        nonZrok: window.isZrokUrl('https://github.com/hypenosys'),
        empty: window.isZrokUrl('')
      };
    });

    expect(results.sharesDotIo).toBe(true);
    expect(results.shareDotIo).toBe(true);
    expect(results.nonZrok).toBe(false);
    expect(results.empty).toBe(false);
  });

  test('getZrokHeaders correctly formats and appends zrok specific header', async ({ page }) => {
    const headersTest = await page.evaluate(() => {
      const zrokUrl = 'https://n8nzimaafaces.shares.zrok.io/webhook/music-gen';
      const nonZrokUrl = 'https://api.github.com/user';

      const standardInput = { 'Content-Type': 'application/json', 'Authorization': 'Bearer foo' };

      return {
        zrok: window.getZrokHeaders(zrokUrl, standardInput),
        nonZrok: window.getZrokHeaders(nonZrokUrl, standardInput)
      };
    });

    expect(headersTest.zrok['skip_zrok_interstitial']).toBe('true');
    expect(headersTest.zrok['Content-Type']).toBe('application/json');
    expect(headersTest.zrok['Authorization']).toBe('Bearer foo');

    expect(headersTest.nonZrok['skip_zrok_interstitial']).toBeUndefined();
    expect(headersTest.nonZrok['Content-Type']).toBe('application/json');
    expect(headersTest.nonZrok['Authorization']).toBe('Bearer foo');
  });

  test('hypenosysFetch detects zrok interstitial HTML and throws ZROK_INTERSTITIAL_BLOCKED', async ({ page }) => {
    // Intercept a request to a zrok URL and return a fake zrok interstitial HTML page
    await page.route('https://n8nzimaafaces.shares.zrok.io/interstitial', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>Welcome to zrok! This is a public share interstitial warning.</body></html>'
      });
    });

    const errorThrown = await page.evaluate(async () => {
      try {
        await window.hypenosysFetch('https://n8nzimaafaces.shares.zrok.io/interstitial');
        return 'No error';
      } catch (e) {
        return e.message;
      }
    });

    expect(errorThrown).toBe('ZROK_INTERSTITIAL_BLOCKED');
  });

  test('hypenosysFetch transparently passes actual JSON response', async ({ page }) => {
    // Intercept with proper JSON response
    await page.route('https://n8nzimaafaces.shares.zrok.io/api', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Music synthesized' })
      });
    });

    const data = await page.evaluate(async () => {
      const res = await window.hypenosysFetch('https://n8nzimaafaces.shares.zrok.io/api');
      return await res.json();
    });

    expect(data.success).toBe(true);
    expect(data.message).toBe('Music synthesized');
  });
});
