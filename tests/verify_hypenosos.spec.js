const { test, expect } = require('@playwright/test');

const fakeRepoApi = `
window.githubApi = {
  validateToken: async () => ({
    valid: !window.__HY_UNAUTHORIZED__,
    user: { login: 'verified-tester', isTeamMember: true, avatar_url: 'https://example.test/avatar.png' }
  }),
  getActiveWorkspace: () => 'hypenosys',
  fetchOrgMetaWithDualRead: async () => ({
    content: { members: [{ handle: 'verified-tester', roles: ['member'] }] }
  })
};
window.taskOps = {
  getAllTasks: async () => [
    { id: 88, organizationId: 'hypenosys', title: 'Contrato', estado: 'Pending', prioridad: 'Critical', blocked_by: [], asignados: ['verified-tester'], change_log: [{timestamp: '2026-11-06T19:00:00Z', author_login: 'verified-tester', field: 'created', new_value: 'registered'}] },
    { id: 90, organizationId: 'hypenosys', title: 'Mission task', estado: 'Working', prioridad: 'Major', blocked_by: [88], asignados: ['verified-tester'] },
    { id: 91, organizationId: 'hypenosys', title: 'Task Flow task', estado: 'In Review', prioridad: 'Critical', blocked_by: [], asignados: ['verified-tester'], pull_request_url: 'https://github.com/hypenosys/hypenosys.github.io/pull/470' },
    { id: 92, organizationId: 'other-org', title: 'Private other workspace', estado: 'Pending', blocked_by: [], asignados: [] },
  ]
};
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/assets/javascript/github-api.js', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: fakeRepoApi
  }));
});

test('Mission Control shows authorized workspace data and dependency blockers', async ({ page }) => {
  await page.goto('http://localhost:4000/control/mission/');
  await expect(page.locator('#eco-content')).toBeVisible();
  await expect(page.getByText('Cola priorizada · origen Hypenosys')).toBeVisible();
  await expect(page.getByText('Mission task').first()).toBeVisible();
  await expect(page.getByText('Actividad registrada')).toBeVisible();
  await expect(page.getByText('Private other workspace')).toHaveCount(0);
  await expect(page.getByText('Espera #88')).toBeVisible();
  await page.getByRole('link', { name: /#90 · Mission task/ }).click();
  await expect(page).toHaveURL(/\/control\/task-flow\/\?task=90/);
  await expect(page.locator('.eco-task-detail h2')).toContainText('Mission task');
});

test('Task Flow navigates real task inspector without inventing merge state', async ({ page }) => {
  await page.goto('http://localhost:4000/control/task-flow/?task=91');
  await expect(page.locator('#eco-content')).toBeVisible();
  await expect(page.locator('.eco-task-detail h2')).toContainText('Task Flow task');
  await expect(page.getByRole('link', { name: 'PR referenciada (merge no verificado)' })).toBeVisible();
  await page.getByRole('button', { name: /#90 · Mission task/ }).click();
  await expect(page).toHaveURL(/\?task=90/);
  await expect(page.locator('.eco-task-detail')).toContainText('Dependencias pendientes');
  await expect(page.locator('.eco-task-detail')).toContainText('#88');
});

test('unauthorized users never see task data', async ({ page }) => {
  await page.addInitScript(() => { window.__HY_UNAUTHORIZED__ = true; });
  await page.goto('http://localhost:4000/control/mission/');
  await expect(page.locator('#eco-loading')).toContainText('Acceso denegado');
  await expect(page.locator('#eco-content')).toBeHidden();
  await expect(page.getByText('Mission task')).toHaveCount(0);
});
