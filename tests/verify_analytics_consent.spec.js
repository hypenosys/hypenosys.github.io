const { test, expect } = require('@playwright/test');

test.describe('Hypenosys Matomo & Analytics Consent System', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:4000/index.html');
        await page.evaluate(() => localStorage.clear());
    });

    test('Case 1: First clean visit (Fail-Closed default)', async ({ page }) => {
        const matomoRequests = [];
        page.on('request', request => {
            if (request.url().includes('matomo')) {
                matomoRequests.push(request.url());
            }
        });

        await page.goto('http://localhost:4000/index.html');
        await page.waitForSelector('#hy-consent-banner');

        // Banner must be visible
        const bannerVisible = await page.isVisible('#hy-consent-banner');
        expect(bannerVisible).toBe(true);

        // Fail-closed: No requests to matomo.php or matomo.js on initial visit
        expect(matomoRequests.length).toBe(0);

        // Local storage item must be null
        const consentState = await page.evaluate(() => localStorage.getItem('hypenosys_consent_v1'));
        expect(consentState).toBeNull();
    });

    test('Case 2: Reject consent', async ({ page }) => {
        const matomoRequests = [];
        page.on('request', request => {
            if (request.url().includes('matomo')) {
                matomoRequests.push(request.url());
            }
        });

        await page.goto('http://localhost:4000/index.html');
        await page.click('#hy-consent-btn-reject');

        // Banner disappears
        await expect(page.locator('#hy-consent-banner')).toHaveCount(0);

        // Decision saved in localStorage
        const consentState = await page.evaluate(() => JSON.parse(localStorage.getItem('hypenosys_consent_v1')));
        expect(consentState).not.toBeNull();
        expect(consentState.version).toBe(1);
        expect(consentState.analytics).toBe(false);

        // No matomo requests sent
        expect(matomoRequests.length).toBe(0);

        // Reload page
        await page.reload();

        // Banner should NOT reappear
        await expect(page.locator('#hy-consent-banner')).toHaveCount(0);
        expect(matomoRequests.length).toBe(0);

        // Click trigger to reopen modal
        await page.evaluate(() => window.HypenosysConsent.openPreferences());
        await expect(page.locator('#hy-consent-modal-overlay')).toBeVisible();

        const isChecked = await page.isChecked('#hy-consent-toggle-analytics');
        expect(isChecked).toBe(false);
    });

    test('Case 3: Accept consent & dynamic Matomo initialization', async ({ page }) => {
        await page.goto('http://localhost:4000/index.html');
        await page.click('#hy-consent-btn-accept');

        // Banner disappears
        await expect(page.locator('#hy-consent-banner')).toHaveCount(0);

        // Decision saved
        const consentState = await page.evaluate(() => JSON.parse(localStorage.getItem('hypenosys_consent_v1')));
        expect(consentState.analytics).toBe(true);

        // Check _paq queue and matomo.js script tag
        const paqExists = await page.evaluate(() => Boolean(window._paq));
        expect(paqExists).toBe(true);

        const hasMatomoScript = await page.evaluate(() => Boolean(window.__hypenosysMatomoLoaded));
        expect(hasMatomoScript).toBe(true);
    });

    test('Case 4: Revoke consent after accepting', async ({ page }) => {
        await page.goto('http://localhost:4000/index.html');
        await page.click('#hy-consent-btn-accept');

        // Verify accepted
        let consentState = await page.evaluate(() => JSON.parse(localStorage.getItem('hypenosys_consent_v1')));
        expect(consentState.analytics).toBe(true);

        // Open preferences and reject
        await page.evaluate(() => window.HypenosysConsent.openPreferences());
        await page.click('#hy-consent-modal-btn-reject');

        // Verify state changed to rejected
        consentState = await page.evaluate(() => JSON.parse(localStorage.getItem('hypenosys_consent_v1')));
        expect(consentState.analytics).toBe(false);
    });

    test('Case 5: Mobile Viewport & Accessibility', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('http://localhost:4000/index.html');

        // Banner should fit on mobile without horizontal overflow
        const banner = page.locator('#hy-consent-banner');
        await expect(banner).toBeVisible();

        const box = await banner.boundingBox();
        expect(box.width).toBeLessThanOrEqual(390);

        // Test Escape key closes preferences modal
        await page.click('#hy-consent-btn-settings');
        await expect(page.locator('#hy-consent-modal-overlay')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.locator('#hy-consent-modal-overlay')).toHaveClass(/hy-consent-hidden/);
    });

    test('Case 6: Privacy page renders factual info and interactive trigger', async ({ page }) => {
        await page.goto('http://localhost:4000/privacidad.html');

        const heading = page.locator('h1');
        await expect(heading).toContainText('Privacidad');

        // Interactive button to trigger modal
        await page.click('[data-hy-consent-trigger]');
        await expect(page.locator('#hy-consent-modal-overlay')).toBeVisible();
    });

});
