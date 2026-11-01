# HAIS — Observatorio multi-mercado y operativa PAPER

## Rutas de develop

- Mercados externos (sin valores simulados): https://dev.hypenosys.com/hais/
- Terminal PAPER **separado**, de entrenamiento local: https://dev.hypenosys.com/hais/operar/
- Estado del proyecto y tareas: https://dev.hypenosys.com/hais/estado/
- Demo AI independiente: https://dev.hypenosys.com/hais/demo/
- Dashboard Hypenosys: https://dev.hypenosys.com/dashboard.html

Las fuentes Jekyll y sus permalink son únicos. La ruta principal /hais/ ya NO abre el antiguo simulador.

## Observatorio real

`pages/hais-markets.html` incorpora los widgets oficiales de TradingView (Market Overview y Advanced Chart) para:
- S&P 500 (SP:SPX)
- NASDAQ Composite (NASDAQ:IXIC) y NASDAQ 100 (NASDAQ:NDX)
- CSI 300 (SSE:000300)
- IBEX 35 (BME:IBC)
- Rentabilidades soberanas a 10 años de EE. UU., Alemania, España y China (TVC:US10Y, TVC:DE10Y, TVC:ES10Y, TVC:CN10Y)
- Oro, plata, WTI y Brent (referencias TVC; no spot ejecutable)
- Cripto BTC/USD, ETH/USD, SOL/USDT; divisas EUR/USD y USD/JPY.

La API pública de CoinGecko permite mostrar **datos numéricos reales** de BTC, ETH y SOL, con fecha/hora y cambio 24h, sin almacenar secretos. Si faltan campos, hay rate limit, el dato es antiguo o la red falla se muestran **datos no disponibles**, nunca datos inventados. El widget controla su propia actualización.

**Licencias:** TradingView permite los widgets integrados, respetando marca y sus condiciones. La integración del widget no otorga una API de precios a HAIS. Los índices y acciones pueden llevar retraso por condiciones de las bolsas, y algunas plazas/símbolos no están disponibles para widgets. Los instrumentos TVC son series derivadas/calculadas por TradingView, no necesariamente cotizaciones spot de bolsa. Ver https://www.tradingview.com/widget-docs/faq/data/ . Para ingestión programática con uso interno/redistribución hay que contratar y verificar proveedores y su licencia. Evitar el scraping no autorizado de Investing/Yahoo/Stooq o reproducir datos con derechos.

## Lectura programática en HAIS (PR #2)

La rama propuesta https://github.com/hypenosys/HAIS/pull/2 añade:
- `GET /v1/market/catalog`: clases y símbolos, distinguiendo `access=api` de `access=tradingview-widget`.
- `GET /v1/market/crypto`: CoinGecko, moneda USD, cambio 24h, origen, observación, TTL 60 s.
- `GET /v1/market/treasury`: FRED DGS2/DGS10, rendimiento % y variación en puntos básicos; fecha diaria; TTL 900 s.

Estos endpoints necesitan integración, CI, despliegue y acceso protegido antes de estar disponibles en dev. Nunca presentar una API no desplegada como activa. La API es read-only y no obtiene valores autorizados de SP500, NASDAQ, CSI300, IBEX35 o commodities para decisiones internas, aún pendientes de proveedor. No hay órdenes automáticas ni LIVE.

## Simulador

`/hais/operar/` contiene el antiguo terminal PAPER aislado con precios sintéticos introducidos por el usuario. Conserva historial, efectivo y operaciones locales en navegador. NO envía órdenes al backend, ni usa valores del widget como precio de ejecución, ni replica mercado real. La seguridad de compras y ventas está solo en la simulación; hasta acordar estrategia, fuente de precios autorizada, límites y autenticación no conectar órdenes de servidor.

## Publicación y QA

La configuración existente de `develop` utiliza el workflow `.github/workflows/deploy-dev-pages.yml`, con build Jekyll y Cloudflare Pages `hypenosys-dev`. El archivo CNAME no se debe modificar. Comprobar que el workflow dispone de credenciales y finaliza sin errores; la existencia del commit no demuestra despliegue público.

```bash
bundle exec jekyll build --source . --destination ./_site --baseurl ""
test -f _site/hais/index.html
test -f _site/hais/operar/index.html
test -f _site/hais/estado/index.html
test -f _site/hais/demo/index.html
npx playwright test tests/verify_hais_markets.spec.js tests/verify_hais_terminal.spec.js
curl -IL --fail https://dev.hypenosys.com/hais/
```

Las pruebas funcionales de widgets de terceros dependen de disponibilidad y licencias; no declarar que se ha verificado una cotización real en CI cuando solo se ha probado el marco. Revisar latencia, CORS de CoinGecko, errores 429, navegación mobile y etiquetado de fuente.
