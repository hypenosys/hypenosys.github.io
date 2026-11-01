const { test, expect } = require('@playwright/test');

const base = process.env.HAIS_TEST_URL || 'http://localhost:4000/hais/';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/hais/**', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Gateway not configured in test' })
  }));
  await page.goto(base);
  await page.evaluate(() => localStorage.removeItem('hais-paper-terminal-v1'));
  await page.reload();
});

test('HAIS shows synthetic values and records PAPER buy/sell locally', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await expect(page.getByRole('heading', { name: /Operativa y valores/ })).toBeVisible();
  await expect(page.getByText('SYNTHETIC / MANUAL')).toBeVisible();
  await expect(page.locator('#api-status')).toHaveText('API no disponible desde esta web');
  await expect(page.locator('#position-count')).toHaveText('0 abiertas');

  await page.locator('#quantity').fill('2');
  await page.getByRole('button', { name: 'Registrar compra PAPER' }).click();
  await expect(page.locator('#position-count')).toHaveText('1 abiertas');
  await expect(page.locator('#positions-body')).toContainText('AAPL');
  await expect(page.locator('#trades-body')).toContainText('BUY');

  await page.reload();
  await expect(page.locator('#position-count')).toHaveText('1 abiertas');
  await page.locator('#side').selectOption('SELL');
  await page.locator('#quantity').fill('2');
  await page.getByRole('button', { name: 'Registrar venta PAPER' }).click();
  await expect(page.locator('#position-count')).toHaveText('0 abiertas');
  await expect(page.locator('#trades-body')).toContainText('SELL');
});

test('Stop switch blocks PAPER buys and does not attempt backend orders', async ({ page }) => {
  await page.getByRole('button', { name: 'Activar parada de compras' }).click();
  await expect(page.locator('#order-button')).toBeDisabled();
  await expect(page.locator('#halt-status')).toContainText('PARADA ACTIVA');
  await page.locator('#side').selectOption('SELL');
  await expect(page.locator('#order-button')).toBeEnabled();
  await page.locator('#side').selectOption('BUY');
  await page.getByRole('button', { name: 'Reactivar compras PAPER' }).click();
  await expect(page.locator('#order-button')).toBeEnabled();
});

test('Gateway estimates only and never receives local buy/sell orders', async ({ page }) => {
  await page.unroute('**/api/hais/**');
  const called = [];
  await page.route('**/api/hais/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    called.push({ method: request.method(), path });
    if (path.endsWith('/health')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok","mode":"PAPER"}' });
    if (path.endsWith('/v1/capabilities')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"mode":"PAPER","live_trading_enabled":false,"broker_connections":false,"orders_persisted":false}' });
    if (path.endsWith('/v1/paper/estimate')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"mode":"PAPER","symbol":"AAPL","quantity":1,"notional":184.25,"executed":false,"persisted":false}' });
    return route.fulfill({ status: 404 });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#refresh-api').click();
  await expect(page.locator('#api-status')).toContainText('HAIS disponible');
  await page.locator('#estimate').click();
  await expect(page.locator('#feedback')).toContainText('executed=false, persisted=false');
  await page.locator('#order-button').click();
  await expect(page.locator('#position-count')).toHaveText('1 abiertas');
  expect(called.filter(call => call.method === 'POST').map(call => call.path)).toEqual(['/api/hais/v1/paper/estimate']);
  expect(called.some(call => call.path.includes('/orders'))).toBe(false);
});
