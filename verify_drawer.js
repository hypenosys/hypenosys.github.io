const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Go to claude-chat
  await page.goto('http://localhost:4000/claude-chat.html');

  // Inject script to bypass any auth or blur if present (like in Jules Panel)
  // and open the drawer manually for the screenshot
  await page.evaluate(() => {
    if (typeof openJulesDrawer === 'function') {
        openJulesDrawer("Contenido de prueba de Claude para verificar el drawer.");
    } else {
        // Fallback if the function is not globally accessible yet or named differently
        const drawer = document.getElementById('jules-drawer');
        const overlay = document.getElementById('drawer-overlay');
        if (drawer) drawer.classList.add('active');
        if (overlay) overlay.classList.add('active');
    }
  });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'claude_drawer_verification.png', fullPage: true });

  await browser.close();
})();
