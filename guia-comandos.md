---
layout: page
title: "Guía Técnica: Comandos y Flujos (Git, SVN & IA)"
permalink: /guia-comandos/
---

# 🛠️ Guía Técnica de Operaciones

Esta guía detalla los comandos esenciales y los flujos de trabajo de **Hypenosys** para garantizar la integridad del proyecto y la eficiencia del equipo.

---

## 1. Control de Versiones: Git vs SVN

En Hypenosys utilizamos un sistema híbrido para optimizar el rendimiento:
*   **Git (GitHub):** Exclusivo para código fuente, archivos de configuración (`.json`, `.yml`) y documentación (`.md`).
*   **SVN (Subversion):** Exclusivo para activos binarios pesados de Unreal Engine (`.uasset`, `.umap`, `.fbx`, `.png`, `.wav`).

### ¿Por qué?
Git es excelente para texto pero sufre con archivos binarios grandes. SVN permite bloquear archivos (**Lock**), evitando que dos personas editen el mismo mapa o textura al mismo tiempo, algo vital en el desarrollo con UE5.

---

## 2. Referencia de Comandos CLI (Línea de Comandos)

Para los que prefieren la terminal o necesitan automatizar tareas.

### Subversion (SVN)
| Comando | Descripción |
| :--- | :--- |
| `svn checkout [URL]` | Descarga el repositorio por primera vez. |
| `svn update` | Trae los cambios más recientes del servidor. |
| `svn commit -m "Mensaje"` | Sube tus cambios locales al servidor. |
| `svn lock [archivo]` | Bloquea un archivo para que nadie más pueda editarlo. |
| `svn unlock [archivo]` | Libera el bloqueo del archivo. |
| `svn status` | Muestra qué archivos has modificado localmente. |
| `svn revert [archivo]` | Deshace tus cambios locales y vuelve a la versión del servidor. |
| `svn log -l 5` | Muestra los últimos 5 mensajes de commit. |

### Git
| Comando | Descripción |
| :--- | :--- |
| `git pull` | Descarga y fusiona los cambios remotos. |
| `git add .` | Prepara todos los cambios para el commit. |
| `git commit -m "Mensaje"` | Crea un punto de control con tus cambios. |
| `git push` | Sube tus commits a GitHub. |
| `git status` | Verifica el estado de tu copia de trabajo. |
| `git checkout -b [rama]` | Crea y salta a una nueva rama de trabajo. |

---

## 3. Flujo TortoiseSVN (Windows)

El flujo diario estándar para artistas y diseñadores:

1.  **Update (Mañana):** Click derecho en la carpeta del proyecto > `SVN Update`. Empieza siempre con la última versión.
2.  **Lock (Antes de editar):** Si vas a tocar un `.uasset` o `.umap`, asegúrate de que no tenga un candado rojo. Click derecho > `TortoiseSVN` > `Get Lock`.
3.  **Edit:** Realiza tus cambios en Unreal Engine.
4.  **Commit (Al terminar):** Click derecho > `SVN Commit...`. Escribe un mensaje descriptivo. El bloqueo se liberará automáticamente al subir.
5.  **Revert (Si algo sale mal):** Si rompiste algo y no has subido, click derecho > `TortoiseSVN` > `Revert`.

---

## 4. 🤖 Flujo de Trabajo con IA (Claude → Jules)

Optimizamos el desarrollo utilizando IA para actuar directamente sobre el repositorio. El flujo estándar es:

1.  **Conceptualización (Claude):**
    *   Describe lo que necesitas en lenguaje natural a **Claude** (ej: "Necesito un script en Python que limpie los JSON de tareas obsoletas").
    *   Claude analizará la lógica y preparará la ejecución.

2.  **Generación de Prompt Técnico:**
    *   Pídele a Claude: *"Genera un prompt estructurado para Jules que ejecute esta tarea en el repositorio"*.
    *   Claude generará un bloque de texto técnico y preciso que Jules entiende a la perfección.

3.  **Ejecución (Jules):**
    *   Copia el prompt generado por Claude.
    *   Ve al **Jules Panel** en nuestro Dashboard.
    *   Pega el prompt y arranca la sesión.

4.  **Verificación:**
    *   Jules realizará los cambios, creará la rama o el Pull Request y reportará el resultado.
    *   Revisa el log de actividad en el panel para confirmar que todo es correcto.

---

*Recuerda: Si tienes dudas con un conflicto de archivos, **no fuerces el commit**. Pregunta en el canal de desarrollo.*
