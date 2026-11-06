# Continuidad del flujo de agentes — Jules → Cog / Cognito y gateway de escritura

**Fecha:** 2026-11-06. **Estado:** planificación y migración urgente, NO ejecución completada. **Due date operacional:** antes del 2026-11-11. **Cierre Jules:** 2026-12-31.

## Fuente primaria / fechas confirmadas

Google anunció el 2026-10-29 que Jules pasa a **solo lectura después del 2026-11-11**, con cierre definitivo 2026-12-31. Hay que terminar/exportar el contenido antes del límite operativo. Documentación oficial: https://jules.google/docs/changelog/2026-10-29

Google expone exportación de settings, env vars, scheduled tasks, repos conectados, memories, prompts, planes, logs, sesiones y diffs; el repositorio/branches/PR publicados permanecen en GitHub. La exportación incluye valores de variables de entorno: **guardar cifrada y fuera de repositorios e índices RAG**. Solicitar al propietario `jules login` interactivamente; jamás capturar tokens o inventar conexiones. Revisar los datos y redactarlos antes de ingerirlos en Cog.

## Estado real observado en repos (2026-11-06)

- `hypenosys/cog` usa rama por defecto **master**, **no** develop. `cog.ps1` incluye un cliente interactivo de Jules (`cog jules sources|sessions`, clave pedida por consola), chat Cognito, comandos RAG `index/search/ask`, backend local predeterminado `http://localhost:8000`. `README-COG-RAG.md` declara prototipo, no probado en máquina del usuario, Qdrant/Ollama y RAG de HAIS limitado a master.
- `hypenosys/hypenosys.github.io` en `develop` tiene `assets/javascript/jules-api.js` con URL configurable por UI, `jules-claude-bridge.js`, `jules-pr-sync.js`, `hypenosys-task-orchestrator.js` y `github-api.js`. Este último lee `gh_access_token` del browser para escrituras a GitHub. La UI no debe dar por exitoso el trabajo cuando se pierde acceso.
- Un endpoint **propio** puede reemplazar el transporte del agente y de las escrituras, pero **NO** revive los servicios de Google Jules después de su cierre. Los endpoints deben ejecutar un motor alternativo, p. ej. Cog + runner aislado + GitHub App.
- `hypenosys/HAIS` tiene la tarea #900019 de sandbox Cognito: reutilizar sus resultados, no duplicar la prueba segura.
- El diseño de eventos y tareas del Ecosystem 2.0 está en `docs/ECOSYSTEM_2_0_ARCHITECTURE.md` y backlog #88–#99. Migration paths deben cumplir esos contratos cuando estén aprobados.

## Fases con deadline

### P0/A — Rescate histórico (hasta 2026-11-10)

1. Inventariar sesiones activas en Hypenosys y Jules con correlación `taskId/orgId/repo/sessionId`; no confiar únicamente en la caché del browser.
2. Terminar, verificar o cancelar con criterio sesiones incompletas antes de límite; no abrir nuevas sesiones cuando no puedan completarse.
3. Propietario autenticado exporta Jules **localmente** siguiendo guía oficial (CLI y export prompt); guardar la copia fuera del repositorio, cifrada, y registrar hashes, recuentos y ubicación en un manifiesto **sin secretos**.
4. Separar de la exportación credenciales y variables de entorno, nunca indexar el archivo de secretos ni volcar logs en tareas/PR públicos.
5. Guardar historial de sesiones, planes, actividades, patches y referencias a PR en archive privado ACL-scoped; marcar legibles en UI aun si Jules API devuelve read-only/404.

### P0/B — Desacoplar el motor (antes del 2026-11-11)

Crear interfaz `CodingAgentProvider` neutral y usar backend seleccionado por policy, no por nombre de pantalla:

```ts
type ProviderId = 'jules-legacy' | 'cog';
interface CodingAgentProvider {
  start(input: { taskRef: string; repo: string; branch: string; prompt: string; idempotencyKey: string }): Promise<{ executionId: string }>;
  getExecution(id: string): Promise<AgentExecution>;
  listEvents(id: string, cursor?: string): Promise<AgentEvent[]>;
  submitFeedback(id: string, input: { feedback: string; approvalRef?: string }): Promise<void>;
  cancel(id: string): Promise<void>;
  getCapabilities(): Promise<{ writable: boolean; supportsApproval: boolean; supportsGitPR: boolean }>;
}
```

- Jules legacy: **read-only histórica** después del corte; sin prometer `start/sendMessage/approvePlan` aun si cache local muestra botones.
- Cog: primero implementar backend server-side de ejecución asíncrona, sesión, output, tests y creación PR; **no** equiparar el comando local `cog jules sessions` con runner de código.
- UI Neural/Jules Panel: proveedor y estado visibles; consola conserva historial, labels «Jules (archivo)» vs «Cog (activo)». No reutilizar session IDs entre proveedores; usar `provider:executionId`.
- Mantener el mismo ciclo `TaskFlow/ApprovalCenter`: task → plan → execute → test → PR → checks → review/merge → task done.
- Fail closed cuando `capabilities.writable=false`; no hacer fallback de escritura silencioso a otro proveedor ni abrir trabajos duplicados.

### P1 — Cog execution runner / HAIS sandbox

Servicio aislado para operar sobre una **copia allowlist**, nunca un bind mount del repo real; acceso GitHub vía token efímero y scope mínimo; timeout, CPU/RAM/network egress/secret protection. Modelo y runner no heredan PATs del usuario; enlazar evidencia y diff al TaskEnvelope. Controlar el merge con Approval Center / CI. Respetar el piloto HAIS #900019.

### P1 — Gateway de escritura propio

**No confundir:** `JULES_API_KEY` autentica contra Google Jules y morirá con ese servicio; `gh_access_token` / token GitHub usado para escrituras de tareas es otra credencial. El endpoint resolverá **la segunda necesidad** (y despachará a Cog), sin eludir permisos.

Implementación candidata: TC Next.js server API o Cloudflare Functions / Worker autenticado (la web Jekyll estática sola NO proporciona backend persistente). Elegir tras probar entorno/identidad disponibles.

Endpoints propuestos, **no existentes todavía**:

```text
POST /api/v1/agent-executions
GET  /api/v1/agent-executions/:id
GET  /api/v1/agent-executions/:id/events
POST /api/v1/agent-executions/:id/feedback
POST /api/v1/agent-executions/:id/cancel
POST /api/v1/tasks/:orgId/:id/transition
POST /api/v1/github/pull-requests
```

Asegurar auth y sesión usuario server-side, vínculo de organización/proyecto, RBAC/ACL, permisos efectivos `user ∩ project ∩ agent`, GitHub App installation tokens de corta vida, allowlist de repos y operaciones, CSRF/CORS/nonce, idempotency-key, rate limits, límites de gasto, audit trail, secret redaction, revisión de branch protection, CAS/sha en tareas GitHub JSON, webhooks firmados y reconciliación eventual. Para backend-to-backend usar credenciales rotables en secret manager. **No** trasladar la misma API key estática del navegador a una URL con CORS abierto ni dar a cualquier visitante la facultad de crear commits.

### P2 — Cutover y retirada Jules

Prueba con task de desarrollo inofensiva y fixture repo separado, comparando entradas/salidas; gates: sin duplicados, sin secretos, tareas y PR reconciliadas, pendiente de aprobación bien señalado, historial pasado accesible. Feature flags `provider=cog` y `jules=readonly` con rollback de UI sin reabrir sesión de Google. Retirar inputs para Jules API key solo cuando copia e importador estén verificados; no borrar links a sesiones antiguas.

## Criterios de aceptación de continuidad

1. Antes del límite se ha exportado y verificado un inventario de sesiones completas y datos protegidos; nunca hay secretos de Jules en repositorios, Wiki, RAG ni Issue.
2. El cierre o 401/403/404 de Jules no bloquea creación/edición de tareas del Dashboard ni la UX de Cog; las pantallas muestran un error accionable y estado `read-only` real.
3. Motor Cog tiene session IDs, trazas, ejecución, tests y resultados auténticos desde runner seguro; no se presenta chat local como sustitución suficiente.
4. Escrituras se autorizan en servidor mediante identidades verificables, mínimo privilegio, auditoría e idempotencia; se puede revocar la credencial sin perder histórico.
5. CI/E2E valida read-only Jules, alternancia, tareas cross-org, PR y merge autorizados, fallos, replay y recuperación. Sin merge automático por simple éxito de respuesta del modelo.

## Dependencias y priorización

La ventana Jules obliga a **no** bloquear el backup y el desacoplamiento por toda la arquitectura del Ecosystem 2.0. Los contratos de #88 se pueden reutilizar, pero P0/A y P0/B se ejecutan inmediatamente; los trabajos de Cog runtime y gateway pueden continuar después del corte. Después enlazar Task Flow (#91), Agent Studio (#93), Approval Center (#92), Sandbox Lab (#96) y TC bridge (#98).

**Importante:** este documento es un plan. No supone que el export se haya realizado ni que Cog tenga ya endpoints operativos.


## P0/P1 — Forgejo soberano como plan B frente a caídas de GitHub

**Estado observado:** en Hypenosys existe la tarea **#84 «Crear Forjejo (Git) en ZimaBoard2»** asignada a Axel, estado Working; **no** hay evidencia en el repositorio de que el servidor esté instalado, en línea, publicado ni que tenga backups operativos. Vincular las tareas nuevas a #84 sin marcarla completada. La plataforma puede ser un Forgejo self-hosted en ZimaBoard2, sujeto a validar recursos, TLS, almacenamiento, uptime, acceso desde fuera, recuperación fuera del propio host y DNS.

### Límite de lo que resuelve el espejo

Forgejo **sí** admite pull-mirroring de ramas, tags y commits desde GitHub; no significa que replique de forma idéntica PR, revisiones, issues, Actions, secretos, reglas de ramas, deploys, LFS, wiki ni archivos adjuntos. Hacer backups/exportaciones específicas y pruebas de restauración de esos artefactos. Los push mirrors de Forgejo pueden forzar actualizaciones remotas; **nunca** activar espejos push bidireccionales en producción porque pueden sobrescribir cambios y crear split-brain.

Fuentes oficiales: https://forgejo.org/docs/latest/user/repo-mirror/ y https://forgejo.org/docs/latest/user/actions/github-actions/

### Diseño Git backend adapter

- `GitBackendProvider`: GitHub y Forgejo con `repoRef`, `remoteUrl`, `apiBase`, `branch`, `capabilities`, `getTree`, `getContent`, `commitCAS`, `createBranch`, `createPR`, `getChecks`, `mergePR`, `getHealth`; no simular paridad de permisos/CI.
- `RepositoryIdentity` estable `logicalRepoId` -> URLs GitHub/Forgejo con mapeo explícito de repos, `develop` / `master` según repo. No asumir que todos tienen `develop` (COG solo `master`).
- Operación normal: `activeWriter = github`, Forgejo espejo **solo lectura**, con marca `lastMirrorCommitSha`, retraso y controles de integridad. Sincronización inicial y health checks; target RPO medido, sin prometer cero pérdida.
- Caída GitHub: modo `degraded` para lecturas; para promover Forgejo a escritor, ejecutar una **operación de failover explícita, auditada y autorizada** con lease/epoch/fencing para bloquear el anterior escritor, guardar punto de sincronización y verificar quórum/almacén de coordinación. Si no se puede garantizar un único escritor, **solo lectura y cola segura de solicitudes, NO dos escritores**.
- El API Gateway de tareas puede cambiar del adapter GitHub a Forgejo solo si la fuente de datos de tareas está migrada/replicada con esquema, ACL y CAS; la disponibilidad del espejo de código por sí sola **NO** mantiene las tareas en línea.
- Tras recuperación: exportar y reconciliar por hash/revisión/event IDs, establecer resolución manual de conflictos, probar `failback` con una sola fuente activa. No usar `git push --mirror` para reparar divergencias sin validación humana.
- Acceso por TLS/SSH con autenticación fuerte; tokens de instalación/usuarios guardados server-side, rotados y mínimos; backups cifrados **fuera de ZimaBoard2**. Separar los datos operativos de secretos de backups.
- GitHub Pages no tiene fallback automático por replicar un repositorio. Definir hosting alternativo para Hypenosys/TC, publicación independiente, DNS/health checks y verificación de que CSS/JS/assets/API/auth siguen operativos.
- Forgejo Actions **NO es totalmente compatible** con GitHub Actions; portabilidad mediante test real de workflows (Jekyll, TC, HAIS, Cog), Forgejo Runner y secrets independientes. No marcar checks como verdes por una traducción superficial.

### Checks obligatorios de recuperación

1. GitHub inaccesible con Forgejo espejo actualizado: lectura de `develop` y de datos Hypenosys de un clon/almacén seguro, latencia de mirror visible.
2. Gateway responde con degradación real; no retorna éxito de escritura sin commit SHA y revisión validada; demandas pueden quedar en cola durable cifrada con idempotency keys.
3. Failover controlado por operador: escritura en Forgejo, commit CAS, apertura PR, revisión/CI/merge y tarea asociada, sin tokens de navegador.
4. Restablecer GitHub y comprobar hashes, conflictos, permisos, historial y failback sin sobrescrituras ni duplicación.
5. Restauración completa desde backup independiente, recuperación de Forgejo tras fallo de disco/host, CI runners/secretos y dominio secundario operativos.
6. Ejercicios de caída completos y fecha de último éxito documentados en Mission Control y HAIS Observatory.

**No declarar “GitHub redundancy ready” hasta que exista espejo verificado, backend writable probado, segundo hosting y un ensayo de failover/failback.**


## Actualización 2026-11-06 — exportador web ya existente y primer respaldo comunicado

**Evidencia de producto:** en la captura del Jules Panel de Hypenosys (rama develop) aparece el botón superior **Exportar**. El usuario informa de que **Axel ya exportó los datos accesibles de una de las cuentas**. Es un avance **reportado**, pendiente de verificar los ZIP y el manifiesto; no se conoce aún qué cuenta fue, número de sesiones incluidas ni integridad del resultado. No volver a planificar un exportador nuevo como si no existiese.

**Código analizado:** `pages/jules-panel.html` enlaza `<button id="hdr-export-btn" onclick="triggerJulesExport()">`; `assets/javascript/jules-export.js` contiene `triggerJulesExport` y descarga ZIP del lado del navegador. Recupera `/sources`, `/sessions`, detalle de `/sessions/{id}` y `/sessions/{id}/activities`, con paginación, reintentos, deduplicación y extracción de patches. Exporta archivos de sesión `session.json`, `activities.json`, `summary.md`, `patches-index.json`, diffs, `sessions-index.csv`, `sources.json`, `sessions.json`, `manifest.json` y `errors.json`. Puede generar múltiples `jules-export-YYYY-MM-DD-partNN.zip` más `jules-export-YYYY-MM-DD-index.zip`; **conservar siempre todas las partes y el índice**. El exportador no cifra los ZIP, así que el almacenamiento cifrado debe hacerse por separado.

**Limitaciones/bugs detectados por inspección (no validados con ejecución real):**
1. El manifiesto actualmente asigna `complete: true` en el flujo normal **aunque** `errors_count > 0`, un `pagination_stop_reason` distinto de `COMPLETED` o `activities_stop_reason` distinto de `COMPLETED`. La UI puede mostrar “Exportación completada con éxito” aunque falten páginas/actividades: cambiar el criterio a completitud comprobable y presentar avisos accionables.
2. El nombre de los ZIP solo incluye **fecha y número de parte**, no una identificación estable de la exportación o cuenta. Si se exportan varias cuentas el mismo día pueden aparecer nombres idénticos. Añadir export ID no sensible, selector/etiqueta explícita de origen, y preservar trazabilidad sin almacenar API keys.
3. El exportador usa la **API pública de Jules del contexto de la credencial configurada**: exportar una cuenta **no garantiza** exportar las demás. Tampoco puede garantizar que incluya datos históricos invisibles para la API pública, ni settings/env vars, memories y scheduled tasks; contrastar con export oficial por cuenta.
4. Descargar ZIPs mediante `downloadFn` no acredita que el usuario guardó todos los archivos, ni que puedan abrirse; comprobar ZIP CRC/entries, recuentos, hashes y extracción de muestra restaurable fuera del repositorio.
5. `sessions.json`, actividades, logs y patches pueden contener datos privados, credenciales o diffs sensibles; **no** subir ZIP ni manifiestos con datos sensibles a GitHub, Forgejo, TC, Wiki o Qdrant. Solo registrar metadatos saneados, resultado de verificación y hash de cada artefacto.

**Plan inmediato por cuenta, sin duplicar:** usar el botón ya existente cuando funcione; copiar y proteger el resultado ya descargado por Axel; validar `manifest.json` + partes + hashes; repetir desde las otras identidades de Jules, etiquetando cada respaldo con un `exportId`; comparar número de sesiones esperado vs exportado y registrar lagunas; complementar con export oficial cuando sea necesario. Para el modo Jules Archive, implementar **importador de ZIP verificados** y permisos por organización; no depender de conservar las API keys después del cierre.

**Condición de cierre de la tarea #100:** listado de todas las cuentas pertinentes (sin tokens), artefactos exportados por cuenta, fecha, recuentos y `errors_count=0` con paginación completa o discrepancias documentadas, muestras restauradas, cifrado/offsite y acceso histórico autorizado. El respaldo de una cuenta comunicado hasta ahora **no** habilita marcar #100 `OK`.
