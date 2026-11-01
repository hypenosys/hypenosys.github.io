const { test, expect } = require('@playwright/test');

const base = process.env.HAIS_MARKETS_TEST_URL || 'http://localhost:4000/hais/';

test.beforeEach(async ({ page }) => {
  // Do not call a real commercial quote source from CI.
  await page.route('https://s3.tradingview.com/**', route => route.abort());
});

test('market overview exposes actual provider instruments, no manufactured quotes', async ({ page }) => {
  await page.route('https://api.coingecko.com/**', route => route.fulfill({ status: 429, body: 'Rate limit' }));
  await page.goto(base);
  await expect(page.getByRole('heading', { name: /Lee el mercado/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cobertura del observatorio' })).toBeVisible();
  await expect(page.locator('a[data-pick="SSE:000300"]')).toContainText('CSI 300');
  await expect(page.locator('a[data-pick="BME:IBC"]')).toContainText('IBEX 35');
  await expect(page.getByRole('button', { name: 'APE / USD' })).toBeVisible();
  await expect(page.locator('#crypto-status')).toContainText('Sin cotización comprobada');
  await expect(page.locator('#crypto-body')).toContainText('Datos no disponibles');
  await expect(page.getByRole('link', { name: 'Operativa PAPER' })).toHaveAttribute('href', /\/hais\/operar\//);
});

test('selected market updates provider link and instrument title', async ({ page }) => {
  await page.route('https://api.coingecko.com/**', route => route.fulfill({ status: 429, body: 'Rate limit' }));
  await page.goto(base);
  await page.getByRole('button', { name: 'IBEX 35' }).click();
  await expect(page.locator('#selected-name')).toHaveText('IBEX 35');
  await expect(page.locator('#provider-link')).toHaveAttribute('href', 'https://www.tradingview.com/symbols/BME-IBC/');
  await page.getByRole('button', { name: 'US 10Y' }).click();
  await expect(page.locator('#selected-detail')).toContainText('TIR bonos soberanos');
  await page.getByRole('button', { name: 'APE / USD' }).click();
  await expect(page.locator('#selected-name')).toHaveText('ApeCoin / USD');
  await expect(page.locator('#provider-link')).toHaveAttribute('href', 'https://www.tradingview.com/symbols/COINBASE-APEUSD/');
});

test('CoinGecko actual-shaped provider response is attributed and time-stamped', async ({ page }) => {
  const now = Math.floor(Date.now() / 1000);
  await page.route('https://api.coingecko.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      bitcoin: { usd: 50234.52, usd_24h_change: -1.25, last_updated_at: now },
      ethereum: { usd: 3210.25, usd_24h_change: 2.5, last_updated_at: now },
      solana: { usd: 120.45, usd_24h_change: 0.54, last_updated_at: now },
      apecoin: { usd: 0.113625, usd_24h_change: -1.27, last_updated_at: now }
    })
  }));
  await page.goto(base);
  await expect(page.locator('#crypto-status')).toContainText('Datos reales recibidos de CoinGecko');
  await expect(page.locator('#crypto-body')).toContainText('Bitcoin');
  await expect(page.locator('#crypto-body')).toContainText('Ethereum');
  await expect(page.locator('#crypto-body')).toContainText('Solana');
  await expect(page.locator('#crypto-body')).toContainText('ApeCoin');
  await expect(page.locator('#crypto-body')).toContainText('0,113625');
});

test('Stale provider quote is rejected instead of shown as current', async ({ page }) => {
  const old = Math.floor(Date.now() / 1000) - 86400;
  await page.route('https://api.coingecko.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      bitcoin: { usd: 1, usd_24h_change: 1, last_updated_at: old },
      ethereum: { usd: 1, usd_24h_change: 1, last_updated_at: old },
      solana: { usd: 1, usd_24h_change: 1, last_updated_at: old },
      apecoin: { usd: 0.1, usd_24h_change: 1, last_updated_at: old }
    })
  }));
  await page.goto(base);
  await expect(page.locator('#crypto-status')).toContainText('Cotización caducada');
  await expect(page.locator('#crypto-body')).toContainText('Datos no disponibles');
});
