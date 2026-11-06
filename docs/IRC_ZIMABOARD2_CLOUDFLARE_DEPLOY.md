# IRC híbrido Hypenosys — ZimaBoard2 + Cloudflare Tunnel

**Fecha:** 2026-11-06. **Estado:** guía de despliegue planificada; **NO** hay evidencia de que los DNS, el tunnel, ZimaBoard2, IRCd ni los gateways estén desplegados. UI inicial en `pages/irc-hybrid.html` (permalink `/irc/`) + `assets/javascript/hypenosys-irc.js` (rama feature).

## Alcance real y rutas

```text
Browser ── HTTPS ── Cloudflare Edge ── Cloudflare Tunnel (cloudflared en ZimaBoard2)
           irc.hypenosys.com                  └─ reverse proxy HTTP :8080
                                                     ├─ GET /...    → Jekyll build / webapp
                                                     ├─ WSS /webirc → Ergo IRCd :8067
                                                     └─ /api/irc/*  → gateway TC/Hyp con SSO (PENDIENTE)
                                                 IRCd cuenta/salas/historia real
                                                 TC canonical project event ledger (PENDIENTE)
```

Separación:
- **IRC Web/Canales:** conexión IRCv3 real por `wss://irc.hypenosys.com/webirc` con `JOIN`, `LIST`, `PRIVMSG`. Si no hay servidor, mostrar desconectado. Los nicks invitados no son identidades TC.
- **Bots/Bridges/Incidents:** GET same-origin contra `/api/irc/bots`, `/api/irc/bridges`, `/api/irc/incidents`. Si no están desarrolladas devuelven 404 y UI **no inventa registros**; estos endpoints requieren sesión de backend, ACL por proyecto y respuestas reales. Ninguna escritura/secret de infraestructura desde navegador.
- **Config:** solo preferencias locales de WSS, nick y canal. TLS/SSO/permisos/bridges se configuran server-side. Canales privados de TC no se sincronizan a IRC público por defecto.
- **Matrix:** Synapse y TC gestionan salas y mensajes. Bridge Matrix→IRC solo a través de Appservice con transaction ID, namespaces mínimos y deduplicación; ledger TC es la autoridad de operaciones, Matrix/IRC son proyecciones.

## DNS y Tunnel (operaciones manuales del administrador)

Requiere un dominio en Cloudflare, ZimaBoard2 operativo, control del proyecto, DNS y política de seguridad aprobada. No introducir tokens en PR, código, instrucciones públicas, Wiki ni env files del repositorio.

1. Cloudflare Zero Trust → Networks → Tunnels: crear tunnel `hypenosys-irc-zimaboard2` o crear uno locally-managed con `cloudflared tunnel create`. Ejecutar `cloudflared` como servicio o contenedor con reinicio automático, mínimo privilegio y archivo de credenciales solo para el servicio.
2. En Public Hostnames, publicar **`irc.hypenosys.com`** al proxy HTTP **solo local** en el puerto elegido (ejemplo `http://localhost:8080`). El panel crea un CNAME a `<UUID>.cfargotunnel.com` o usar el comando de route DNS si es túnel local.
3. Activar Cloudflare SSL/TLS HTTPS y Network → WebSockets. Probar `wss://irc.hypenosys.com/webirc` con un cliente WebSocket que respete IRC. **No** desactivar verificación TLS de origen si el tramo al proxy es HTTPS; si se usa HTTP dentro del host privado, documentar límite de confianza y no exponer el proxy directamente.
4. Para clientes IRC tradicionales puerto 6697, Cloudflare **HTTP proxy/tunnel publicado no equivale a raw TCP accesible universalmente**; requerir IP/puerto externo separado, VPS/TCP gateway compatible, o red privada con cliente cloudflared. No exponer la IP residencial por defecto.
5. Establecer Cloudflare Access/WAF para paneles de administración, API y operaciones; validar políticas de acceso no solo en Cloudflare sino en el backend con identidad TC. El canal IRC público debe aplicar auth IRCd y rate limits propios. Conexión WSS sensible a reconexiones y timeouts.

### Ejemplo de configuración de tunnel local

**Solo plantilla; ajustar hostname, rutas reales, ubicación de credenciales y network namespace. No subir archivo de credenciales.**

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /etc/cloudflared/<TUNNEL_UUID>.json
ingress:
  - hostname: irc.hypenosys.com
    service: http://127.0.0.1:8080
  - service: http_status:404
```

Si `cloudflared` está en Docker sin network=host, `127.0.0.1` apunta al contenedor, **no** al host: usar el nombre DNS del servicio de proxy en la misma Docker network.

**Validaciones:**
```bash
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://irc.hypenosys.com
cloudflared tunnel info hypenosys-irc-zimaboard2
```

### Reverse proxy propuesto

Si Caddy corre en el mismo namespace que Ergo y la app, un ejemplo local (ajustar puertos/sitios; no confiar en este ejemplo como deploy):

```caddyfile
:8080 {
  @webirc path /webirc
  reverse_proxy @webirc 127.0.0.1:8067

  @ops path /api/irc/*
  reverse_proxy @ops 127.0.0.1:3000

  root * /srv/hypenosys/_site
  file_server
}
```

Ergo IRCd necesita un listener con `websocket: true` en el origen, **no** un listener IRC TCP simple; revisar el `default.yaml` de la versión fijada y restringir `websockets.allowed-origins` a `https://irc.hypenosys.com` y dominios de desarrollo explícitamente autorizados. No aceptar `Origin: *` para sesiones con credenciales. La app estática de Jekyll debe compilarse y copiarse al volumen servido por proxy antes de que el DNS cambie.

## Seguridad y disponibilidad

- Usuario IRC autenticado contra gateway/OIDC o SASL con cuenta verificada; nick invitado no tiene permiso de ejecutar agentes, tareas ni obtener historial privado.
- Matriz `orgMembership ∩ projectMembership ∩ IRC account/room membership ∩ agentPolicy`. Ni mensajes ni nick otorgan permisos por sí solos. La fuente de verdad de `TaskUid` y `ProjectUid` se mantiene en TC/Hypenosys Gateway, no en el nombre del canal.
- Mantener `/api/irc/*` same-origin y protegido con sesión/CSRF/ACL y rate limits; usar tokens de backend en secret manager, nunca en JavaScript/localStorage.
- Evitar la propagación de DMs privadas o eventos ACL a canales públicos; notificaciones con payload resumido, `eventId`, `origin`, `bridgeId` y protección de bucles. Apagar la proyección NO debe impedir escribir en el ledger TC.
- En incidente de Matrix/IRC/GitHub: informar estado `offline/stale/pending`; guardar intentos en outbox y reintentar, nunca confirmar con métricas inventadas.
- Copias cifradas del IRCd y configuración en destino externo ZimaBoard2; comprobar restauración/retención. No hacer público el puerto local IRCd 8067 ni administración.
- Probar HTTP 200 del HTML, subida a WebSocket 101, NICK/USER→001, LIST/322, JOIN, PRIVMSG, reconexión, desconexión, WebSocket keepalive y revocación de permisos.
- Pruebas API: `/api/irc/bots|bridges|incidents` debe responder 401/403 correctamente y 200 solo con datos reales, no JSON mock. Verificar accesibilidad, responsividad y localización.

## Definición de completitud

`irc.hypenosys.com` solo puede marcarse **OPERATIVO** cuando: DNS real resuelve al tunnel, origin/certs disponibles, IRC WSS conecta y mantiene sesiones, 5 vistas consultan fuentes reales, bots/bridges están gobernados por permisos TC y el historial de operaciones existe en ledger durable. Una UI visible sin estos gates es **UI inicial en desarrollo**, no servicio operativo.

## Referencias

- Cloudflare Published applications: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/
- Cloudflare Configuration file: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/
- Cloudflare WebSockets: https://developers.cloudflare.com/network/websockets/
- Ergo manual WebSocket: https://github.com/ergochat/ergo/blob/master/docs/MANUAL.md
- Matrix Appservice: https://spec.matrix.org/latest/application-service-api/
- TC identity/event ledger ADR (draft): https://github.com/Axlfc/tc/pull/849
