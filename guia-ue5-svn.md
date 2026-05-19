---
layout: page
title: "Guía de Supervivencia: UE5 + SVN (TortoiseSVN)"
---

# Guía de Supervivencia: UE5 + SVN 🛠️

Bienvenidos a la biblia de **Hypenosys**. Para que no nos matemos entre nosotros y el proyecto no explote, seguid estos pasos al pie de la letra.

## 1. Herramientas Necesarias
* **Unreal Engine 5 (Versión Actual):** Asegúrate de tener instalada la misma versión que el resto (mira el `.uproject`).
* **TortoiseSVN:** Descárgalo e instálalo. Reinicia el PC si te lo pide (hazlo, no seas vago).

## 2. Configuración Inicial (Checkout)
1. Crea una carpeta para el proyecto (ej: `C:\Proyectos\Hypenosys`).
2. Click derecho en la carpeta > **SVN Checkout...**.
3. Pega la URL del repositorio que te ha pasado Alex/Axel.
4. Dale a OK y espera a que baje todo.

## 3. Configuración en Unreal Engine
Una vez abierto el proyecto:
1. Abajo a la derecha, click en **Source Control** > **Connect to Source Control**.
2. Selecciona **Subversion**.
3. Rellena los datos (Username, Password, Repository).
4. Click en **Accept Settings**. Si sale un tick verde, eres un genio.

## 4. Flujo de Trabajo Diario (IMPORTANTE)

### ANTES de empezar a trabajar (Update)
* Click derecho en la carpeta del proyecto > **SVN Update**.
* **¿Por qué?** Porque si no lo haces y alguien ha tocado lo mismo, la hemos liado.

### MIENTRAS trabajas (Locking)
* UE5 suele hacer "Checkout" (bloqueo) automático de los assets cuando los editas.
* Si un asset tiene un icono de candado rojo, **NO LO TOQUES**. Significa que alguien ya lo está editando.

### AL ACABAR (Commit/Submit)
1. Guarda todo en UE5.
2. Click derecho en la carpeta del proyecto > **SVN Commit...**.
3. **ESCRIBE UN MENSAJE CON SENTIDO.** (Ej: "Añadida trampa que te mata de risa", no pongas "asdf").
4. Dale a OK.

## 5. Reglas de Oro 📜
1. **NUNCA** subas archivos binarios que no sean del proyecto (nada de `Intermediate`, `Saved`, o `DerivedDataCache`). El `.gitignore` o el `svn:ignore` deberían encargarse, pero ojo.
2. **SIEMPRE** haz Update antes de empezar.
3. **SIEMPRE** avisa por Discord si vas a tocar un nivel entero o el `ProjectSettings`.
4. Si sale un conflicto: **NO ENTRES EN PÁNICO.** Llama a Alex o Axel. No intentes arreglarlo borrando cosas al azar.

---

*Si sigues estos pasos, el SVN será tu amigo. Si no, será tu peor pesadilla.* 💀
