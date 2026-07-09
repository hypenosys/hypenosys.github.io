const { test, expect } = require('@playwright/test');

test('dropdown should stay open when moving mouse slowly from toggle to content', async ({ page }) => {
  // We'll use index.html which should have the global header
  await page.goto('http://localhost:4000/');

  const dropdownToggle = page.locator('.gh-nav-item >> text=Plataforma');
  const dropdownContent = page.locator('.gh-nav-item:has-text("Plataforma") .gh-dropdown-content');

  // 1. Hover over the toggle
  await dropdownToggle.hover();
  await expect(dropdownContent).toBeVisible();

  // 2. Get bounding boxes to calculate the move
  const toggleBox = await dropdownToggle.boundingBox();
  const contentBox = await dropdownContent.boundingBox();

  // Calculate the gap center. margin-top is 0.25rem (~4px)
  // toggleBox.y + toggleBox.height is the bottom of the toggle
  // contentBox.y is the top of the content
  const gapY = toggleBox.y + toggleBox.height + 2;
  const centerX = toggleBox.x + toggleBox.width / 2;

  // 3. Move mouse slowly to the gap
  await page.mouse.move(centerX, gapY);

  // 4. Check if content is still visible.
  // If there's a bug, it might disappear here or shortly after.
  // We wait a bit to ensure any transition/event has fired.
  await page.waitForTimeout(200);

  const isVisible = await dropdownContent.isVisible();
  if (!isVisible) {
    console.log('BUG DETECTED: Dropdown closed when mouse is in the gap.');
  }

  // 5. Move mouse to the content
  await page.mouse.move(centerX, contentBox.y + 10);
  await page.waitForTimeout(200);

  await expect(dropdownContent).toBeVisible();
});
