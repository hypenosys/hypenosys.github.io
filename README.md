# 🌌 Hypenosys Dashboard

Bienvenido al centro de operaciones de Hypenosys, un estudio de videojuegos indie enfocado en la perfección técnica y la estética oscura. Este dashboard centraliza la gestión de tareas, métricas de equipo e integración avanzada con agentes de IA.

Construido sobre **Jekyll** y desplegado mediante **GitHub Pages**, el sistema utiliza una arquitectura "serverless" basada en el almacenamiento del lado del cliente y la API de GitHub para la persistencia de datos.

---

## 🎨 Estética y Experiencia

El proyecto sigue estrictamente el tema visual **Dracula**, diseñado para reducir la fatiga visual durante largas sesiones de desarrollo:

*   **Fondo (Background):** `#282a36`
*   **Primer Plano (Foreground):** `#f8f8f2`
*   **Acentos:** Morado (`#bd93f9`), Verde (`#50fa7b`), Cian (`#8be9fd`), Rojo (`#ff5555`) y Amarillo (`#f1fa8c`).

---

## 🚀 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado el siguiente software en tu entorno local:

*   **Ruby >= 3.2.0**: El motor detrás de Jekyll.
*   **Bundler >= 2.0**: Para la gestión de gemas de Ruby.
*   **Node.js & npm**: Necesarios para ejecutar la suite de pruebas automatizadas (Playwright).
*   **Navegador Moderno**: Soporte para ES6+, `localStorage` y `sessionStorage`.

---

## ⚙️ Instalación y Configuración

### 1. Clonar el Repositorio
```bash
git clone https://github.com/hypenosys/hypenosys.github.io.git
cd hypenosys.github.io
```

### 2. Instalar Dependencias
Instala las gemas de Ruby necesarias para Jekyll:
```bash
bundle install
```

Si planeas ejecutar pruebas, instala las dependencias de Node:
```bash
npm install
```

### 3. Configuración del Entorno (Client-Side)
A diferencia de las aplicaciones tradicionales, este dashboard **no utiliza archivos `.env`**. Toda la configuración se gestiona desde la interfaz de usuario y se persiste de forma segura en el almacenamiento local de tu navegador.

#### 🛠️ Modal de Ajustes del Sistema (Settings)
Accede desde el icono de engranaje para configurar la conectividad base:
*   **GitHub PAT:** Un *Personal Access Token* con permisos de `repo`. Se guarda como `gh_access_token`.
*   **Repositorio Objetivo:** El repositorio donde se leerán/escribirán los datos (ej: `hypenosys/hypenosys.github.io`). Se guarda como `github_repo`.
*   **Jules API Key:** Clave necesaria para la comunicación con el agente de IA. Se guarda como `jules_api_key`.

#### 🧠 Modal de Configuración API (IA)
Permite definir qué motor de IA impulsará las funciones de asistencia:
*   **Proveedores Soportados:** Anthropic (Claude), OpenAI, Google Gemini, Mistral, OpenRouter, Ollama (Local) y Custom.
*   **Configuración Local:** Soporta Ollama mediante detección automática de endpoints y modelos.
*   **Persistencia:** Se guarda bajo la clave `hy_ai_config` en `localStorage`.

---

## 🏃 Ejecución

### Desarrollo Local
Para compilar el sitio y servirlo localmente con recarga automática:
```bash
bundle exec jekyll serve
```
El dashboard estará disponible en `http://localhost:4000`.

### Construcción de Producción
Para generar los archivos estáticos finales en el directorio `_site`:
```bash
bundle exec jekyll build
```

---

## 🏛️ Arquitectura del Proyecto

El repositorio está organizado siguiendo las convenciones de Jekyll, con lógica adicional para la interactividad:

*   **`_data/`**: Contiene la persistencia del sistema en formato JSON.
    *   `dashboard_tasks.json`: El Kanban vivo del equipo.
    *   `team_profiles.json`: Configuración y bio de los miembros.
    *   `studio_stats.json`: Métricas de rendimiento.
*   **`_includes/`**: Componentes HTML reutilizables (modales, headers, footers).
*   **`_layouts/`**: Plantillas maestras para las diferentes páginas.
*   **`assets/javascript/`**: El "cerebro" del dashboard.
    *   `github-api.js`: Abstracción para interactuar con la API de GitHub (Contents API). Implementa escritura atómica para evitar conflictos 409.
    *   `auth.js`: Gestor global de autenticación y estado de sesión.
*   **`pages/`**: Páginas adicionales y herramientas experimentales.

---

## ⚖️ Licencia

Este proyecto es propiedad de **Hypenosys Indie Studio**. Consulta el archivo `LICENSE.md` para más detalles.
