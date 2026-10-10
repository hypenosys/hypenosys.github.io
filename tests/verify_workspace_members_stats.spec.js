const { test, expect } = require('@playwright/test');

test.describe('Sharded organization member and stats isolation', () => {
  test('uses per-org meta memberships instead of the organizations index', async ({ page }) => {
    await page.goto('http://localhost:4000/dashboard.html');
    await page.waitForFunction(() => typeof window.hydrateWorkspaceOrganizations === 'function');
    const memberships = await page.evaluate(async () => {
      window.githubApi.fetchOrgMetaWithDualRead = async id => ({
        content: { id, members: id === 'hypenosys' ? [{ handle: 'Axlfc' }, { handle: 'DkDidac-Design' }] : [{ handle: 'silmaril464' }] }
      });
      window.currentUser = 'axlfc';
      const orgs = await window.hydrateWorkspaceOrganizations([
        { id: 'hypenosys', name: 'Hypenosys' },
        { id: 'other', name: 'Other' }
      ]);
      return { orgs, myOrgs: window.getUserOrganizations(orgs).map(item => item.id) };
    });
    expect(memberships.myOrgs).toEqual(['hypenosys']);
    expect(memberships.orgs[0].members).toHaveLength(2);
    expect(memberships.orgs[1].members).toHaveLength(1);
  });

  test('statistics count only the selected workspace tasks and its members', async ({ page }) => {
    await page.goto('http://localhost:4000/dashboard.html');
    await page.waitForFunction(() => typeof window.buildWorkspaceStats === 'function' && !!window.githubApi?.computeLayerA);
    const stats = await page.evaluate(() => {
      const orgs = [
        { id: 'hypenosys', members: [{ handle: 'axlfc' }, { handle: 'topperh4rley' }] },
        { id: 'other', members: [{ handle: 'different' }] }
      ];
      const profiles = { members: {
        Axel: { github_username: 'axlfc' },
        Alex: { github_username: 'topperh4rley' },
        Other: { github_username: 'different' }
      } };
      const tasks = [
        { id: 1, organizationId: 'hypenosys', estado: 'OK', milestone: 'M1', fecha: '2026-10-09', start_date: '2026-10-08', asignados: ['axlfc'], resuelto_por: 'Axel', task_type: 'feature', tags: [] },
        { id: 2, organizationId: 'hypenosys', estado: 'Pending', milestone: 'M1', fecha: '2026-10-09', asignados: ['topperh4rley'], task_type: 'bug', tags: [] },
        { id: 3, organizationId: 'other', estado: 'OK', milestone: 'M1', fecha: '2026-10-09', start_date: '2026-10-08', asignados: ['different'], task_type: 'feature', tags: [] }
      ];
      const scoped = window.buildWorkspaceStats(tasks.filter(t => t.organizationId === 'hypenosys'), [], 'hypenosys', orgs, profiles, { burnout: { current_milestone: 'M1' } });
      return { global: scoped.global, keys: Object.keys(scoped.members), completed: scoped.members.axlfc.completed.all_time, total: scoped.group.milestone_tasks_remaining, workspace: scoped.workspace_id };
    });
    expect(stats.workspace).toBe('hypenosys');
    expect(stats.global.total_ok).toBe(1);
    expect(stats.global.total_tasks).toBe(2);
    expect(stats.keys.sort()).toEqual(['axlfc', 'topperh4rley']);
    expect(stats.completed).toBe(1);
    expect(stats.total).toBe(1);
  });

  test('profile cards include only active organization members', async ({ page }) => {
    await page.goto('http://localhost:4000/dashboard.html');
    await page.waitForFunction(() => typeof window.renderTeamProfiles === 'function');
    const result = await page.evaluate(() => {
      window.currentUser = 'axlfc';
      window.githubApi.getActiveWorkspace = () => 'hypenosys';
      window.__workspaces__ = [{ id: 'hypenosys', members: [{ handle: 'axlfc' }] }];
      currentProfiles = { members: {
        Axel: { github_username: 'axlfc', display_name: 'El Afaces', role: 'Developer', bio: 'Descripción actualizada', links: {} },
        Other: { github_username: 'other', display_name: 'Other user' }
      }};
      currentStats = { members: { axlfc: { completed: { all_time: 2 }, avg_completion_speed: { days: 1 }, volatility: { reopens: 0 } } } };
      renderTeamProfiles();
      const cards = [...document.querySelectorAll('#team-profiles-grid [data-member]')].map(x => x.getAttribute('data-member'));
      return { text: document.querySelector('#team-profiles-grid').textContent, cards };
    });
    expect(result.text).toContain('El Afaces');
    expect(result.text).toContain('Descripción actualizada');
    expect(result.text).not.toContain('Other user');
  });
});
