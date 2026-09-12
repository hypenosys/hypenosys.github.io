const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Sharding Migration Verification', () => {
  let orgsFile;
  let tasksFile;
  let archiveFile;

  test.beforeAll(() => {
    // Read real source files from repo root
    const rootDir = path.resolve(__dirname, '..');
    orgsFile = JSON.parse(fs.readFileSync(path.join(rootDir, '_data', 'organizations.json'), 'utf8'));
    tasksFile = JSON.parse(fs.readFileSync(path.join(rootDir, '_data', 'dashboard_tasks.json'), 'utf8'));
    archiveFile = JSON.parse(fs.readFileSync(path.join(rootDir, '_data', 'dashboard_tasks_archive.json'), 'utf8'));
  });

  test('should calculate counts dynamically and run idempotent sharding migration on in-memory mock', async ({ page }) => {
    // Calculate expected dynamic counts from real source files
    const organizations = orgsFile.organizations || [];
    const allTasks = tasksFile.tasks || [];
    const allArchive = archiveFile.tasks || [];

    const expectedCounts = {};
    for (const org of organizations) {
      const orgId = org.id;
      const members = org.members || [];
      const orgTasks = allTasks.filter(t => (t.organizationId || 'hypenosys') === orgId);
      const orgArchive = allArchive.filter(t => (t.organizationId || 'hypenosys') === orgId);

      expectedCounts[orgId] = {
        members: members.length,
        tasks: orgTasks.length,
        archive: orgArchive.length
      };
    }

    console.log('[TEST] Dynamically calculated expected counts:', expectedCounts);

    // Setup in-memory mock storage for Playwright page
    await page.addInitScript(({ mockOrgs, mockTasks, mockArchive }) => {
      window.__mockStorage = {
        '_data/organizations.json': JSON.parse(JSON.stringify(mockOrgs)),
        '_data/dashboard_tasks.json': JSON.parse(JSON.stringify(mockTasks)),
        '_data/dashboard_tasks_archive.json': JSON.parse(JSON.stringify(mockArchive))
      };

      // Mock window.githubApi methods for pure in-memory execution without remote calls
      window.githubApi = window.githubApi || {};

      window.githubApi.fetchFileWithSha = async (filePath, contentType = 'json', forceRemote = false) => {
        const item = window.__mockStorage[filePath];
        if (item === undefined) {
          return { content: null, sha: null };
        }
        return {
          content: JSON.parse(JSON.stringify(item)),
          sha: 'mock-sha-' + Date.now()
        };
      };

      window.githubApi.atomicWrite = async (filePath, mutatorFn, commitMessage, options = {}) => {
        let current = window.__mockStorage[filePath];
        if (current === undefined) {
          if (options.createIfMissing) {
            current = null;
          } else {
            throw new Error(`File ${filePath} not found`);
          }
        } else {
          current = JSON.parse(JSON.stringify(current));
        }

        const mutatorResult = await mutatorFn(current);
        let newContent = mutatorResult && mutatorResult.hasOwnProperty('content') ? mutatorResult.content : mutatorResult;

        window.__mockStorage[filePath] = JSON.parse(JSON.stringify(newContent));
        return { success: true, changed: true, content: newContent };
      };
    }, { mockOrgs: orgsFile, mockTasks: tasksFile, mockArchive: archiveFile });

    // Inject sharding-migration.js code into browser context
    const migrationScript = fs.readFileSync(path.resolve(__dirname, '../assets/javascript/sharding-migration.js'), 'utf8');
    await page.goto('about:blank');
    await page.evaluate(migrationScript);

    // Run Migration #1
    const report1 = await page.evaluate(async () => {
      return await window.runShardingMigration();
    });

    expect(report1.success).toBe(true);
    expect(report1.summary.failed).toBe(0);
    expect(report1.summary.succeeded).toBe(organizations.length);

    // Verify verified counts match expected counts
    for (const org of organizations) {
      const orgId = org.id;
      const orgReport = report1.orgs[orgId];
      expect(orgReport).toBeDefined();
      expect(orgReport.success).toBe(true);

      const exp = expectedCounts[orgId];
      expect(orgReport.counts.verified.members).toBe(exp.members);
      expect(orgReport.counts.verified.tasks).toBe(exp.tasks);
      expect(orgReport.counts.verified.archive).toBe(exp.archive);

      // Verify created meta.json structure and member object conversion
      const metaContent = await page.evaluate((id) => window.__mockStorage[`_data/orgs/${id}/meta.json`], orgId);
      expect(metaContent).toBeDefined();
      expect(metaContent.id).toBe(orgId);
      expect(metaContent.members.length).toBe(exp.members);
      metaContent.members.forEach(m => {
        expect(m).toHaveProperty('handle');
        expect(m).toHaveProperty('teams');
        expect(m).toHaveProperty('roles');
      });
    }

    // Run Migration #2 for Idempotency
    const report2 = await page.evaluate(async () => {
      return await window.runShardingMigration();
    });

    expect(report2.success).toBe(true);
    expect(report2.summary.failed).toBe(0);
    expect(report2.summary.succeeded).toBe(organizations.length);

    for (const org of organizations) {
      const orgId = org.id;
      const exp = expectedCounts[orgId];
      const orgReport = report2.orgs[orgId];
      expect(orgReport.counts.verified.members).toBe(exp.members);
      expect(orgReport.counts.verified.tasks).toBe(exp.tasks);
      expect(orgReport.counts.verified.archive).toBe(exp.archive);
    }

    console.log('[TEST] Sharding migration test completed successfully with idempotency verified!');
  });
});
