# Informe de Diagnóstico y Diseño de Backlog — Hypenosys

Este documento contiene la investigación y diseño solicitados para las tareas TSK-001 y TSK-002, siguiendo el protocolo de identidad y filosofía del estudio.

---

## ═══════════════════════════════════════════════════
## FASE 1 — DIAGNÓSTICO DE IDENTIDAD Y FILOSOFÍA
## ═══════════════════════════════════════════════════

**D1. Lenguaje, tono y valores**
*   **Lenguaje:** Español técnico de alta especialización con terminología de "hacker/cyberpunk culture" (ej: "clúster neural", "interfaz neuronal", "operaciones críticas").
*   **Tono:** Premium, formal, directo y enfocado a la soberanía técnica. Transmite un ambiente de control absoluto sobre la infraestructura.
*   **Valores:** Perfección técnica, reducción de fatiga visual (justificando el tema Dracula) y automatización avanzada (agentes autónomos).
*   **Evidencia:** `README.md` (l. 1: "estudio de videojuegos indie enfocado en la perfección técnica"), `pages/claude-chat.html` (l. 25: "Iniciando Interfaz Neuronal..."), `pages/jules-panel.html` (l. 7: "Premium developer dashboard").

**D2. Sistema de diseño y naming**
*   **Patrón Visual:** Uso estricto del tema **Dracula** (`#282a36`, `#bd93f9`, `#50fa7b`). Los componentes se nombran como parte de un sistema biológico-maquinal ("Neural Session", "Neural Context", "Telemetry").
*   **Naming:** Los botones son activadores de procesos ("Iniciar Ejecución", "Desvincular"). Las tipografías (**JetBrains Mono**) refuerzan el carácter puramente técnico.
*   **Evidencia:** `_data/jules_context.md` (l. 3-4), `pages/jules-panel.html` (l. 10-12).

**D3. Estructura del Kanban y Categorías**
*   **Categorías:** `Concepto / GDD`, `Pre-producción`, `Tools / Automation`, `Arte / Assets`, `Programación / Engine`, `QA / Testing`, `Build / Deploy`, `Post-launch`.
*   **Evidencia:** `assets/javascript/dashboard-config.js` (l. 11: constante `STAGES`).

**D4. Productos o proyectos creativos**
*   **Evidencia:** "Sin evidencia suficiente" de títulos comerciales o series. Solo se menciona la estructura de repositorios (`hypenosys/app`, `hypenosys/scripts`) y la carpeta raíz en SVN (`trunk\Hypenosys\`).
*   **Evidencia:** `guia-ue5-svn.html` (l. 44).

**D5. Mecanismo REAL de alta de tareas**
*   **Diagnóstico:** El mecanismo legítimo es vía UI (`handleCreateTask` en `dashboard-tasks.js`) que invoca `window.githubApi.createTask`, escribiendo directamente en `_data/dashboard_tasks.json`.
*   **Hueco:** No existe actualmente un mecanismo de alta "additive-only" (staging) que permita a una IA proponer tareas sin modificar el almacén de datos central de forma directa.
*   **Evidencia:** `assets/javascript/dashboard-tasks.js` (l. 149-216).

**D6. Equipo real confirmado**
*   **Axel (`axlfc`):** 3D Animator & Network Systems Admin (Infraestructura).
*   **Alex (`topperh4rley`):** Main Programming (Arquitectura core).
*   **Hermanita:** Mencionada en la solicitud para temas legales (Compliance).
*   **Otros:** Javi, Dídac, Mitxel (identificados en fichas de equipo).
*   **Evidencia:** `assets/data/team.json`, `assets/data/team_profiles.json`, `_audit_log` de tareas.

---

## ═══════════════════════════════════════════════════
## FASE 2 — DISEÑO DEL BACKLOG (PROPUESTA)
## ═══════════════════════════════════════════════════

#### Tarea 1: [TSK-001] Despliegue de Gateway LoRa/Meshtastic en Zimaboard
Despliegue de Gateway LoRa/Meshtastic en Zimaboard, Configuración del nodo central Zimaboard2 para interceptar mensajes offline de la red Meshtastic y traducirlos a payloads MQTT ligeros para el ecosistema Hypenosys., EPIC, CRÍTICA, M1-Infraestructura-Edge, feature/lora-gateway, hypenosys-core, Programación / Engine, IOT-TELEMETRY
Axel, Alex, SysOps, axel@hypenosys.local, alex@hypenosys.local, 2025-09-01, 2025-09-15, 40, 8, TO DO, 0%
#LoRa #Zimaboard #MQTT #EdgeComputing, - [ ] Zimaboard recibe señal de radio de un nodo M5Stack. - [ ] El mensaje se parsea correctamente a JSON/MQTT. - [ ] Carga en CPU inferior al 15% durante la traducción., docs.meshtastic.org, TSK-001.1 Instalar dependencias seriales, TSK-001.2 Configurar broker MQTT local, TSK-002, N/A, Necesitamos asegurar que el módulo LoRa físico sea compatible con la interfaz de la Zimaboard.

#### Tarea 2: [TSK-002] Auditoría Legal de Privacidad en Redes Mesh y Justificación de Hardware
Auditoría Legal de Privacidad en Redes Mesh y Justificación de Hardware, Redacción del marco legal y términos de servicio para la transmisión de datos a través de Meshtastic, vinculando este hardware como infraestructura crítica para justificar los 5000€ ante el Ayuntamiento de Reus., TASK, ALTA, M1-Subvencion-Reus, main, hypenosys-legal, Concepto / GDD, COMPLIANCE
Hermanita, N/A, Legal-Shield, legal@hypenosys.local, axel@hypenosys.local, 2025-09-15, 2025-10-01, 25, 5, TO DO, 0%
#RGPD #Subvencion #Reus #Compliance, - [ ] Redactar Anexo de privacidad para redes offline. - [ ] Incluir facturas proforma de nodos M5Stack y Zimaboards en la memoria técnica., reus.cat/subvencions, TSK-002.1 Revisar RGPD sobre redes descentralizadas, N/A, TSK-001, La memoria legal debe estar finalizada mucho antes de la fecha límite del 30 de junio de 2026.

#### Tarea 3: [HUECO] Implementación de Staging para Tareas Externas (Buzón Additive-Only)
Diseño e implementación de un mecanismo de ingesta de tareas para agentes que no modifique `_data/dashboard_tasks.json` directamente, utilizando un archivo de staging o persistencia en localStorage con sincronización manual para aprobación de Axel., FEATURE, CRÍTICA, M1-Infraestructura-Core, feature/tasks-staging, hypenosys/hypenosys.github.io, Tools / Automation, BACKEND
Alex, Axel, Alex, alex@hypenosys.local, axel@hypenosys.local, 2025-06-23, 2025-06-30, 16, 5, TO DO, 0%
#Architecture #API #Security #AdditiveOnly, - [ ] Crear `_data/pending_tasks.json` (esquema inicial). - [ ] Botón "Aprobar Tarea" en Dashboard que mueva de Staging a Producción. - [ ] Proteger el flujo de escritura de agentes externos., N/A, TSK-STG.1 Definir esquema de buzón, TSK-001, TSK-002, N/A, Pre-requisito técnico para insertar TSK-001 y TSK-002 sin violar restricciones.
