# Análisis de Causa Raíz e Inventario de Estado Canónico

## 1. Causa Raíz
El historial de ejecución de Jules ("Jules Execution History" en `#neural-jules-history`) permanece vacío por los siguientes motivos:
1. **Falta de invocación:** En el flujo de carga de una conversación Neural (`window.loadJulesPanelSession`), no se ejecuta ninguna llamada a `window.loadAndRenderJulesSession(sid)` ni se intentan obtener las actividades de la tarea vinculada.
2. **Definición ausente:** La función `window.loadAndRenderJulesSession` requerida no está implementada en ninguna parte del código actual de Hypenosys.
3. **Falta de resolución unificada de IDs:** La vinculación de tareas de Jules utiliza múltiples formatos de metadatos en distintas partes de la interfaz (ej. `linkedJulesTaskId` en el campo `metadata` frente a formatos de `localStorage` heredados).
4. **Desvío de actividades:** El módulo original de actividades (`jules-activities.js`) está diseñado para pintar actividades de Jules directamente en el bloque inferior de Claude (`#v2-chat-messages`), en lugar del bloque superior reservado (`#neural-jules-history`).

## 2. Fuentes Canónicas de Vinculación de Jules IDs
Para garantizar la compatibilidad con todas las conversaciones existentes y nuevas, se identifican las siguientes fuentes en orden de prioridad:
1. `session.linkedJulesTaskId` o `session.linkedJulesSessionId` o `session.julesTaskId` o `session.julesSessionId`
2. `session.metadata.linkedJulesTaskId` o `session.metadata.linkedJulesSessionId` o `session.metadata.julesTaskId` o `session.metadata.julesSessionId`
3. `localStorage.getItem('hy_neural_session_id_' + session.id)`
4. `localStorage.getItem('hy_neural_session_id')` (fallback heredado si el ID coincide con la sesión Claude activa).
