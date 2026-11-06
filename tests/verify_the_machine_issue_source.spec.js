const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('The Machine GitHub issue source', () => {
  test('projects Issues as read-only dashboard tasks and excludes pull requests', async ({ page }) => {
    const script = fs.readFileSync(path.resolve(__dirname, '../assets/javascript/github-api.js'), 'utf8');
    await page.goto('about:blank');
    await page.addInitScript(() => {
      const source = {
        taskSource: {
          kind: 'github-issues',
          repository: 'hypenosys/the_machine',
          readOnly: true
        }
      };
      const issues = [
        {
          number: 34,
          title: 'Evidence review',
          body: '- [x] Reproduce manifest\n- [ ] Independent review\n<script>alert(1)</script>',
          state: 'open',
          labels: [{ name: 'priority: high' }],
          assignees: [{ login: 'Axlfc' }],
          created_at: '2026-11-06T18:00:00Z',
          updated_at: '2026-11-06T19:00:00Z'
        },
        {
          number: 35,
          title: 'Not a task',
          state: 'open',
          pull_request: { url: 'https://api.github.com/repos/hypenosys/the_machine/pulls/35' }
        }
      ];
      window.fetch = async (url) => {
        if (url.includes('/contents/_data/orgs/the-machine/meta.json')) {
          const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(source))));
          return new Response(JSON.stringify({ content: encoded, sha: 'meta-sha' }), { status: 200 });
        }
        if (url.includes('/repos/hypenosys/the_machine/issues?')) {
          return new Response(JSON.stringify(issues), { status: 200 });
        }
        return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
      };
    });
    await page.evaluate(script);

    const result = await page.evaluate(async () => {
      return await window.githubApi.fetchTasksWithDualRead('the-machine', false, true);
    });
    expect(result.readOnly).toBe(true);
    expect(result.content.schema_version).toBe('1.2.0');
    expect(result.content.tasks).toHaveLength(1);

    const task = result.content.tasks[0];
    expect(task.id).toBe(34);
    expect(task.source).toMatchObject({
      provider: 'github-issues',
      repository: 'hypenosys/the_machine',
      issue_number: 34,
      read_only: true
    });
    expect(task.completitud).toBe(0.5);
    expect(task.descripcion).not.toContain('<script>');

    const writeError = await page.evaluate(async () => {
      return window.githubApi.updateTask(34, { estado: 'OK' })
        .then(() => 'allowed')
        .catch(error => error.message);
    });
    expect(writeError).toContain('solo lectura');
  });
});
