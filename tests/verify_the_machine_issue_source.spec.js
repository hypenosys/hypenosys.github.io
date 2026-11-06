const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('The Machine GitHub issue source', () => {
  test('projects checked issue work items as separate read-only dashboard tasks', async ({ page }) => {
    const script = fs.readFileSync(path.resolve(__dirname, '../assets/javascript/github-api.js'), 'utf8');

    await page.addInitScript(() => {
      const data = new Map([['hy_active_workspace', 'the-machine']]);
      const storage = {
        getItem: key => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key)
      };
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
      Object.defineProperty(window, 'sessionStorage', { value: storage, configurable: true });
    });
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
          body: '- [x] **REF-01 — Reproduce manifest**\n- [ ] **GOV-01 — Ratification review <script>alert(1)</script>**\n- [x] **SEC-01 — Coverage review**\n- [ ] **CLOSE-01 — Independent review**',
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
      window.fetch = async url => {
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

    await page.goto('about:blank');
    await page.evaluate(script);

    const result = await page.evaluate(async () => {
      return await window.githubApi.fetchTasksWithDualRead('the-machine', false, true);
    });
    expect(result.readOnly).toBe(true);
    expect(result.content.schema_version).toBe('1.2.0');
    expect(result.content.tasks).toHaveLength(4);
    expect(result.content.tasks.map(task => task.id)).toEqual([
      '34-REF-01', '34-GOV-01', '34-SEC-01', '34-CLOSE-01'
    ]);
    expect(result.content.tasks.map(task => task.estado)).toEqual([
      'OK', 'Pending', 'OK', 'Pending'
    ]);
    expect(result.content.tasks[1].descripcion).not.toContain('<script>');

    const writeError = await page.evaluate(async () => {
      return window.githubApi.updateTask('34-GOV-01', { estado: 'OK' })
        .then(() => 'allowed')
        .catch(error => error.message);
    });
    expect(writeError).toContain('solo lectura');
  });
});
