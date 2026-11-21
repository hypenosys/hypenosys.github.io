# THE MACHINE: piloto TC ↔ Hypenosys ↔ GitHub ↔ Forgejo (2026-11-07)

**Estado:** plan técnico, no despliegue ni cambios del proyecto THE MACHINE. No se inventa TC Project.id ni la URL Forgejo.

## Inventario observado

- GitHub: `hypenosys/the_machine`, rama principal **master**; el repositorio sigue las restricciones de gobernanza HOLD/NO-GO descritas en `README.md` y `AGENTS.md`.
- Hypenosys: `_data/orgs/the-machine/meta.json` (miembros haopengwang123 y axlfc) y `taskSource = { kind: github-issues, repository: hypenosys/the_machine, readOnly: true }`. **No crear tasks.json adicional.**
- TC: `ProjectStructure` tiene `files[]`, `tasks[]`, `members[]` y se persiste en `data/projects/projects.json`. `editorStore` llama a `filesStore.updateFileContent`; `repositoryStore` guarda hashes sintéticos de interfaz, **no commits Git**.
- TC Project exacto: pendiente de identificar en la API/instancia real con identidad aceptada.
- Forgejo: #84/#104 pendientes de verificar; no se ha confirmado aún un remoto ni espejo real de THE MACHINE.
- TC ProjectEvent ledger durable: tarea #110 pendiente, sin garantía ACID ni outbox.

## Reglas esenciales

1. **Una autoridad por recurso**: GitHub repositorio para documentos versionados; GitHub Issues para tareas THE MACHINE; TC Project API para miembros y archivos TC nativos; PostgreSQL event ledger #110 para auditoría; Forgejo únicamente espejo Git de lectura hasta failover #105.
2. **Enlace explícito y aprobado por propietarios**: el `TC Project.id`, `hypOrganizationId=the-machine` y `githubRepo=hypenosys/the_machine` se enlazan con autorización y quedan registrados. No vincular por nombre ni dar acceso por compartir dominio.
3. **Identidades consistentes**: ACL server-side de organización/proyecto/GitHub; el login/nick/email no bastan como clave canónica. API de GitHub mediante GitHub App con permisos mínimos, sin PAT en navegador.
4. **Borrador no es commit**: el editor TC puede guardar un borrador privado. Publicar cambio a Git crea una rama y PR contra `master`; no se altera `master` sin revisión. Detectar conflicto por SHA de blob/base y rechazar cambios silenciosos.
5. **Git file o TC native**: un archivo creado desde TC sólo será versionado cuando el propietario seleccione explícitamente `Git-backed`, ruta permitida y política de publicación. Los archivos internos privados no entran en el repositorio público.
6. **Cambios observados, no asumidos**: PR creada ≠ PR merged; issue solicitado ≠ issue actualizado; espejo Git atrasado ≠ sincronizado. UI muestra `pending/stale/conflict/failed/confirmed` con timestamps y evidencias.
7. **Sin doble escritura**: GitHub es escritor original, Forgejo pull mirror sólo lectura. El failover requiere fencing single-writer y autorización explícita. Un espejo Git no respalda Issues, reviews, attachments ni ledger TC.

## Contratos propuestos

`ProjectRepoBindingV1`: `{tcProjectId, hypOrgId:"the-machine", githubRepo:"hypenosys/the_machine", defaultBranch:"master", status:"pending|linked|revoked|conflict", aclRevision, linkedBy, linkedAt, forgejoMirror?:{url, mode:"read-only-pull", lastSha, verifiedAt}}`.

`TaskLinkV1`: `{tcProjectId, externalSystem:"github-issues", repo:"hypenosys/the_machine", issueNumber, githubNodeId?, lastVerifiedAt}`. Una tarea lógica: proyectar Issues en Kanban TC y Dashboard Hypenosys sin duplicar registros nativos. No mapear todas las columnas TC automáticamente a `open/closed`.

`GitFileBindingV1`: `{tcFileId, tcProjectId, gitPath, baseBlobSha, branch:"master", type:"git-bound|tc-native", lastVerifiedAt}`.

`ProjectEventV1`: `{eventId, orgId, tcProjectId, actorUid, actionType, entityRef, correlationId, idempotencyKey, status:"requested|committed|failed|compensated", externalCommitSha?, issueNumber?, prNumber?, provider, occurredAt, recordedAt}`. Datos redactados y consultas autorizadas por proyecto.

## Pruebas reales de extremo a extremo

**Editar un documento desde TC**
1. GET de archivo Git con ACL y `blobSha` confirmado de GitHub.
2. Usuario modifica el contenido en TC; queda como borrador.
3. Botón Publicar presenta diff, ruta y aprobación. Gateway registra operación idempotente (ledger durable), compara `blobSha`, crea branch, commit real y PR contra `master`.
4. El historial TC registra `requested → pr.created` con autor, correlación, SHA y enlace. PR no implica merge.
5. Reviewer autoriza; webhook GitHub firmado `X-Hub-Signature-256` confirma merge. Ledger publica actualización, TC y Hyp muestran SHA real, y Forgejo alcanza SHA vía pull mirror.
6. Conflictos 409, fallos de proveedor o retry deben ser visibles, nunca convertirlos en OK.

**Crear un archivo desde TC**: elegir Git-backed o TC-only. Sólo el primero entra en el flujo branch/PR. Verificar no colisión de ruta, acceso, límites y clasificación de datos; no enviar adjuntos privados al repo público.

**Cambiar una tarea TC**: seleccionar Issue original del repo por número, mandar comando autorizado al adaptador GitHub Issues y registrar requested/confirmed con idempotencia. El dashboard de Hypenosys sigue leyendo el Issue original. Una columna TC se limita a una proyección salvo mapeo aprobado.

**Forgejo**: verificar servidor real y crear, si no existe, repositorio nuevo como pull mirror GitHub→Forgejo, en modo read-only; comprobar SHA y retraso. El manual advierte que pull mirror se configura al crear repo y que push mirror puede sobrescribir remoto: https://forgejo.org/docs/latest/user/repo-mirror/. Issues, PR, eventos, adjuntos y notas requieren exportaciones/backups independientes.

## Orden de trabajo (reutilizar backlog existente)

| Fase | Tareas existentes | Gate para continuar |
| --- | --- | --- |
| 0. Inventario y enlace **read-only** | #95, #98 | Propietario confirma TC Project.id; se muestra GitHub master, Issues y usuarios con ACL; no escrituras. |
| 1. Historial durable | #110, #108 | Event ledger PostgreSQL + comandos + outbox, retry y replay verificables. |
| 2. Gateway y binding Git | #103, #98 | GitHub App, ACL, CAS SHA, API read y writes por comandos. |
| 3. Editor y archivos a PR | #98, #103 | TC editor guarda borrador; publicar produce PR real, no commit directo a master. |
| 4. Issues ↔ Kanban TC | #98 | Misma issue/identidad y estado observable en TC e Hypenosys. |
| 5. Forgejo respaldo | #84, #104 | Pull mirror, SHA/lag, backups independientes y restauración ensayada. |
| 6. Failover y Matrix/IRC | #105, #111 | Sin dos escritores, ACL y reintentos de notificación; E2E 2 usuarios. |

## Criterios de aceptación

- TC muestra el repo `hypenosys/the_machine` y su rama principal `master` sin asignar un TC Project ID inventado.
- Un cambio autorizado de doc TC crea exactamente una PR en GitHub, confirmable por SHA y diff; su merge queda en el historial de TC, Task Flow y mirror Forgejo.
- Editar Issue N desde TC cambia la **misma** GitHub Issue; Hypenosys lee el mismo número, estado y URL.
- Usuario ajeno: no obtiene proyectos privados TC, borradores, historial, metadatos ni canal privado.
- Desconexión de GitHub/Forgejo/Matrix → no se pierde evento duradero, UI muestra pendiente o fallo, reintento no duplica.
- THE MACHINE conserva sus requisitos de gobernanza, sin ejecutar código por el mero hecho de enlazar el proyecto.

Fuentes locales: `_data/orgs/the-machine/meta.json`, `Axlfc/tc/src/lib/types/files.ts`, `Axlfc/tc/src/lib/stores/repositoryStore.ts` y `hypenosys/the_machine/AGENTS.md`. Webhooks: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries.
