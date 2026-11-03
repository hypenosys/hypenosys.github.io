# HAIS / Trading 212 — integración real (2026-11-03)

**Estado:** diseño documentado; **no conectado aún a una cuenta real por API**, no existen claves en este repositorio. Seguimiento: [issue #453](https://github.com/hypenosys/hypenosys.github.io/issues/453).

## Contrato de integración
La web de Hypenosys (Jekyll/GitHub Pages) es un frontend público y **no** debe llamar directamente a Trading 212 con secretos. El navegador llama a un backend privado autentificado (p. ej. Cloudflare Worker con secretos en el entorno) que valida acceso, enmascara credenciales, aplica cuotas y registra órdenes.

- Endpoint upstream live: `https://live.trading212.com/api/v0`.
- Autenticación upstream: HTTP Basic con `TRADING212_API_KEY` y `TRADING212_API_SECRET` como usuario/contraseña.
- Acceso soportado según documentación oficial: Invest y Stocks ISA, no CFD. Trading real solo en moneda principal de cuenta.
- Endpoints read-only upstream: `/equity/account/summary`, `/equity/positions`, `/equity/orders`, `/equity/metadata/instruments`, `/equity/history/orders`, `/equity/history/transactions`.
- Órdenes upstream: `POST /equity/orders/market`, `/limit`, `/stop`, `/stop_limit`; venta mediante cantidad negativa. No reintentar POST a ciegas.
- Los tokens del frontend **no** son los secretos del bróker. No persistir claves de Trading 212 en `localStorage`, HTML, logs, commits o acciones públicas.

## Endpoints propuestos del backend HAIS
`GET /api/broker/status`, `GET /api/broker/account`, `GET /api/broker/positions`, `GET /api/broker/orders`, `GET /api/markets/quotes?symbols=...`, `POST /api/broker/orders/preview`, `POST /api/broker/orders`.

Las respuestas deben indicar `source`, `asOf`, `delayed`, `currency` y `status`, y nunca rellenar precios inexistentes con datos mock. `POST /api/broker/orders` deshabilitado por defecto: requiere sesión válida, permiso específico, límites de riesgo, protección contra órdenes duplicadas y confirmación interactiva para cada orden. La confirmación solo se puede dar para una orden concreta con ticker, sentido, tipo, cantidad, costes y riesgo mostrados.

## Cobertura de mercados
S&P 500, Nasdaq, CSI 300, IBEX 35, bonos, materias primas y criptomonedas (BTC/ETH/APE). El catálogo de Trading 212 describe instrumentos **operables**, no suministra necesariamente una fuente completa de cotizaciones de todos estos mercados. Incorporar adaptadores separados de datos con cobertura, licencias, recuento de errores, frecuencia de actualización y etiqueta de diferido/real.

## Próximas verificaciones
1. Crear API Key y API Secret en `Settings > API (Beta)` de Trading 212, con **solo lectura** inicialmente, guardados en el backend, nunca en el chat.
2. Desplegar API backend privado, configurar autenticación de usuarios y CORS hacia el frontend de Hypenosys.
3. Comprobar cuenta/posiciones reales sin ejecutar operaciones; incorporar cotizaciones verificadas.
4. Añadir y ensayar flujo de órdenes con confirmación específica; habilitar live únicamente tras validación de controles, sin operaciones automáticas sin consentimiento específico.

Referencias oficiales: https://docs.trading212.com/api/section/authentication y https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key
