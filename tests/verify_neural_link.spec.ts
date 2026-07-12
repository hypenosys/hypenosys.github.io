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
  await page.goto('http://localhost:4000/claude-chat.html');

  await page.evaluate(() => {
      localStorage.setItem('hy_neural_active', 'true');
      localStorage.setItem('hy_neural_task_context', JSON.stringify({ id: '123', titulo: 'Test Task' }));

      document.getElementById('claude-main-interface')?.classList.remove('hidden');
      document.getElementById('claude-auth-loading')?.classList.add('hidden');
      document.getElementById('claude-auth-gate')?.classList.add('hidden');

      if (typeof window.init === 'function') window.init();
  });

  const toggleJules = page.locator('.dual-send-option[data-mode="jules"]');
  await toggleJules.click();

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'claude_dual_send_toggle.png' });
});
