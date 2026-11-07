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

test('HAIS gateway accepts only attributed four-coin USD observations (offline fixture)', async ({ page }) => {
  const observed_at = new Date().toISOString();
  const quotes = [
    ['BTC', 'Bitcoin', 50234.52], ['ETH', 'Ethereum', 3210.25],
    ['SOL', 'Solana', 120.45], ['APE', 'ApeCoin', 0.113625]
  ].map(([symbol, name, value]) => ({
    symbol, name, value, currency: 'USD', change_24h_pct: 1.5,
    observed_at, source: 'CoinGecko', kind: 'provider-price'
  }));
  await page.route('**/api/hais/v1/market/crypto', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ mode: 'OBSERVE', source: 'CoinGecko', quotes })
  }));
  await page.route('https://api.coingecko.com/**', route => route.fulfill({ status: 429, body: 'Rate limit' }));
  await page.goto(base);
  await expect(page.locator('#crypto-status')).toContainText('Datos reales recibidos de HAIS / CoinGecko');
  await expect(page.locator('#crypto-body')).toContainText('ApeCoin');
  await expect(page.locator('#crypto-body')).toContainText('0,113625');
});

test('unattributed HAIS crypto is rejected, never shown as verified price', async ({ page }) => {
  const observed_at = new Date().toISOString();
  const quotes = ['BTC', 'ETH', 'SOL', 'APE'].map(symbol => ({
    symbol, value: 123.45, currency: 'USD', change_24h_pct: 0,
    observed_at, source: symbol === 'APE' ? 'synthetic' : 'CoinGecko', kind: 'provider-price'
  }));
  await page.route('**/api/hais/v1/market/crypto', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ mode: 'OBSERVE', source: 'CoinGecko', quotes })
  }));
  await page.route('https://api.coingecko.com/**', route => route.fulfill({ status: 429, body: 'Rate limit' }));
  await page.goto(base);
  await expect(page.locator('#crypto-status')).toContainText('Sin cotización comprobada');
  await expect(page.locator('#crypto-body')).toContainText('Datos no disponibles');
  await expect(page.locator('#crypto-body')).not.toContainText('123,45');
});

test('FRED gateway accepts recent daily observations, never execution prices', async ({ page }) => {
  const observation_date = new Date().toISOString().slice(0, 10);
  await page.route('**/api/hais/v1/market/treasury', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      mode: 'OBSERVE', source: 'FRED',
      quotes: ['DGS2', 'DGS10'].map((symbol, i) => ({
        symbol, value: 4.1 + i / 10, unit: 'percent_yield',
        change_previous_bps: 2, observation_date, source: 'FRED / US Treasury'
      }))
    })
  }));
  await page.route('https://api.coingecko.com/**', route => route.fulfill({ status: 429, body: 'Rate limit' }));
  await page.goto(base);
  await expect(page.locator('#treasury-status')).toContainText('Dato validado de HAIS / FRED');
  await expect(page.locator('#treasury-body')).toContainText('DGS2');
  await expect(page.locator('#treasury-body')).toContainText('DGS10');
});

test('future FRED observation is rejected without fabricated fallback', async ({ page }) => {
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.route('**/api/hais/v1/market/treasury', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      mode: 'OBSERVE', source: 'FRED',
      quotes: ['DGS2', 'DGS10'].map(symbol => ({
        symbol, value: 99.9, unit: 'percent_yield',
        change_previous_bps: 2, observation_date: future, source: 'FRED / US Treasury'
      }))
    })
  }));
  await page.route('https://api.coingecko.com/**', route => route.fulfill({ status: 429, body: 'Rate limit' }));
  await page.goto(base);
  await expect(page.locator('#treasury-status')).toContainText('Gateway no conectado o fuente no disponible');
  await expect(page.locator('#treasury-body')).toContainText('Sin lectura FRED disponible');
  await expect(page.locator('#treasury-body')).not.toContainText('99.900');
});

test('stale FRED gateway yields are rejected without presenting a fabricated rate', async ({ page }) => {
  const observation_date = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  await page.route('**/api/hais/v1/market/treasury', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      mode: 'OBSERVE', source: 'FRED',
      quotes: ['DGS2', 'DGS10'].map(symbol => ({
        symbol, value: 99.9, unit: 'percent_yield',
        change_previous_bps: 2, observation_date, source: 'FRED / US Treasury'
      }))
    })
  }));
  // Offline fixture: no actual provider prices, and no stale yields displayed.
  await page.route('https://api.coingecko.com/**', route => route.fulfill({ status: 429, body: 'Rate limit' }));
  await page.goto(base);
  await expect(page.locator('#treasury-status')).toContainText('Gateway no conectado o fuente no disponible');
  await expect(page.locator('#treasury-body')).toContainText('Sin lectura FRED disponible');
  await expect(page.locator('#treasury-body')).not.toContainText('99.900');
});

test('stale HAIS gateway crypto is not shown as current even with valid attribution', async ({ page }) => {
  const observed_at = new Date(Date.now() - 86400000).toISOString();
  const quotes = [
    ['BTC', 'Bitcoin'], ['ETH', 'Ethereum'],
    ['SOL', 'Solana'], ['APE', 'ApeCoin']
  ].map(([symbol, name]) => ({
    symbol, name, value: 98765.4321, currency: 'USD',
    change_24h_pct: 1.5, observed_at, source: 'CoinGecko',
    kind: 'provider-price'
  }));
  await page.route('**/api/hais/v1/market/crypto', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ mode: 'OBSERVE', source: 'CoinGecko', quotes })
  }));
  // No live upstream in CI: the stale gateway must never become a verified quote.
  await page.route('https://api.coingecko.com/**', route => route.fulfill({ status: 429, body: 'Rate limit' }));
  await page.goto(base);
  await expect(page.locator('#crypto-status')).toContainText('Cotización caducada');
  await expect(page.locator('#crypto-body')).toContainText('Datos no disponibles');
  await expect(page.locator('#crypto-body')).not.toContainText('98.765');
});
