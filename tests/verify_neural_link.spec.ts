import { test, expect } from '@playwright/test';

test('verify multiple selection and dual-send toggle', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1024 });

  // 1. Verify Multiple Selection in Jules Panel V2
  await page.goto('http://localhost:4000/jules-panel/');

  await page.evaluate(() => {
    localStorage.setItem('github_token', 'fake-token');
    if (window.forceOpenPanel) window.forceOpenPanel();
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.remove();
    document.getElementById('app-root')?.classList.remove('locked');
  });

  const chatLink = page.locator('.hnav-link[data-view="chat"]');
  await chatLink.click();

  // Inject multiple activities to test selection
  await page.evaluate(() => {
    const log = document.getElementById('neural-jules-history');
    if (log) {
        document.getElementById('history-welcome-screen')?.classList.add('hidden');
        log.innerHTML = '';
        for(let i=1; i<=3; i++) {
            const div = document.createElement('div');
            div.className = 'activity-entry';
            div.dataset.activityId = 'act-' + i;
            div.innerHTML = '<div class="activity-selection-checkbox"></div><div style="padding:10px; color:white;">Activity ' + i + '</div>';
            div.onclick = () => window.toggleActivitySelection(div, { id: 'act-' + i, description: 'Content ' + i });
            log.appendChild(div);
        }
    }
  });

  await page.click('[data-activity-id="act-1"]');
  await page.click('[data-activity-id="act-2"]');

  // Wait for toolbar animation
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'jules_multiple_selection.png' });

  // 2. Verify Dual-Send Toggle in Claude Chat
  const context = await page.context();
  const newPage = await context.newPage();
  await newPage.setViewportSize({ width: 1280, height: 1024 });

  await newPage.addInitScript(() => {
    window.localStorage.setItem('gh_access_token', 'mock_token');
    window.localStorage.setItem('github_user', JSON.stringify({ login: 'testuser', avatar_url: '' }));
    window.localStorage.setItem('hy_neural_active', 'true');
    window.localStorage.setItem('hy_neural_task_context', JSON.stringify({ id: '123', titulo: 'Test Task' }));

    // Setup fetch interception to mock GitHub responses
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
        const urlStr = String(url);
        if (urlStr.includes('api.github.com')) {
            if (urlStr.includes('/user')) {
                return new Response(JSON.stringify({ login: 'testuser', name: 'Test User', avatar_url: '' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
    };

    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('authReady', {
        detail: { user: { login: 'testuser', avatar_url: '' } }
      }));
    }, 500);
  });

  await newPage.goto('http://localhost:4000/chat/neural/');
  await newPage.waitForSelector('#claude-main-interface', { state: 'visible', timeout: 15000 });

  const modeSelector = newPage.locator('#mode-selector-btn');
  await modeSelector.click();

  const toggleJules = newPage.locator('#mode-dropdown button:has-text("Jules")');
  await toggleJules.click();

  await newPage.waitForTimeout(500);
  await newPage.screenshot({ path: 'claude_dual_send_toggle.png' });
});
