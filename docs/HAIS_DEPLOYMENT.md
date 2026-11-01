# HAIS — acceso web y límites de operativa

## URLs previstas en develop

- **Terminal PAPER:** https://dev.hypenosys.com/hais/
- **Estado del proyecto y Kanban:** https://dev.hypenosys.com/hais/estado/
- **Demo genérica del AI Control Center:** https://dev.hypenosys.com/hais/demo/
- **Dashboard Hypenosys:** https://dev.hypenosys.com/dashboard.html

La rama `develop` incluye las páginas Jekyll: `pages/hais-terminal.html`, `pages/hais.md` y `pages/hais-prototype.html`. Cada una tiene un permalink único para evitar dos fuentes que intenten generar el mismo `/hais/index.html`.

## Qué funciona en el terminal

- Panel responsive con efectivo, posiciones, patrimonio y P/L en USD **ficticios**.
- Precios de escenario AAPL/MSFT/NVDA sintetizados y editables manualmente; gráfico de historial local, sin feed de cotizaciones.
- Compra y venta **PAPER locales** con confirmación y validaciones: saldo, cantidad, tenencia, límite conservador ilustrativo del 30% por activo, parada de compras.
- Persistencia en `localStorage`, historial, eventos locales, exportación JSON y reinicio.
- Comprobación optativa y de solo lectura de `GET /api/hais/health` y `GET /api/hais/v1/capabilities`, y cálculo teórico con `POST /api/hais/v1/paper/estimate` **si** se configura un gateway same-origin.

**Importante:** ninguna compra o venta de la interfaz se manda al backend. El backend actual solo estima nominales y devuelve `executed=false` / `persisted=false`. No hay datos de mercado reales, cartera persistida en servidor, autorización de estrategia ni ejecución con dinero. Las reglas de la demo no implican aprobación de una política de riesgo. Un navegador o usuario diferente verá otra simulación.

## Contrato seguro pendiente para operativa PAPER de backend

La configuración de hosting **debe** disponer de un reverse proxy con autenticación / sesión y control de permisos para usar `/api/hais`. No publicar el servicio FastAPI anónimo, ni almacenar API keys, tokens de bróker o secretos en Jekyll/JS/localStorage. No habilitar LIVE.

El siguiente hito exige diseñar `GET /v1/paper/portfolio`, `GET /v1/paper/quotes`, `GET /v1/paper/orders`, `POST /v1/paper/orders`, `POST /v1/paper/kill-switch` con autenticación, CSRF, multi-tenant, idempotencia, auditoría, validación de datos y persistencia. **No existen aún** en HAIS: el terminal no debe llamarlos ni simular que existen. Antes de desarrollar esas rutas se deben aprobar reglas de estrategia, fuentes de precios/señales y límites de riesgo.

## Publicación y pruebas

El CNAME del repositorio apunta a `hypenosys.com`. No cambiarlo al subdominio de desarrollo. El hosting de `dev.hypenosys.com` debe publicar explícitamente `develop`; el commit por sí solo no demuestra que el dominio esté actualizado.

```bash
bundle exec jekyll build
test -f _site/hais/index.html
test -f _site/hais/demo/index.html
test -f _site/hais/estado/index.html
npx playwright test tests/verify_hais_terminal.spec.js
curl -IL --fail https://dev.hypenosys.com/hais/
```

Comprobar sin backend que el indicador permanece desconectado y que la simulación opera solo en localStorage; con gateway autenticado, verificar el contrato PAPER antes de mostrar conexión. No declarar publicación en el dominio ni backend activo sin evidencia.
