---
layout: page
title: "Estructura del Proyecto: El Manifiesto Operacional"
---

# 🛠️ PROTOCOLO DE SUPERVIVENCIA ARQUITECTÓNICA

Este documento constituye la única fuente de verdad sobre cómo se organiza el caos en este estudio. El incumplimiento de estas normas no solo resultará en fallos de merge en SVN, sino en la erosión sistemática de mi paciencia. 

---

## 1. EL ÁRBOL FILOGENÉTICO DEL PROYECTO (Arquitectura de Carpetas)

La carpeta `/Content/` no es un vertedero. Es un ecosistema sagrado. Se impone la siguiente jerarquía basada en prefijos numéricos para forzar el orden alfabético y mental:

```text
/Content/
├── 01_Core/                # El cerebro del proyecto. Si esto falla, nada existe.
│   ├── GameModes/          # Lógica de reglas de juego.
│   ├── Controllers/        # PlayerControllers y AIControllers.
│   ├── Inputs/             # Enhanced Input Actions y Mapping Contexts.
│   └── Interfaces/         # Blueprints Interfaces (BPI_).
├── 02_Design/              # Donde la magia se vuelve lógica (y bugs).
│   ├── Blueprints/         # Actores lógicos y componentes.
│   ├── UI/                 # Widgets (WBP_) y lógica de interfaz.
│   └── Data/               # DataTables y DataAssets. No hardcodear nada.
├── 03_Art/                 # Lo que el jugador ve (mientras el código llora).
│   ├── Animations/         # Rigs, SkelMeshes y AnimBlueprints.
│   ├── Audio/              # Cues y Waves.
│   ├── Materials/          # Master Materials (M_) únicamente.
│   │   └── Instances/      # Material Instances (MI_) - OBLIGATORIO.
│   ├── Textures/           # Mapas de bits.
│   └── Vehicles/           # Assets específicos de conducción.
├── 04_Environment/         # El escenario de nuestros crímenes.
│   ├── Architecture/       # SM_ de paredes, suelos, techos.
│   ├── Props/              # SM_ de mobiliario y detalle.
│   └── Maps/               # Niveles (.umap). Nada de "Test_Final_V2_REAL".
└── 05_Developers/          # Zona de Pruebas Bacteriológicas (Safe Zone).
    ├── Axlfc/              # Territorio de Axel.
    ├── mitxel2022/         # Territorio de Mitxel.
    └── TopperH4rley/       # Territorio de Topper.
```

---

## 2. REGLAS BACTERIOLÓGICAS DE NOMENCLATURA (Zero-Tolerance)

El uso de espacios, tildes o la letra "ñ" se considera un acto de sabotaje industrial. Los sistemas de archivos entre Windows (nuestro entorno de edición) y los servidores Linux de integración no comparten vuestro amor por la gramática española.

### Tabla de Prefijos Obligatorios

| Tipo de Asset | Prefijo | Ejemplo |
| :--- | :--- | :--- |
| **Blueprint Class** | `BP_` | `BP_PlayerController` |
| **Static Mesh** | `SM_` | `SM_Concrete_Column_01` |
| **Skeletal Mesh** | `SK_` | `SK_MainCharacter` |
| **Texture** | `T_` | `T_Brick_Wall_ORM` |
| **Master Material** | `M_` | `M_Base_Opaque` |
| **Material Instance**| `MI_` | `MI_Concrete_Floor_Dirty` |
| **Widget Blueprint** | `WBP_` | `WBP_MainMenu` |
| **Level / Map** | `L_` | `L_DeepNight_Sublevel_01` |
| **Data Asset** | `DA_` | `DA_WeaponStats` |

**Nota sobre Sufijos:** Utilice guiones bajos (`_`) solo para identificadores de estado o variantes. 
- **Correcto:** `T_Rock_Base_Normal`, `MI_Metal_Rusted_02`.
- **Incorrecto:** `T Rock Base (1)`, `MI_Metal_Ñoño`.

---

## 3. EL PROTOCOLO DE CONCURRENCIA: LOCKS Y REGLAMENTO DOMINICAL

Unreal Engine maneja archivos binarios (`.uasset`, `.umap`). Estos archivos **NO SE PUEDEN MEZCLAR**. Si dos personas editan el mismo archivo, una de ellas ha perdido su tiempo y la otra ha ganado un enemigo.

### La Mecánica del Lock (Bloqueo)
1. **Adquisición:** Antes de mover un solo vértice, DEBES adquirir el bloqueo (Lock) en SVN. 
2. **Exclusividad:** Si el candado está en rojo, ese asset pertenece a otra alma. No lo toques. No pidas que lo suelten a menos que sea una emergencia nacional.
3. **Infracción:** Modificar archivos sin bloqueo previo es una falta administrativa grave.

### The Sunday Purge (La Purga Dominical) 🧹
Para evitar el "Hoarding" (acaparamiento) de assets por desarrolladores olvidadizos que se van de cañas el viernes sin hacer commit:

> **Cada Domingo a las 09:00 AM**, un cron job en el servidor ejecuta un `svn unlock --force` masivo sobre todo el repositorio.

Si tenías algo bloqueado y no subiste los cambios antes de esa hora, el bloqueo desaparecerá. Cualquier otro desarrollador podrá tomar el control del asset durante la sesión de ideación dominical. El servidor no tiene sentimientos; yo tampoco.

### La Directiva Sandbox (Exención)
Todo lo que resida dentro de `05_Developers/` está exento de las políticas de bloqueo estricto. Es vuestro jardín de juegos. Podéis romper cosas allí, siempre que no contaminéis el `01_Core`.

