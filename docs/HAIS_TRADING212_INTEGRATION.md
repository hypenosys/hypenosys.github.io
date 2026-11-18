# HAIS — Trading 212 Live API (estado: planificación)
Fecha: 2026-11-02. Rama objetivo: develop.

## Estado verificable
- Terminal actual: `pages/hais-terminal.html`, `/hais/operar/`, PAPER y datos sintéticos; no ejecuta órdenes reales.
- Página pública de arquitectura y requisitos: `pages/hais-trading212.html`, `/hais/trading212/`.
- Integración Live: NO implementada, NO conectada, NO certificada para ninguna cuenta española.
- No usar resultados mock como si fueran cotizaciones, posiciones o ejecución reales.

## Objetivo
Conectar la cuenta Trading 212 Invest real de un usuario español a HAIS desde un backend seguro para lectura de saldos, posiciones e historial, y posteriormente —tras pruebas y autorizaciones— permitir órdenes confirmadas manualmente.

## Diseño por fases
1. Verificar disponibilidad de API en cuenta real española y permisos reales de clave. No recoger claves en HTML ni repositorio.
2. Crear backend autenticado y protegido, con secretos cifrados y aislamiento por usuario; permitir inicialmente SOLO LECTURA.
3. Integrar resumen de cuenta, posiciones, catálogo y órdenes con estados loading/error/sin acceso, timestamps y procedencia.
4. Preparar ticket de operación con vista previa de símbolo, lado, cantidad, divisa, tipo, riesgo y costes estimados; solicitar confirmación explícita.
5. Ejecutar órdenes Live únicamente tras autorización y pruebas. Nunca reintentar POST ciegamente: la API puede producir órdenes duplicadas. Usar estado transaccional interno y conciliación antes de cualquier reintento.
6. Añadir cancelación, reconciliación, auditoría (sin secretos), límites, validación de horario y manejo de errores 401/403/429/5xx.
7. Integrar en /hais/operar/ con selector de modo claramente diferenciado. PAPER sigue separado; LIVE deshabilitado mientras falte backend y validación.
8. Probar en dev.hypenosys.com, ejecutar pruebas de regresión y evaluación de seguridad; desplegar producción solo después de revisión.

## Criterios de aceptación
- Ningún secreto en HTML, localStorage, consola, logs o GitHub.
- Sin posiciones/saldos/precios de prueba etiquetados como reales.
- Conector real de solo lectura validado con respuesta de la API y permisos mínimos.
- Orden Live no posible sin confirmación explícita, protección anti-duplicado y trazabilidad.
- Fallos, límites de tasa, desconexiones y permisos revocados visibles y seguros.
- Responsive móvil/escritorio, enlace desde el terminal, pruebas automatizadas.
- Verificación de disponibilidad en cuenta española antes de habilitar Live.

## Referencias
- https://docs.trading212.com/api
- https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key
