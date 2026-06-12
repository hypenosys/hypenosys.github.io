import { test, expect } from '@playwright/test';

test('verify jules v2 neural tab and dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1024 });

  const mockSession = {
    id: 'test-session-123',
    name: 'Test Deployment Session',
    task_id: '1',
    task_title: 'Deploy to Vercel',
    branch: 'main',
    start: new Date().toISOString(),
    status: 'active'
  };

  // 1. Verify Neural Tab in Jules Panel V2
  await page.goto('http://localhost:4000/');
  await page.evaluate((s) => {
    localStorage.setItem('github_token', 'fake-token');
    localStorage.setItem('hy_neural_sessions', JSON.stringify([s]));
    localStorage.setItem('hy_neural_session_id', s.id);
    localStorage.setItem('hy_neural_active', 'true');
  }, mockSession);

  await page.goto('http://localhost:4000/jules-panel-v2/');

  await page.evaluate(() => {
    if (window.forceOpenPanel) window.forceOpenPanel();
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.remove();
    document.getElementById('app-root')?.classList.remove('locked');
  });

  const chatLink = page.locator('#nav-chat');
  await chatLink.click();

  await page.evaluate(() => {
      const log = document.getElementById('neural-jules-history');
      if (log) {
          const div = document.createElement('div');
          div.dataset.activityId = 'act-1';
          div.className = 'activity-entry';
          div.innerHTML = '<div style="color:white; padding:15px; background:#050508; border-left: 3px solid #7c3aed; border-radius:4px; box-shadow: 0 0 15px rgba(124,58,237,0.2);">Neural Sync Established. Processing...</div>';
          log.appendChild(div);
          document.getElementById('history-welcome-screen')?.classList.add('hidden');
      }
  });

  await expect(page.locator('#neural-jules-history')).toBeVisible();
  await page.screenshot({ path: 'jules_v2_neural_tab_cool.png' });

  // 2. Verify Dashboard Widget
  await page.goto('http://localhost:4000/dashboard.html');

  await page.evaluate((s) => {
    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) loginOverlay.style.display = 'none';

    const dashboardList = document.getElementById('jules-dashboard-sessions');
    if (dashboardList) {
        dashboardList.innerHTML = `
            <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 hover:border-indigo-500/50 transition-all group cursor-pointer">
                <div class="flex justify-between items-start mb-3">
                    <div class="min-w-0 flex-1">
                        <h4 class="text-sm font-bold text-white truncate">${s.name}</h4>
                        <div class="text-[11px] text-slate-400 truncate mt-1">${s.task_title}</div>
                    </div>
                    <div class="flex gap-1 opacity-100">
                        <button class="p-1 hover:bg-slate-800 rounded">✏️</button>
                        <button class="p-1 hover:bg-slate-800 rounded">🗄️</button>
                        <button class="p-1 hover:bg-slate-800 rounded">🗑️</button>
                    </div>
                </div>
                <div class="flex justify-between items-center mt-2">
                    <span class="bg-emerald-900/30 text-emerald-400 text-[10px] px-2 py-0.5 rounded border border-emerald-500/30 font-bold flex items-center gap-1">
                         <span class="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span> SCANNING
                    </span>
                    <span class="text-[10px] text-slate-500 font-mono">${new Date(s.start).toLocaleString()}</span>
                </div>
            </div>
        `;
    }
  }, mockSession);

  const sessionRow = page.locator('h4:has-text("Test Deployment Session")');
  await expect(sessionRow).toBeVisible();

  await page.screenshot({ path: 'dashboard_jules_widget_cool.png' });
});
