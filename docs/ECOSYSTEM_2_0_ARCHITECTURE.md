# Hypenosys Ecosystem 2.0 — arquitectura y backlog ejecutable

> Plan de producto y arquitectura. Estado: **especificado, no implementado**. Base: repositorios `hypenosys/hypenosys.github.io`, `Axlfc/tc` y `hypenosys/HAIS`, rama `develop`, 2026-11-06.
> Organización canónica del backlog: `hypenosys`. Los identificadores de tareas y permisos viven en sus sistemas de origen.

## Objetivo

Crear ocho módulos interoperables, **no ocho bases de datos ni ocho silos**: Mission Control, Task Flow, Approval Center, Agent Studio, Knowledge Graph, Organization Hub, Sandbox Lab y HAIS Observatory. Una tarea conserva identidad, organización, permisos, historial y vínculos a sesión Claude/Jules, rama, PR, CI y TC Project.

## Estado real de partida

- Hypenosys: Jekyll/GitHub Pages, `dashboard.html`, `pages/claude-chat.html`, `pages/jules-panel.html`, `pages/command-center.html`, `assets/javascript/hypenosys-task-orchestrator.js`, `jules-pr-sync.js`, `jules-task-supervisor.js`, `github-api.js`, `_data/orgs/*/tasks.json`, `_data/organizations.json`.
- TC: Next.js App Router, `src/app/dashboard`, `src/app/api/projects`, `src/app/api/agents`, `src/lib/projects/projectRepository.ts`, `src/lib/types/files.ts`; `docs/HYPENOSYS_PLAN_SPEC.md` registra proyectos, agentes canónicos, eventos, seguridad y RAG con partes todavía incompletas.
- HAIS: `hypenosys/HAIS` y prototipos de observabilidad en Hypenosys (`pages/hais-terminal.html`, `pages/hais-markets.html`). Evitar confundir paneles de mercado con estado operacional de agentes/servicios.
- TC `ProjectStructure` y Hypenosys `organizationId` / tareas son modelos diferentes: NO fusionar directamente los arrays ni asumir que el estado de TC coincide con el de Hypenosys.

## Arquitectura lógica propuesta

```text
Hypenosys Shell (Jekyll, shared header/accessibility/i18n)
    |-- Mission Control     |-- Task Flow        |-- Approval Center
    |-- Agent Studio        |-- Knowledge Graph  |-- Organization Hub
    |-- Sandbox Lab         |-- HAIS Observatory
                  |
        Read models / adapters ACL-scoped
                  |
  +---------------+--------------+-------------------+
  | Hypenosys Task API           | TC Project API    | Agents/CI
  | GitHub sharded JSON + CAS    | Project events    | Claude/Jules/Codex
  | source for Hyp task          | source for TC org | HAIS/GitHub
  +---------------+--------------+-------------------+
                  |
       Idempotent event/outbox + reconciliation
```

El frontend **nunca** contiene claves de larga duración ni reenvía permisos de un usuario a otro; integrar un broker/gateway con credenciales efímeras, allowlists por operación, registros redactados y comprobación server-side de membresías. Los archivos de datos actuales son el origen de las tareas Hypenosys hasta que una migración con rollback esté validada. TC es autoridad para proyectos/miembros propios; el bridge solo guarda referencias y proyecciones autorizadas.

### Contratos mínimos (versionados)

- `EntityRef`: `{system, entityType, entityId, organizationId?, projectId?}` — nunca inventar una identidad común a partir del título.
- `TaskEnvelope v0.1`: `{eventId, schemaVersion, taskRef, organizationRef, projectRef?, correlationId, causationId?, revision, actor, occurredAt, state, provenance}`.
- `ExecutionRef`: `{taskRef, provider, sessionId, repo, baseBranch, workBranch, prUrl?, commitSha?, checks?, supervisionMode}`.
- `ApprovalRequest`: `{approvalId, taskRef, scope, riskLevel, proposedDiff, expiresAt, decision?, decidedBy?, policyVersion}`.
- `KnowledgeSource`: `{sourceRef, projectRef?, visibility, aclVersion, contentHash, citedAt, supersedes?}`.
- `AgentPolicy`: permisos efectivos = **usuario ∩ proyecto ∩ política del agente**; denegar por defecto.

**Reglas:** autenticación server-side, autorización ANTES de consultas/proyecciones, `idempotencyKey` y deduplicación, optimistic concurrency (SHA/ETag), retries con backoff, outbox/eventual consistency y mecanismo `reconcile`; jamás usar un valor de `localStorage` como fuente de autorización o como prueba de que una tarea terminó. No crear PR/merge automático sin checks y política de revisión. Los eventos no son autorización.

## Rutas y UX/UI

Todos los paths son **permalinks propuestos**, no páginas ya existentes:

| Módulo | Hypenosys (Jekyll) | Integración TC | Vistas y acciones |
| --- | --- | --- | --- |
| Mission Control | `/control/mission/` | `/dashboard/per-a-tu` (feed autorizado) | KPIs, trabajo activo, colas, blockers, salud, apertura contextual |
| Task Flow | `/control/task-flow/` | `/dashboard/kanban` (adaptador) | Línea de eventos `created → Claude → Jules/Codex → PR → CI → merge → completed`, reintentos y divergencias |
| Approval Center | `/control/approvals/` | Proyecto/miembros/roles | Inbox con justificación, diff, riesgos, denegar/aprobar, doble confirmación en alto riesgo |
| Agent Studio | `/control/agents/` | `/api/agents` | Lista de agentes, identidad canónica, capabilities, modelos, permisos, consumo, sesiones |
| Knowledge Graph | `/knowledge/graph/` | proyectos, historial, búsqueda/RAG con ACL | Explorador de nodos, procedencia y citas, filtros por proyecto, búsqueda y fuente |
| Organization Hub | `/organizations/hub/` | `/api/projects`, members, invites | Organizaciones, proyectos, miembros, roles, archivos, reconciliación de accesos |
| Sandbox Lab | `/labs/sandbox/` | recursos de proyecto autorizados | Lanzar experimento aislado de repos saneados, cuotas, logs redactados, diff y resultado |
| HAIS Observatory | `/hais/observatory/` | eventos/alertas compartidos si autorizados | Stress Index, carga, colas, latencias, errores, tendencia, degradaciones, evidencia |

**Patrón visual:** tokens Drupal/Dracula existentes (`#282a36`, `#bd93f9`, `#50fa7b`, `#8be9fd`, `#ff5555`), compartiendo header/nav y patrones de feedback. Desktop: navegación lateral, listado contextual y detalle; móvil: panel único y navegación por vistas. Estados `loading/empty/error/offline/permission denied/stale` diferenciados; nunca marcar verde sin estado remoto verificado. ARIA labels, teclado, foco visible, contraste WCAG AA, reduce motion, sin colores como única señal, textos traducibles (es/ca/en/zh-cn según cobertura del producto).

### Ficha UX por módulo

1. **Mission Control:** cola personal/global filtrada por organización; tarjetas de estado con fuente y timestamp, agentes online, bloqueos y botón "Abrir tarea" sin duplicar datos.
2. **Task Flow:** carriles por ejecución y línea de eventos por `correlationId`; distinguir `not_started`, `running`, `awaiting_approval`, `awaiting_pr`, `checks_failed`, `merged` y `reconciled`. Los historiales de Jules/Claude no se mezclan.
3. **Approval Center:** lista de pendientes, actor, riesgo, diff y expiración; acciones solo con ACL, auditoría y prevención de doble click; agente no autoaprueba cambios de su propio ámbito restringido.
4. **Agent Studio:** identidad TC Agent mapeada a proveedor/modelo y workspace, con límites y permisos de herramientas; mostrar uso/costes solo con métricas verificadas.
5. **Knowledge Graph:** ver nodos `org → project → task → session → PR → document`, provenance por arista; filtrado en backend, nunca inferir contenido privado desde metadatos.
6. **Organization Hub:** mapa de identidades TC/Hyp con vínculo explícito confirmado por membresía; estado de sincronización `linked/pending/conflict/revoked`.
7. **Sandbox Lab:** exportación allowlist con `git ls-files` revisado; sin bind mount ni tokens; contenedor desechable con CPU/memoria/tiempo/red restringidos; comparar Codex vs Jules sobre el mismo ticket, no ejecutar merges por defecto.
8. **HAIS Observatory:** observación de estrés y capacidad con fuentes/timestamps; si no hay dato se indica `N/D`, nunca inventar índice; thresholds configurables y mitigación sugerida, no ejecutada sin policy.

## Fases de entrega y gates

- **F0 — Contratos y auditoría:** mapeo rutas e identidades; catálogo de fuentes, ACL, eventos, CI, data flow y migración/rollback. Gate: esquema + threat model + tests de contrato.
- **F1 — Fundaciones visuales y supervisión:** shell compartido, Mission Control, Task Flow, Approval Center. Gate: trazabilidad real `tarea → sesión → PR → checks → merge → archivo`, sin afirmaciones falsas.
- **F2 — Inteligencia:** Agent Studio y HAIS Observatory. Gate: permisos efectivos, controles de coste y métricas observables.
- **F3 — Colaboración y conocimiento:** TC Project bridge, Organization Hub, Knowledge Graph. Gate: aislamiento multi-org y conmutación de identidad sin filtraciones.
- **F4 — Experimentos y endurecimiento:** Sandbox Lab, E2E multi-repo, accessibility, performance y rollout progresivo. Gate: sandbox sin secretos, idempotencia, auditoría, rollback y cero regresiones críticas.

No activar todo a la vez. Feature flags por página, organización y entorno; `develop` primero, promoción tras review/CI. Las tareas de implementación tienen su rama de trabajo propia y PR contra `develop`, **no** merge directo al crear el backlog.

## Criterios globales de aceptación

- Toda entidad presenta IDs canónicos, `source`, `lastVerifiedAt`, `scope` y permisos sin revelar datos de otras organizaciones.
- Un mismo evento no crea dos ejecuciones, tareas, PR ni decisiones.
- Sesiones Jules/Claude aisladas por tarea y workspace, con historial persistente íntegro.
- El estado `completed` exige evidencia de verificación según la policy (PR/checks/merge o cierre justificado), y el dashboard se actualiza tras reconciliar.
- Roles, accesibilidad, internacionalización, compatibilidad móvil, recuperación offline/error y tests de seguridad/E2E incluidos.
- Los proyectos TC no se crean en producción por escribir un archivo del repositorio. Su alta real requiere llamada autenticada a `/api/projects` con verificación de identidad/membresía; no suplantar este paso.

## Registro del backlog

Las tareas del plan se registran en `_data/orgs/hypenosys/tasks.json` con etiqueta `ecosystem-v2`, como 12 tareas padre y subtareas verificables, ligadas por `blocked_by`; la fuente de verdad del estado de ejecución sigue siendo la tarea Hypenosys. Revisar también tareas/PR existentes antes de cada implementación para evitar duplicaciones.
