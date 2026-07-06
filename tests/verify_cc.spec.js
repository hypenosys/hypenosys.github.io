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
