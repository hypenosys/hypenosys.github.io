const { test, expect } = require('@playwright/test');

test.describe('Organization membership mutations', () => {
  test('add member uses the authoritative meta.json and updates local UI', async ({ page }) => {
    await page.goto('http://localhost:4000/dashboard.html');
    await page.waitForFunction(() => typeof window.handleAddOrgMember === 'function');
    const result = await page.evaluate(async () => {
      window.githubApi.user = { login: 'Axlfc' };
      __workspaces__ = [{
        id: 'hypenosys', name: 'Hypenosys', createdBy: 'Axlfc',
        members: [{ handle: 'axlfc', roles: [], teams: [] }]
      }];
      window.__workspaces__ = __workspaces__;
      window.__writtenPath = null;
      window.githubApi.atomicWrite = async (path, mutate) => {
        window.__writtenPath = path;
        const meta = { id: 'hypenosys', createdBy: 'Axlfc', members: [{ handle: 'axlfc', teams: [], roles: [] }] };
        const edited = mutate(meta);
        return { success: true, content: edited.content || edited };
      };
      window.openManageMembersModal('hypenosys');
      document.getElementById('add-member-input').value = 'TopperH4rley';
      await window.handleAddOrgMember();
      return { path: window.__writtenPath, handles: __workspaces__[0].members.map(m => m.handle) };
    });
    expect(result.path).toBe('_data/orgs/hypenosys/meta.json');
    expect(result.handles).toContain('topperh4rley');
    expect(result.handles).toContain('axlfc');
  });

  test('non-creators cannot add a member', async ({ page }) => {
    await page.goto('http://localhost:4000/dashboard.html');
    await page.waitForFunction(() => typeof window.handleAddOrgMember === 'function');
    const result = await page.evaluate(async () => {
      window.githubApi.user = { login: 'DifferentUser' };
      __workspaces__ = [{ id: 'hypenosys', name: 'Hypenosys', createdBy: 'Axlfc', members: [{ handle: 'axlfc' }] }];
      window.__workspaces__ = __workspaces__;
      window.__writtenPath = null;
      window.githubApi.atomicWrite = async path => { window.__writtenPath = path; throw Error('Unexpected write'); };
      window.openManageMembersModal('hypenosys');
      document.getElementById('add-member-input').value = 'anotheruser';
      await window.handleAddOrgMember();
      return {
        path: window.__writtenPath,
        disabled: document.getElementById('add-member-btn').disabled,
        message: document.getElementById('add-member-error').textContent
      };
    });
    expect(result.path).toBeNull();
    expect(result.disabled).toBe(true);
    expect(result.message).toContain('Solo la persona creadora');
  });

  test('Bootstrap modal backdrop overlays sticky header', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 690 });
    await page.goto('http://localhost:4000/dashboard.html');
    await page.waitForFunction(() => !!window.authManager);
    await page.evaluate(() => window.authManager.showSettingsModal());
    await expect(page.locator('#settingsModal')).toBeVisible();
    const z = await page.evaluate(() => ({
      header: Number(getComputedStyle(document.querySelector('.gh-navbar')).zIndex),
      backdrop: Number(getComputedStyle(document.querySelector('.modal-backdrop')).zIndex),
      dialog: Number(getComputedStyle(document.querySelector('#settingsModal')).zIndex)
    }));
    expect(z.header).toBeLessThan(z.backdrop);
    expect(z.backdrop).toBeLessThan(z.dialog);
  });
});
