const { test, expect } = require('@playwright/test');

test('Verify Personal Kanban dropdown filtering, auto-population, visual badges, and flexible filters with page.route', async ({ page }) => {
  // Capture page console messages
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  // Set viewport to desktop layout
  await page.setViewportSize({ width: 1280, height: 1024 });

  // Helper to mock GitHub contents API
  const mockGithubContent = (content) => {
    const base64Content = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
    return {
      content: base64Content,
      sha: 'mock-sha-value-12345'
    };
  };

  // Mock organizations.json
  const mockOrgs = {
    schema_version: '1.0.0',
    organizations: [
      { id: 'hypenosys', name: 'Hypenosys', members: ['axlfc'] },
      { id: 'empty-space-videogames', name: 'Empty Space Videogames', members: ['axlfc', 'topperh4rley'] },
      { id: 'other-org', name: 'Other Org', members: ['topperh4rley'] } // User axlfc is NOT a member!
    ],
    _audit_log: []
  };

  // Mock dashboard_tasks.json
  const mockTasks = {
    schema_version: '1.2.0',
    tasks: [
      { id: 101, title: 'Remote Hypenosys Task', estado: 'ToDo', asignados: ['axlfc'], organizationId: 'hypenosys' },
      { id: 102, title: 'Remote Empty Space Task', estado: 'Working', asignados: ['axlfc'], organizationId: 'empty-space-videogames' },
      { id: 103, title: 'Other Org Task', estado: 'Pending', asignados: ['axlfc'], organizationId: 'other-org' } // Should be skipped!
    ],
    _audit_log: []
  };

  // Mock empty stats and budget
  const mockStats = { schema_version: '1.1.0', computed_at: '2026-07-29T12:00:00Z', global: {}, members: {}, group: {} };
  const mockBudget = { monthly_records: [], burnout: { current_milestone: 'M1', milestones: [] } };

  // Intercept GitHub API calls
  await page.route('**/user', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ login: 'axlfc', id: 12345 })
    });
  });

  await page.route('**/contents/_data/organizations.json*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockGithubContent(mockOrgs))
    });
  });

  await page.route('**/contents/_data/dashboard_tasks.json*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockGithubContent(mockTasks))
    });
  });

  await page.route('**/contents/_data/dashboard_tasks_archive.json*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockGithubContent({ tasks: [] }))
    });
  });

  await page.route('**/contents/_data/studio_stats.json*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockGithubContent(mockStats))
    });
  });

  await page.route('**/contents/_data/studio_budget.json*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockGithubContent(mockBudget))
    });
  });

  // Seed localStorage and sessionStorage before navigation
  await page.addInitScript(() => {
    localStorage.setItem('gh_access_token', 'mock-github-token-12345');
    localStorage.setItem('hy_active_workspace', 'personal');

    // Seed local personal tasks to localStorage for both axlfc and guest to avoid any race conditions
    const localTasksPayload = {
      schema_version: '1.2.0',
      last_updated: new Date().toISOString(),
      last_updated_by: 'Test',
      tasks: [
        { id: 501, title: 'Local Personal Task', estado: 'Pending', tags: ['local'], organizationId: 'personal', asignados: ['axlfc'] }
      ]
    };
    localStorage.setItem('hypenosys_personal_kanban_tasks_axlfc', JSON.stringify(localTasksPayload));
    localStorage.setItem('hypenosys_personal_kanban_tasks_guest', JSON.stringify(localTasksPayload));
  });

  // Navigate to dashboard.html
  await page.goto('http://localhost:4000/dashboard.html');

  // Wait for initial render of dashboard
  await page.waitForTimeout(3000);

  // 1. Verify Dropdown Filtering by Membership:
  // Open the workspace dropdown menu
  await page.click('#workspace-menu-button');
  await page.waitForSelector('#workspace-menu');

  // Verify that Hypenosys and Empty Space Videogames are visible
  const dropdownText = await page.textContent('#workspace-menu');
  expect(dropdownText).toContain('Hypenosys');
  expect(dropdownText).toContain('Empty Space Videogames');
  // Verify that Other Org is NOT visible (user axlfc is not in members)
  expect(dropdownText).not.toContain('Other Org');

  // Close the menu
  await page.click('#workspace-menu-button');

  // 2. Verify Auto-Population of Kanban Board:
  const boardText = await page.textContent('#kanban-board');
  // Local task should be visible
  expect(boardText).toContain('Local Personal Task');
  // Remote assigned tasks from user's orgs should be visible
  expect(boardText).toContain('Remote Hypenosys Task');
  expect(boardText).toContain('Remote Empty Space Task');
  // Remote task from other-org (not user's org) should NOT be visible
  expect(boardText).not.toContain('Other Org Task');

  // 3. Verify Visual Distinction by Origin:
  // Find the badges for each of the remote tasks
  const hypenosysBadge = page.locator('#kanban-board span.badge:has-text("HYPENOSYS")').first();
  await expect(hypenosysBadge).toBeVisible();

  const emptySpaceBadge = page.locator('#kanban-board span.badge:has-text("EMPTY SPACE VIDEOGAMES")').first();
  await expect(emptySpaceBadge).toBeVisible();

  const personalBadge = page.locator('#kanban-board span.badge:has-text("PERSONAL")').first();
  await expect(personalBadge).toBeVisible();

  // 4. Verify Origin Organization Filter Row:
  // Toggle the advanced filters container
  await page.click('#kanban-filters-toggle');
  await page.waitForSelector('#kanban-filter-container');

  // Locate the "Orgs" filter row
  const orgsFilterRow = page.locator('#kanban-filter-container >> text=Orgs');
  await expect(orgsFilterRow).toBeVisible();

  // Take a high-quality screenshot for visual evidence
  await page.screenshot({ path: 'verification/verify_personal_kanban_features.png' });
  console.log('SUCCESS: All Personal Kanban features verified perfectly with page.route.');
});
