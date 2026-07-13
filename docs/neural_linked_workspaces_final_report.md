# Informe Final de Implementación: Workspaces Separados de Claude y Jules con Vinculación Bidireccional

Este documento describe la arquitectura, la separación visual de interfaces, la persistencia, las invariantes relacionales y las pruebas de la refactorización premium de la vista Neural del Jules Panel.

---

## 1. Inventario Real de Elementos de la Base de Código

A continuación se detalla la tabla de inventario obligatorio con los identificadores, funciones, claves y manejadores mapeados antes de la modificación, junto con su estado final de resolución.

| Archivo | IDs | Funciones | Claves de Storage | Listeners/Eventos | Polling/Timers | BroadcastChannel | Resolución |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`pages/jules-panel.html`** | `#view-chat`, `#neural-workspace-tabs`, `#neural-tab-claude`, `#neural-tab-jules`, `#v2-chat-messages`, `#jules-history-container`, `#neural-claude-workspace`, `#neural-jules-workspace`, `#v2-task-context`, `#claude-linking-bar`, `#jules-linking-bar` | *(Ninguna directa)* | *(Ninguna directa)* | `onclick`, `onkeydown`, navigation tab click handlers | *(Ninguno)* | *(Ninguno)* | **Added / Replaced** (Estructurado en paneles con tabpanel e IDs funcionales separados para Claude y Jules). |
| **`assets/javascript/jules-panel-neural.js`** | `#v2-chat-input`, `#v2-send-btn`, `#v2-thinking-indicator` | `setNeuralWorkspaceMode`, `selectLinkedClaudeConversation`, `selectLinkedJulesSession`, `restoreNeuralWorkspaceState`, `persistNeuralWorkspaceState`, `renderJulesEmptyState`, `renderJulesLinkingBar`, `createNewClaudeFromJulesSession`, `startNeuralWorkspacePolling`, `stopNeuralWorkspacePolling`, `loadAndRenderJulesSession`, `renderChatV2Messages` | `claude_chat_sessions`, `hy_active_claude_session_id`, `hy_neural_session_id`, `hypenosys_neural_workspace_mode` | `julesActivitiesUpdated`, `storage` listener, tab click, keyboard navigation (Left, Right, Home, End, Enter, Space) | `window.neuralWorkspacePollInterval` (actividades) | `hypenosys_neural_sessions_sync` | **Added / Consolidated** (Se convirtió en el controlador canónico unificado para ambos workspaces, centralizando el estado e invariantes). |
| **`assets/javascript/jules-panel-sessions.js`** | `#sb-neural-history-list` | `updateNeuralHistory`, `selectSession`, `getLinkedJulesSessionId` | `jules_sessions_cache` | `onclick` en sidebar (adaptado para no romper navegación) | `activeSessionPollInterval` (estados de ejecución) | *(Ninguno)* | **Preserved / Adapted** (Adaptado el manejador de click del sidebar de Jules para sincronizar la pareja vinculada en lugar de saltar a Kanban al estar en la vista Neural). |
| **`assets/javascript/neural-chat-sessions.js`** | `#session-list` | `loadSession`, `createNewSession`, `saveSessions`, `renderSessionList`, `deleteSession`, `archiveSession` | `claude_chat_sessions`, `claude_archived_sessions` | `storage` listener | *(Ninguno)* | `hypenosys_neural_sessions_sync` | **Preserved / Consolidated** (Consolidada la persistencia canónica de Claude sin duplicar colecciones). |
| **`assets/javascript/jules-activities.js`** | `#v2-chat-messages` | `activityToHTML` | *(Ninguna)* | *(Ninguno)* | *(Ninguno)* | *(Ninguno)* | **Preserved** (Reutilizada de forma directa e intacta para renderizar actividades de Jules sin duplicar lógica). |
| **`_includes/jules-panel-styles.html`** | *(Varios)* | *(Ninguna)* | *(Ninguna)* | *(Ninguno)* | *(Ninguno)* | *(Ninguno)* | **Added** (Añadidos estilos para control segmentado, pestañas premium, hover con brillo, barras de vinculación y responsividad móvil). |

---

## 2. Arquitectura de Estado Canónico y Relación

### Relación Canónica 1-a-1
La relación entre la conversación de Claude y la ejecución de Jules se modela y almacena en el objeto de conversación Claude (fuente canónica de verdad):
```json
{
  "id": "session_claude_id",
  "title": "Configuración de perfiles IA",
  "metadata": {
    "linkedJulesTaskId": "jules_session_id",
    "linkedJulesTaskTitle": "Mock Task Title"
  }
}
```

Para asegurar que nunca haya parejas incompatibles o cruzadas, se consolidó el estado canónico de la UI en memoria:
```javascript
window.NeuralWorkspaceState = {
  activeMode: 'claude', // 'claude' o 'jules'
  activeClaudeConversationId: null,
  activeJulesSessionId: null
};
```

### Invariantes de Sincronización Relacional
* **Selección en Claude:** Al seleccionar una conversación Claude en el sidebar `#ng-chat-history`, se resuelve su vínculo Jules mediante `resolveLinkedJulesId`. El ID de Jules se actualiza en `activeJulesSessionId` para preparar la sesión correspondiente, o se establece en `null` si la conversación es `Claude Only`.
* **Selección en Jules:** Al seleccionar una sesión de Jules en el sidebar `#ng-history`, se realiza un lookup reverso derivado sobre `julesPanelSessions` para encontrar cuál es la conversación de Claude vinculada canónicamente. Ambos IDs se actualizan atómicamente.
* **Mismatches Bloqueados (`LINKED_SESSION_MISMATCH`):** En el composer de Jules, antes de despachar un comando, se verifica que `activeJulesSessionId` coincide estrictamente con la relación guardada en la conversación Claude activa. Si existe discrepancia, se bloquea el envío, se reconcilia el estado y se notifica visualmente al usuario, evitando fallbacks accidentales.

---

## 3. Comportamiento de Flujo y Navegación

### Cambio de Pestañas (Tab-Switching)
El cambio de pestañas abre exactamente la contraparte vinculada de la otra sesión:
* **CLAUDE → JULES:** Abre la sesión Jules exactamente vinculada a la conversación Claude activa. Si la conversación no tiene vínculo, muestra un empty state contextual (`Jules Only`) con opciones de vincular o crear.
* **JULES → CLAUDE:** Abre la conversación Claude exactamente vinculada a la sesión Jules visible. Si la sesión no tiene vínculo, muestra un empty state de vinculación (`Claude Only`).

### Barras de Vinculación Bidireccionales
* **Barra en Claude:** Muestra si la sesión está vinculada (`Claude + Jules`) o no (`Claude Only`). Botones dinámicos:
  * `[Ver en Jules]`: Cambia el modo activo a `jules`, cargando la sesión exacta en el panel.
  * `[Cambiar tarea]`: Abre un selector modal seguro con escape de caracteres HTML para elegir un ID real de Jules.
  * `[Desvincular]`: Rompe la relación conservando intactas ambas sesiones de forma segura.
* **Barra en Jules:** Muestra la conversación vinculada o el estado unlinked (`Jules Only`). Ofrece `[Ver en Claude]`, `[Cambiar conversación]` y `[Desvincular]`.

---

## 4. Polling de Instancia Única y Sincronización Cross-Tab

* **Control de Polling:** Se implementó `startNeuralWorkspacePolling` que administra el intervalo de actividades para exactamente una sesión de Jules activa a la vez. Al cambiar de pestaña (a Claude), cambiar de sesión, o al completarse la ejecución, el intervalo anterior se destruye explícitamente mediante `stopNeuralWorkspacePolling`, garantizando un consumo de CPU óptimo de instancia única.
* **Sincronización Cross-Tab:** El canal `hypenosys_neural_sessions_sync` retransmite y coordina eventos de cambio de modo, cambios de sesión activa y desvinculaciones entre múltiples pestañas del navegador, impidiendo ciclos de bucle infinito (echo loops) y protegiendo el orden de escritura.

---

## 5. Pruebas y Cobertura Ejecutada

Se crearon tres suites completas de pruebas automatizadas en Playwright bajo `tests/` y se actualizaron las pruebas de historial existentes:

1. **`tests/verify_neural_workspace_claude.spec.ts`**: Valida el estado por defecto, visibilidad de los paneles del workspace Claude, ocultamiento de actividades Jules, composer con placeholder Claude, y creación de conversaciones sin herencia.
2. **`tests/verify_neural_workspace_jules.spec.ts`**: Valida la renderización del historial Jules, el cargado de actividades desde caché/SWR, controles del composer Jules, y visibilidad de detalles de repositorio/rama.
3. **`tests/verify_neural_linked_workspaces.spec.ts`**: Prueba de integración de extremo a extremo que verifica las transiciones bidireccionales, la prevención de parejas cruzadas de almacenamiento, la restauración de hidratación, el bloqueo ante `LINKED_SESSION_MISMATCH`, y el flujo completo de desvinculación sin pérdida de datos.
4. **`tests/verify_neural_jules_history.spec.ts`**: Actualizada para soportar las pestañas, garantizando compatibilidad 100% con XSS y tiempos asíncronos.

### Resultado de Ejecución de Pruebas
Todas las pruebas de integración pasaron con **100% de éxito**:
```text
Running 4 tests using 2 workers
✓ tests/verify_neural_workspace_claude.spec.ts (passed)
✓ tests/verify_neural_linked_workspaces.spec.ts (passed)
✓ tests/verify_neural_workspace_jules.spec.ts (passed)
✓ tests/verify_neural_jules_history.spec.ts (passed)
4 passed (9.7s)
```

---

## 6. Limitaciones y Deuda Técnica

* **Dependencia de Red:** Las pruebas Playwright mockean las APIs de GitHub y Jules de forma completa y determinista para permitir su ejecución en entornos offline o sandboxes sin credenciales. No obstante, en un entorno de producción, la red real y la latencia del clúster de Hypenosys modularán los tiempos SWR reales.
* **Ollama Local:** El test detecta la desconexión típica de Ollama local (`ERR_CONNECTION_REFUSED` en el puerto 11434), lo cual es normal y seguro y no bloquea el flujo principal.
