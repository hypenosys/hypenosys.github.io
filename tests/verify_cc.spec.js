const { test, expect } = require('@playwright/test');

test('Verify Command Center modules and risk widget presence', async ({ page }) => {
  await page.goto('http://localhost:4000/command-center/');

  // The element should be in the DOM even if hidden by the login gate
  const riskWidget = page.locator('#cc-risk-widget');
  await expect(riskWidget).toBeAttached();

  // Verify the script contains our new modules and functions
  const content = await page.content();
  expect(content).toContain('id: \'asset-library\'');
  expect(content).toContain('id: \'asset-pipeline\'');
  expect(content).toContain('id: \'risk-tracker\'');
  expect(content).toContain('function renderRiskWidget');
});

test('Verify validateToken dynamically resolves team membership from team_profiles.json', async ({ page }) => {
  await page.goto('http://localhost:4000/command-center/');

  // Mock GitHub /user endpoint response for a team member in team_profiles.json
  const res = await page.evaluate(async () => {
    // Inject mock token
    window.githubApi.setToken('ghp_mock_token_for_testing', true);

    // Override fetch to simulate GitHub /user for silmaril464
    const origFetch = window.fetch;
    window.fetch = async function (url, opts) {
      if (typeof url === 'string' && url.includes('api.github.com/user')) {
        return new Response(JSON.stringify({
          login: 'silmaril464',
          avatar_url: 'https://github.com/silmaril464.png'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return origFetch.apply(this, arguments);
    };

    return await window.githubApi.validateToken();
  });

  expect(res.valid).toBe(true);
  expect(res.user.isTeamMember).toBe(true);
  expect(res.user.login).toBe('silmaril464');
});
