---
title: "Auditoría web: misión, riesgo y conformidad"
date: 2026-11-18
status: "Remediación parcial; compliance total NO acreditado"
scope: "hypenosys.com / dev.hypenosys.com / hypenosys/hypenosys.github.io"
---

# Auditoría web Hypenosys — 18/11/2026

**Estado: REMEDIACIÓN PARCIAL.** Documento técnico y de control editorial; no constituye certificado de conformidad jurídica, auditoría pentest, dictamen profesional ni conformidad WCAG 2.2 AA acreditada.

## 1. Alcance y evidencia

Revisados el HTML público de la portada y /hais/; fuentes de `develop` (18/11/2026): `index.html`, `global-header.js`, `analytics-consent.js`, `privacidad.html`, `aviso-legal.md`, `cookies.md`, `_headers`, `admin_shell.html`, README, tests, workflows, mapa de rutas y documentación pública de THE MACHINE. Se ha contrastado la presencia de rutas, el código de consentimiento y la publicación declarada. El dominio de desarrollo, las cabeceras HTTP efectivas, el servidor Matomo y los proveedores no se han instrumentado con un navegador real durante esta revisión. Las comprobaciones estáticas no prueban ausencia de tráfico.

No se ha inspeccionado la configuración privada de Cloudflare, Matomo, proveedores de identidad ni registros internos. En particular no se ha practicado auditoría de intrusión, cookies reales en diferentes navegadores, contrastes WCAG completos ni una prueba de accesibilidad con lector de pantalla.

## 2. Misión pública y reglas editoriales

**Misión canónica propuesta:** «Convertir preguntas creativas y problemas técnicos en experimentos útiles, comprensibles y contrastables, combinando software, arte e IA para ampliar la autonomía de quienes crean y utilizan estas herramientas».

**Método:** crear (prototipos y herramientas), comprobar (distinguir hipótesis de resultados), compartir (código o documentación cuando licencias, privacidad y derechos lo permitan). Evitar «todo es open source» y «todo está en producción».

**Semántica de estados obligatoria:**
- **Conceptual**: documentos e hipótesis, sin atribuir capacidades ejecutables.
- **Prototipo/demostración**: funciones acotadas y limitaciones explícitas.
- **Operativo**: solo si hay evidencia de despliegue y pruebas, sin suponer fiabilidad.
- **Repositorio público/privado**: condición separada del estado funcional y del licenciamiento.

Ejemplos confirmados: HAIS ofrece observatorio y simulador PAPER sin operativa real; THE MACHINE declara fase conceptual HOLD / NO-GO; esta web tiene código e historial públicos. Otros repositorios de Hypenosys no deben anunciarse como públicos cuando no lo son.

## 3. Registro de hallazgos y controles

| ID | Severidad | Hallazgo o riesgo | Estado tras esta PR | Criterio de cierre |
|---|---|---|---|---|
| WEB-01 | Alta | La misión anterior era demasiado general y no explicaba el método | Corregido editorialmente | H1, misión, principios y ejemplos coherentes en portada |
| WEB-02 | Alta | Ambigüedad «open source» vs repositorios privados | Corregido editorialmente | Cada proyecto distingue acceso público, estado funcional y licencias |
| WEB-03 | Alta | Aviso legal: domicilio/identificación y aplicabilidad LSSI por evaluar | **Abierto; revisión jurídica** | Identificación legal conforme a actividades reales y obligación aplicable; sin publicar datos inventados |
| WEB-04 | Crítica de proceso | RGPD art. 13: destinatarios, encargados, transferencias y plazos por tratamiento incompletos | **Abierto** | Inventario documentado, contratos si proceden, plazos y bases jurídicas verificadas |
| WEB-05 | Alta | Matomo: anonimización, cookies, duración, revocación y flujos de red sin prueba integral | **Abierto** | Perfil de red con consentimiento ausente/rechazado/aceptado/revocado; revisión de panel y cookie jar |
| WEB-06 | Alta | Atribuciones absolutas «no se envían datos» ignoraban funciones de terceros | Redacción corregida | Mapa de egress efectivo por servicio y textos concordantes |
| WEB-07 | Alta | PAT y API keys en localStorage pueden ser leídos por JavaScript del origen | Aviso y documentación corregidos; arquitectura **abierta** | Threat model; privilegio mínimo; alternativa de credenciales efímeras o BFF si se necesita |
| WEB-08 | Alta | Autenticación/administración en HTML público; no es control de autorización | **Abierto** | Inspección de endpoints de escritura y autorización en origen por recurso y por usuario |
| WEB-09 | Alta | Faltaban cabeceras de endurecimiento y CSP/HSTS sin verificar | **Parcial:** nosniff y Referrer-Policy para estáticos Pages; CSP/HSTS y Functions siguen abiertos | Verificar cabeceras efectivas, CSP Report-Only y despliegue gradual sin bloquear scripts inline |
| WEB-10 | Media-alta | Dropdowns eran `div` activados por hover, inaccesibles por teclado | Mejorado con botones y `:focus-within`; pendiente test real | Tab/Shift+Tab, Enter, Escape, lector de pantalla y móvil pasan |
| WEB-11 | Media | Falta de acceso rápido al contenido tras cabecera persistente | Mejorado en páginas con `#contenido` | Foco visible y salto funcional desde primera tabulación |
| WEB-12 | Media | Consentimiento: contraste y tamaño inferior en opción Rechazar | Ajuste CSS; validación pendiente | Igual visibilidad y facilidad en ambas acciones; prueba AEPD |
| WEB-13 | Media | Tests de Matomo exigían inicialización en localhost, contrario al fail-closed | Corregida expectativa; ejecución CI pendiente | Dominios no permitidos jamás cargan Matomo |
| WEB-14 | Media | Tech Stack histórico decía «todo lo que usamos» y «Studio» | Cabecera matizada; resto heredado | Auditoría de 62 entradas: actual/histórico/experimental, sin promesas falsas |
| WEB-15 | Media | Optimización/consistencia SEO, social metadata, idioma y 404 | Mejorada portada y 404 | Validate canonical, cards OG, metadatos y sitemap con herramientas externas |
| WEB-16 | Media | Solo CI de release a master; develop no tenía guard de misión | Guardrail específico en PR a develop/master | Pipeline sin errores y build Jekyll en PR |
| WEB-17 | Alta | Verificar licencias y atribuciones heredadas (`LICENSE.md`) | **Abierto** | Inventario y licencia válida por activo, incluyendo código ajeno |
| WEB-18 | Media | Peso y dependencias (Bootstrap/jQuery, scripts, mapas), Core Web Vitals no medidos | **Abierto** | Lighthouse móvil/escritorio, tamaños, LCP/INP/CLS y presupuesto sin regresiones |
| WEB-19 | Media | Integraciones TradingView/CoinGecko y otras cargas: transparencia y consentimiento por uso real | **Abierto** | Inventario de solicitudes, cookies, jurisdicción, política y base aplicable |
| WEB-20 | Media | Frontend público con modales de administración visibles en el DOM incluso antes de autenticación | No retirados para evitar romper perfiles/administración | Separación UX pública/interna sin regresión y autorización real |
| WEB-21 | Media | Uso de tarjetas y palabras antiguas de videojuegos en páginas históricas | Parcial | Revisión editorial de todas las rutas enlazadas; señalización de documentos históricos |
| WEB-22 | Media | Domicilios alternativos, subdominios y redirecciones aún no verificados de extremo a extremo | **Abierto** | Pruebas HTTPS, TLS, www/apex, canonicals, CDN, robots y ausencia de 404 |
| WEB-23 | Media | Misión y privacidad deben poder leerse sin JavaScript | Mejorado HTML estático | Prueba con JS desactivado y lectura desde HTML compilado |

La severidad expresa la prioridad interna, no la existencia probada de una infracción. No todas las obligaciones legales son necesariamente aplicables al proyecto en su estado declarado.

## 4. Verificación de accesibilidad (objetivo WCAG 2.2 AA)

Revisar por teclado: cabecera, dropdowns, CTA, modales y cierre/foco; semántica de encabezados, texto alternativo, controles de formulario, nombre/rol/valor, foco no oculto bajo cabecera sticky, densidad táctil, zoom 200/400 %, contraste mínimo 4,5:1 en texto común, modo movimiento reducido y lectores NVDA/VoiceOver/TalkBack. El trabajo de esta PR mejora semántica y foco, pero no certifica WCAG AA. **Especialmente** comprobar el `GlobalHeader` dinámico, sus menús y los diálogos de consentimiento.

## 5. Privacidad y regulación — cuestiones de hecho pendientes

Antes de proclamar cumplimiento: decidir si y cómo aplica la LSSI-CE al proyecto y cuál es su prestador; completar información conforme RGPD arts. 12-14 y derechos, categorías de datos, finalidades, bases, conservación, encargados y transferencias; comprobar que el consentimiento analítico no está premarcado y que Rechazar es equiparable a Aceptar; inspeccionar cookies de Matomo y terceros; validar la retirada de consentimiento y posible duración máxima. Si hay formularios, crear primera capa informativa específica; si se habilita comercio, financiación, recomendaciones financieras, usuarios menores o nuevas finalidades, repetir evaluación.

**No** publicar domicilio, NIF, bases jurídicas inventadas, duraciones de cookies supuestas ni garantías absolutas de ausencia de transferencias. Pueden requerirse datos legales reales para cerrar WEB-03/04: decisión externa a esta PR.

## 6. Seguridad — prioridades

El HTML de administración público permite inspeccionar interfaces y rutas; ello por sí solo no demuestra acceso no autorizado. La autorización debe aplicarse en los endpoints y repositorios, nunca únicamente en el navegador. Reducir exposición de tokens almacenados; evitar PAT clásicos de ámbito general; inventariar scripts/iframes externos y sinks de HTML; configurar cabeceras tras validar compatibilidad; revisar dependencias, workflows, despliegues, permisos OAuth y relay de Cloudflare. No introducir una CSP estricta a ciegas: el proyecto tiene scripts inline y dependencias legítimas que pueden romperse.

## 7. Puertas de aceptación

1. `npm run test:site-audit` pasa y valida misión, pruebas públicas, disclaimers de privacidad, enlaces y accesibilidad base.
2. `node --check assets/javascript/global-header.js` y `node --check assets/javascript/analytics-consent.js` pasan.
3. `bundle exec jekyll build` genera `_site/index.html`, `/aviso-legal/`, `/privacidad/` y `/cookies/`.
4. Revisión visual real a 390, 768, 1024 y 1440 px con sesión limpia y autenticada, y control de que login, perfiles y herramientas no regresan.
5. Consentimiento real: sin visita Matomo anterior a aceptar; rechazar no dispara solicitudes; aceptar solo en hosts autorizados; revocar limpia cookies y no envía nuevos eventos. Verificar con red y navegador, no solo leyendo JS.
6. Revisión externa legal y seguridad para WEB-03/04/05/07/08/09/17/19. **No marcar compliance total hasta completarlas.**

## 8. Referencias oficiales

- RGPD (UE) 2016/679, artículos 12-14: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- LSSI-CE Ley 34/2002, arts. 10 y 22: https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758
- Guía de cookies AEPD: https://www.aepd.es/guias/guia-cookies.pdf
- AEPD deber de información: https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/6-el-deber-de-informacion
- WCAG 2.2: https://www.w3.org/TR/WCAG22/

## 9. Cloudflare Pages: estáticos y Functions

`_headers` incorpora `X-Content-Type-Options: nosniff` y `Referrer-Policy: strict-origin-when-cross-origin` para las respuestas **estáticas**; no introduce CSP, COOP ni HSTS sin inventariar compatibilidad. Referencia: https://developers.cloudflare.com/pages/configuration/headers/.

**Importante:** Cloudflare Pages no aplica estas reglas automáticamente a las respuestas de `functions/`. Se deben auditar individualmente las rutas `/api/ai/*`, autorización, errores y cabeceras. Un archivo de configuración no acredita la presencia efectiva de headers: inspeccionar la respuesta real en producción y desarrollo.
