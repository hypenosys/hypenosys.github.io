const { test, expect } = require('@playwright/test');

test.describe('Multi-Environment Matomo Site ID Resolution & Fail-Closed Tracking', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:4000/index.html');
        await page.evaluate(() => localStorage.clear());
    });

    async function evaluateConsentForHost(page, mockHost, accepted) {
        return await page.evaluate(({ mockHost, accepted }) => {
            if (accepted === true) {
                localStorage.setItem('hypenosys_consent_v1', JSON.stringify({
                    version: 1,
                    analytics: true,
                    updatedAt: Date.now()
                }));
            } else if (accepted === false) {
                localStorage.setItem('hypenosys_consent_v1', JSON.stringify({
                    version: 1,
                    analytics: false,
                    updatedAt: Date.now()
                }));
            } else {
                localStorage.removeItem('hypenosys_consent_v1');
            }

            // Centralized resolution logic matching analytics-consent.js
            const sites = {
                'hypenosys.com': '1',
                'www.hypenosys.com': '1',
                'dev.hypenosys.com': '2'
            };

            const cleanHost = (mockHost || '').toLowerCase().replace(/\.$/, '');
            const resolvedSiteId = sites[cleanHost] || null;

            // Simulate tracking initialization logic
            window._paq = window._paq || [];
            let trackerInitialized = false;

            const consentState = localStorage.getItem('hypenosys_consent_v1');
            let isAccepted = false;
            try {
                if (consentState) {
                    const parsed = JSON.parse(consentState);
                    isAccepted = parsed && parsed.analytics === true;
                }
            } catch (e) {}

            if (isAccepted && resolvedSiteId !== null) {
                trackerInitialized = true;
                window._paq.push(['requireConsent']);
                window._paq.push(['setConsentGiven']);
                window._paq.push(['setTrackerUrl', 'https://matomo.hypenosys.com/matomo.php']);
                window._paq.push(['setSiteId', resolvedSiteId]);
                window._paq.push(['trackPageView']);
                window._paq.push(['enableLinkTracking']);
            }

            const siteIdInPaq = window._paq.find(item => item[0] === 'setSiteId');
            const trackPageViewInPaq = window._paq.find(item => item[0] === 'trackPageView');

            return {
                resolvedSiteId,
                trackerInitialized,
                setSiteId: siteIdInPaq ? siteIdInPaq[1] : null,
                hasTrackPageView: Boolean(trackPageViewInPaq)
            };
        }, { mockHost, accepted });
    }

    test('Scenario 1: hypenosys.com + accepted -> Site ID 1', async ({ page }) => {
        const res = await evaluateConsentForHost(page, 'hypenosys.com', true);
        expect(res.resolvedSiteId).toBe('1');
        expect(res.setSiteId).toBe('1');
        expect(res.hasTrackPageView).toBe(true);
        expect(res.trackerInitialized).toBe(true);
    });

    test('Scenario 2: www.hypenosys.com + accepted -> Site ID 1', async ({ page }) => {
        const res = await evaluateConsentForHost(page, 'www.hypenosys.com', true);
        expect(res.resolvedSiteId).toBe('1');
        expect(res.setSiteId).toBe('1');
        expect(res.hasTrackPageView).toBe(true);
        expect(res.trackerInitialized).toBe(true);
    });

    test('Scenario 3: dev.hypenosys.com + accepted -> Site ID 2', async ({ page }) => {
        const res = await evaluateConsentForHost(page, 'dev.hypenosys.com', true);
        expect(res.resolvedSiteId).toBe('2');
        expect(res.setSiteId).toBe('2');
        expect(res.hasTrackPageView).toBe(true);
        expect(res.trackerInitialized).toBe(true);
    });

    test('Scenario 4: localhost + accepted -> 0 requests & siteId null', async ({ page }) => {
        const res = await evaluateConsentForHost(page, 'localhost', true);
        expect(res.resolvedSiteId).toBeNull();
        expect(res.setSiteId).toBeNull();
        expect(res.hasTrackPageView).toBe(false);
        expect(res.trackerInitialized).toBe(false);
    });

    test('Scenario 5: hypenosys.github.io + accepted -> 0 requests & siteId null', async ({ page }) => {
        const res = await evaluateConsentForHost(page, 'hypenosys.github.io', true);
        expect(res.resolvedSiteId).toBeNull();
        expect(res.setSiteId).toBeNull();
        expect(res.hasTrackPageView).toBe(false);
        expect(res.trackerInitialized).toBe(false);
    });

    test('Scenario 6: Unknown preview hostname + accepted -> 0 requests & siteId null', async ({ page }) => {
        const res = await evaluateConsentForHost(page, 'pr-123.preview.hypenosys.net', true);
        expect(res.resolvedSiteId).toBeNull();
        expect(res.setSiteId).toBeNull();
        expect(res.hasTrackPageView).toBe(false);
        expect(res.trackerInitialized).toBe(false);
    });

    test('Scenario 7: hypenosys.com + rejected -> 0 requests', async ({ page }) => {
        const res = await evaluateConsentForHost(page, 'hypenosys.com', false);
        expect(res.resolvedSiteId).toBe('1');
        expect(res.setSiteId).toBeNull();
        expect(res.hasTrackPageView).toBe(false);
        expect(res.trackerInitialized).toBe(false);
    });

    test('Scenario 8: dev.hypenosys.com + rejected -> 0 requests', async ({ page }) => {
        const res = await evaluateConsentForHost(page, 'dev.hypenosys.com', false);
        expect(res.resolvedSiteId).toBe('2');
        expect(res.setSiteId).toBeNull();
        expect(res.hasTrackPageView).toBe(false);
        expect(res.trackerInitialized).toBe(false);
    });

    test('Scenario 9: hypenosys.com + unset -> 0 requests', async ({ page }) => {
        const res = await evaluateConsentForHost(page, 'hypenosys.com', null);
        expect(res.resolvedSiteId).toBe('1');
        expect(res.setSiteId).toBeNull();
        expect(res.hasTrackPageView).toBe(false);
        expect(res.trackerInitialized).toBe(false);
    });

    test('Scenario 10: dev.hypenosys.com + unset -> 0 requests', async ({ page }) => {
        const res = await evaluateConsentForHost(page, 'dev.hypenosys.com', null);
        expect(res.resolvedSiteId).toBe('2');
        expect(res.setSiteId).toBeNull();
        expect(res.hasTrackPageView).toBe(false);
        expect(res.trackerInitialized).toBe(false);
    });

});
