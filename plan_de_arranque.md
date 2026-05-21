<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plan Operativo: Estudio Indie (Fase 0)</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        /* Base styles and custom overrides */
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f5f5f4; /* warm neutral stone-100 */
            color: #292524; /* stone-800 */
        }
        
        .chart-container { 
            position: relative; 
            width: 100%; 
            max-width: 800px; 
            margin-left: auto; 
            margin-right: auto; 
            height: 250px; 
        }

        /* Custom scrollbar */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #e7e5e4; border-radius: 4px; }
        ::-webkit-scrollbar-thumb { background: #a8a29e; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #78716c; }

        /* Navigation active state */
        .nav-btn.active {
            background-color: #0f766e; /* teal-700 */
            color: white;
            border-color: #0f766e;
        }
        
        .fade-in {
            animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body class="min-h-screen flex flex-col">

    <!-- Header -->
    <header class="bg-stone-900 text-stone-50 shadow-md p-6">
        <div class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3">
                    <i class="fa-solid fa-gamepad text-teal-500"></i> Proyecto Indie: Plan de Arranque
                </h1>
                <p class="text-stone-400 mt-1">Manual operativo, técnico e infraestructura para el equipo de 5.</p>
            </div>
            <div class="flex items-center gap-3 bg-stone-800 p-3 rounded-lg border border-stone-700">
                <span class="text-xl">🚀</span>
                <div>
                    <span class="block text-xs font-semibold tracking-wider text-stone-400 uppercase">Estado Actual</span>
                    <span class="text-sm font-bold text-teal-400">Fase 0: Infraestructura & GDD</span>
                </div>
            </div>
        </div>
    </header>

    <!-- Navigation -->
    <nav class="bg-white border-b border-stone-200 sticky top-0 z-10 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex space-x-2 overflow-x-auto py-3 hide-scrollbar">
                <button onclick="navigate('resumen')" id="btn-resumen" class="nav-btn active whitespace-nowrap px-4 py-2 rounded-md border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors">📊 Resumen General</button>
                <button onclick="navigate('onboarding')" id="btn-onboarding" class="nav-btn whitespace-nowrap px-4 py-2 rounded-md border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors">👥 Onboarding & Roles</button>
                <button onclick="navigate('pipeline')" id="btn-pipeline" class="nav-btn whitespace-nowrap px-4 py-2 rounded-md border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors">🎮 Pipeline & Flujo</button>
                <button onclick="navigate('unreal-fab')" id="btn-unreal-fab" class="nav-btn whitespace-nowrap px-4 py-2 rounded-md border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors">🧱 Unreal & Ecosistema Fab</button>
                <button onclick="navigate('repos')" id="btn-repos" class="nav-btn whitespace-nowrap px-4 py-2 rounded-md border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors">💻 Git, SVN & Repos</button>
                <button onclick="navigate('changelogs')" id="btn-changelogs" class="nav-btn whitespace-nowrap px-4 py-2 rounded-md border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors">📝 Registro (Changelogs)</button>
                <button onclick="navigate('ritual')" id="btn-ritual" class="nav-btn whitespace-nowrap px-4 py-2 rounded-md border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors">⚡ Ritual Domingo</button>
            </div>
        </div>
    </nav>

    <!-- Main Content Area -->
    <main class="flex-grow max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">

        <!-- VIEW: RESUMEN -->
        <section id="view-resumen" class="view-section fade-in">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-stone-800 mb-2">Visión General de Arranque</h2>
                <p class="text-stone-600 max-w-3xl">
                    Este panel interactivo centraliza la planificación para nuestro estudio de 5 personas. Establecemos una regla inquebrantable de <strong>infraestructura primero</strong>: nadie programará ni creará arte hasta que el entorno colaborativo (Git, SVN, Motores y Herramientas) esté 100% montado y testeo.
                </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <div class="bg-white p-5 rounded-xl shadow-sm border border-stone-200 border-t-4 border-t-red-500">
                    <div class="text-2xl mb-2 text-red-500"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <h3 class="text-md font-bold mb-1">Paso 0 (Crítico)</h3>
                    <p class="text-xs text-stone-600">Montar infraestructura y herramientas. Cero líneas de código o modelos 3D hasta completar esto.</p>
                </div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-stone-200 border-t-4 border-t-teal-600">
                    <div class="text-2xl mb-2 text-teal-600"><i class="fa-solid fa-comments"></i></div>
                    <h3 class="text-md font-bold mb-1">Paso 1: Ideación</h3>
                    <p class="text-xs text-stone-600">Lluvia de ideas y creación conjunta de un Game Design Document (GDD) cerrado.</p>
                </div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-stone-200 border-t-4 border-t-amber-500">
                    <div class="text-2xl mb-2 text-amber-500"><i class="fa-solid fa-cubes"></i></div>
                    <h3 class="text-md font-bold mb-1">Paso 2: Greyboxing</h3>
                    <p class="text-xs text-stone-600">Programadores y diseñadores prueban el loop de juego mientras los de arte acumulan material.</p>
                </div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-stone-200 border-t-4 border-t-purple-600">
                    <div class="text-2xl mb-2 text-purple-600"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                    <h3 class="text-md font-bold mb-1">Paso 3: Vestido</h3>
                    <p class="text-xs text-stone-600">Una vez el gameplay está pulido en cajas grises, el equipo de arte decora y pule la escena final.</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 lg:col-span-2">
                    <h3 class="text-lg font-bold text-stone-800 mb-4">Estimación de Esfuerzo en Pre-Producción</h3>
                    <div class="chart-container">
                        <canvas id="effortChart"></canvas>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
                    <h3 class="text-lg font-bold text-stone-800 mb-3"><i class="fa-solid fa-clock-rotate-left"></i> Ritmo Dominical</h3>
                    <p class="text-sm text-stone-600 mb-4">
                        Quedaremos todos los <strong>domingos por la mañana</strong>. No es para trabajar a ciegas, sino para sincronizar objetivos claros:
                    </p>
                    <ul class="space-y-3 text-xs text-stone-700">
                        <li class="flex items-center gap-2"><i class="fa-solid fa-check-double text-teal-600"></i> <strong>Revisión semanal:</strong> 15 minutos de demo visual de avances.</li>
                        <li class="flex items-center gap-2"><i class="fa-solid fa-fire text-red-500"></i> <strong>Resolución de bloqueos:</strong> El único que sabe asiste a los rookies.</li>
                        <li class="flex items-center gap-2"><i class="fa-solid fa-list-check text-blue-500"></i> <strong>Reparto Kanban:</strong> Asignar tareas cortas y realistas de 1 semana.</li>
                    </ul>
                </div>
            </div>
        </section>

        <!-- VIEW: ONBOARDING -->
        <section id="view-onboarding" class="view-section hidden fade-in">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-stone-800 mb-2">Estructura del Equipo y Onboarding</h2>
                <p class="text-stone-600 max-w-3xl">
                    Somos un equipo de 5 personas. Dado que 4 son principiantes, asignamos <strong>roles primarios y secundarios</strong> de modo que todos tengan un foco principal pero puedan apoyarse mutuamente si alguien se queda colgado.
                </p>
            </div>

            <!-- Team status checklist -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-8">
                <h3 class="text-lg font-bold text-stone-800 mb-4"><i class="fa-solid fa-users"></i> Estado de Onboarding del Equipo</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <!-- Alex -->
                    <div class="p-4 bg-teal-50 border border-teal-200 rounded-lg">
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-stone-800">Alex</h4>
                            <span class="text-xs bg-teal-200 text-teal-800 px-2 py-0.5 rounded font-mono">Git OK</span>
                        </div>
                        <p class="text-xs text-stone-600 mb-2"><strong>Primario:</strong> Programador Procedural</p>
                        <p class="text-xs text-stone-500"><strong>Secundario:</strong> Blueprints & Tech Art</p>
                    </div>

                    <!-- Axel -->
                    <div class="p-4 bg-teal-50 border border-teal-200 rounded-lg relative">
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-stone-800">Axel</h4>
                            <span class="text-xs bg-teal-200 text-teal-800 px-2 py-0.5 rounded font-mono">Git OK</span>
                        </div>
                        <p class="text-xs text-stone-600 mb-2"><strong>Primario:</strong> Programador Procedural</p>
                        <p class="text-xs text-stone-500"><strong>Secundario:</strong> Sistemas e Infraestructura</p>
                        <span class="absolute bottom-1 right-2 text-[10px] text-teal-600 font-bold"><i class="fa-brands fa-linux"></i> Arch User (CachyOS)</span>
                    </div>

                    <!-- Mitxel -->
                    <div class="p-4 bg-teal-50 border border-teal-200 rounded-lg">
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-stone-800">Mitxel</h4>
                            <span class="text-xs bg-teal-200 text-teal-800 px-2 py-0.5 rounded font-mono">Git OK</span>
                        </div>
                        <p class="text-xs text-stone-600 mb-2"><strong>Primario:</strong> Arte 3D / Texturas</p>
                        <p class="text-xs text-stone-500"><strong>Secundario:</strong> Concept Art & UI</p>
                    </div>

                    <!-- Javi -->
                    <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-stone-950">Javi</h4>
                            <span class="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded font-semibold animate-pulse">Pendiente</span>
                        </div>
                        <p class="text-xs text-stone-700 mb-2"><strong>Primario:</strong> Level Design / Audio</p>
                        <p class="text-xs text-stone-600"><strong>Secundario:</strong> Q&A & Narrativa</p>
                        <div class="mt-2 text-[10px] text-red-700"><i class="fa-solid fa-circle-info"></i> Debe crear cuenta Git y unirse.</div>
                    </div>

                    <!-- Dídac -->
                    <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-stone-950">Dídac</h4>
                            <span class="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded font-semibold animate-pulse">Pendiente</span>
                        </div>
                        <p class="text-xs text-stone-700 mb-2"><strong>Primario:</strong> Modelado 3D / Props</p>
                        <p class="text-xs text-stone-600"><strong>Secundario:</strong> Integración Audio & SFX</p>
                        <div class="mt-2 text-[10px] text-red-700"><i class="fa-solid fa-circle-info"></i> Debe crear cuenta Git y unirse.</div>
                    </div>
                </div>
            </div>

            <!-- Software Stack & Systems -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Software requisites -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
                    <h3 class="text-lg font-bold text-stone-800 mb-4"><i class="fa-solid fa-layer-group"></i> Stack de Software Obligatorio</h3>
                    <div class="space-y-4 text-sm text-stone-700">
                        <div class="flex items-start gap-3">
                            <div class="bg-orange-100 text-orange-700 p-2 rounded"><i class="fa-solid fa-cube text-xl"></i></div>
                            <div>
                                <h4 class="font-semibold">Blender (¡Un "Must" absoluto!)</h4>
                                <p class="text-xs text-stone-500">Toda la producción de modelado, UVs y rigging pasará obligatoriamente por Blender para mantener compatibilidad.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <div class="bg-blue-100 text-blue-700 p-2 rounded"><i class="fa-solid fa-headphones text-xl"></i></div>
                            <div>
                                <h4 class="font-semibold">Audacity</h4>
                                <p class="text-xs text-stone-500">Edición rápida de sonido para efectos, locuciones o loops de música.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <div class="bg-purple-100 text-purple-700 p-2 rounded"><i class="fa-solid fa-palette text-xl"></i></div>
                            <div>
                                <h4 class="font-semibold">Krita y GIMP</h4>
                                <p class="text-xs text-stone-500">Krita para concept art y UI; GIMP para el tratamiento rápido y manipulación de texturas 2D.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <div class="bg-amber-100 text-amber-700 p-2 rounded"><i class="fa-solid fa-robot text-xl"></i></div>
                            <div>
                                <h4 class="font-semibold">Manifestación de IA</h4>
                                <p class="text-xs text-stone-500">Aquellos integrantes que decidan o deseen incorporar flujos de IA en sus roles específicos deben manifestarse en la próxima sesión para coordinar accesos y reglas.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Arch Linux and systems easter egg / guide -->
                <div class="bg-stone-800 text-stone-200 p-6 rounded-xl shadow-sm border border-stone-900 flex flex-col justify-between">
                    <div>
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-bold text-teal-400"><i class="fa-solid fa-terminal"></i> El Rincón del Capo: Axel & CachyOS (Arch)</h3>
                            <span class="text-xs bg-teal-900 text-teal-200 px-2 py-1 rounded font-mono">neofetch</span>
                        </div>
                        <p class="text-sm text-stone-300 leading-relaxed mb-4">
                            Mientras que el resto del equipo usará Windows con <strong>TortoiseSVN</strong> para una integración visual fácil en el explorador de archivos, Axel opera en la élite con <strong>CachyOS</strong> (Kernel optimizado basado en Arch). No se lo tengamos en cuenta, ¡al contrario, es nuestro colchón de infraestructura!
                        </p>
                        <div class="bg-stone-950 p-4 rounded-lg font-mono text-xs text-teal-300 mb-4 border border-teal-900">
                            <p class="text-stone-500"># Instalar cliente SVN y GUI recomendada para Arch</p>
                            <p>$ sudo pacman -S subversion</p>
                            <p class="text-stone-500"># GUI similar a Tortoise (RabbitVCS con Nemo/Nautilus)</p>
                            <p>$ yay -S rabbitvcs-nemo rabbitvcs-cli</p>
                        </div>
                    </div>
                    <div class="p-3 bg-stone-900 rounded border-l-4 border-l-teal-500 text-xs text-stone-400">
                        <strong>Nota de soporte:</strong> Para mantener la armonía, todas las rutas del SVN utilizarán nombres de archivo sin espacios ni tildes para evitar conflictos de sistema entre Windows y Arch Linux.
                    </div>
                </div>
            </div>

            <!-- Jules Bot Info -->
            <div class="mt-8 bg-teal-900 text-white p-6 rounded-xl shadow-sm">
                <div class="flex items-center gap-3 mb-2">
                    <span class="text-2xl">🤖</span>
                    <h3 class="text-lg font-bold">Jules: El Motor de Automatización de la Organización</h3>
                </div>
                <p class="text-sm text-teal-100 mb-4">
                    Jules es nuestro bot de automatización para gestionar el despliegue del portfolio de la organización en <span class="font-mono bg-teal-950 px-2 py-0.5 rounded text-white">hypenosys.github.io</span>. Para que Jules pueda operar adecuadamente con las cuentas del equipo, es crucial contar con su GitHub asociado a un Gmail.
                </p>
                <div class="p-4 bg-teal-950 rounded-lg text-xs font-mono border border-teal-800">
                    Todos los integrantes podrán gestionar push/pull requests a cualquier repositorio de la organización "con la punta del cipotete" una vez las identidades queden debidamente configuradas y autorizadas.
                </div>
            </div>
        </section>

        <!-- VIEW: PIPELINE -->
        <section id="view-pipeline" class="view-section hidden fade-in">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-stone-800 mb-2">Pipeline de Producción y Bloqueos</h2>
                <p class="text-stone-600 max-w-3xl">
                    Tener claras las tareas críticas es la diferencia entre terminar un juego o abandonar a los dos meses. Aquí se detalla cómo avanza el juego en orden lógico de bloqueos.
                </p>
            </div>

            <!-- Pipeline phases roadmap -->
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
                <div class="bg-white p-5 rounded-xl shadow-sm border border-stone-200">
                    <span class="text-xs font-bold text-teal-600">PASO 0 (Inmediato)</span>
                    <h4 class="font-bold text-stone-800 mb-2">Instalar y Configurar</h4>
                    <p class="text-xs text-stone-600">Creación de cuentas, instalación de Unreal Engine, Blender, Audacity y TortoiseSVN en equipos locales.</p>
                </div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-stone-200">
                    <span class="text-xs font-bold text-amber-500">PASO 1</span>
                    <h4 class="font-bold text-stone-800 mb-2">Ideación & GDD</h4>
                    <p class="text-xs text-stone-600">Lluvia de ideas conjunta. Redacción del GDD (pilares, mecánicas, alcance). Cierre de la preproducción.</p>
                </div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-stone-200">
                    <span class="text-xs font-bold text-blue-600">PASO 2</span>
                    <h4 class="font-bold text-stone-800 mb-2">Greyboxing + Arte</h4>
                    <p class="text-xs text-stone-600">Diseñadores crean el juego con cubos y cilindros grises. Mientras, el equipo de arte produce modelos 3D y audio como locos.</p>
                </div>
                <div class="bg-white p-5 rounded-xl shadow-sm border border-stone-200">
                    <span class="text-xs font-bold text-purple-600">PASO 3</span>
                    <h4 class="font-bold text-stone-800 mb-2">Vestido de Escena</h4>
                    <p class="text-xs text-stone-600">Los programadores se retiran del nivel principal. El equipo de arte reemplaza las cajas grises por los modelos definitivos.</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- AI and Concept Rules -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 flex flex-col justify-between">
                    <div>
                        <h3 class="text-lg font-bold text-stone-800 mb-3"><i class="fa-solid fa-ban text-red-500"></i> Políticas de Inteligencia Artificial</h3>
                        <p class="text-sm text-stone-600 mb-4">
                            Para mantener la coherencia y el alma de nuestro videojuego, establecemos políticas estrictas sobre el uso de inteligencias artificiales generativas:
                        </p>
                        <div class="space-y-3 mb-4">
                            <div class="p-3 bg-red-50 border-l-4 border-l-red-500 rounded text-xs">
                                <strong class="text-red-800 block">PROHIBIDO: ChatGPT para Diseño</strong>
                                <p class="text-stone-700">No utilizaremos ChatGPT para escribir mecánicas, sistemas de juego ni para estructurar el GDD. El diseño debe nacer de la sinergia y discusión del equipo los domingos.</p>
                            </div>
                            <div class="p-3 bg-red-50 border-l-4 border-l-red-500 rounded text-xs">
                                <strong class="text-red-800 block">PROHIBIDO: Gemini para Imágenes</strong>
                                <p class="text-stone-700">Está tajantemente prohibido usar Gemini para generar imágenes o material artístico del juego.</p>
                            </div>
                            <div class="p-3 bg-teal-50 border-l-4 border-l-teal-500 rounded text-xs">
                                <strong class="text-teal-800 block">PERMITIDO: Búsquedas & Lógica</strong>
                                <p class="text-stone-700">Claude para refinar diseño y programación a punta pala. Gemini + Perplexity para búsquedas profundas. NotebookLM para crear bibliotecas de conocimiento interconectadas.</p>
                            </div>
                            <div class="p-3 bg-teal-50 border-l-4 border-l-teal-500 rounded text-xs">
                                <strong class="text-teal-800 block">PERMITIDO: Leonardo.ai sin marcas de agua</strong>
                                <p class="text-stone-700">El equipo de arte puede utilizar Leonardo.ai o ChatGPT para generar imágenes de concepto limpias sin marcas de agua para el documento de referencias estéticas.</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-4 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
                        <strong>Flujo de Concepto:</strong> Lluvia de ideas inicial -> El equipo de arte busca referencias estéticas reales de otros videojuegos -> Generación de un documento unificado de Concept Art & Referencias para mantener un único estilo visual.
                    </div>
                </div>

                <!-- Procedural Generation (Alex & Axel) -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
                    <h3 class="text-lg font-bold text-stone-800 mb-3"><i class="fa-solid fa-code text-teal-600"></i> Pipeline Procedural</h3>
                    <p class="text-sm text-stone-600 mb-4">
                        <strong>Alex y Axel</strong> formarán la vanguardia técnica del proyecto. Se encargarán de diseñar un pipeline para la generación procedimental de elementos que ahorre trabajo manual al equipo:
                    </p>
                    <ul class="space-y-3 text-xs text-stone-700">
                        <li class="p-3 bg-stone-50 rounded border border-stone-200">
                            <strong>1. Spawners de Objetos:</strong> Creación de algoritmos para sembrar rocas, árboles y props creados por el equipo en la escena basada en parámetros físicos o de terreno.
                        </li>
                        <li class="p-3 bg-stone-50 rounded border border-stone-200">
                            <strong>2. Generación de Layouts:</strong> Sistemas lógicos para instanciar habitaciones, pasillos o biomas de forma automática en Unreal Engine.
                        </li>
                        <li class="p-3 bg-stone-50 rounded border border-stone-200">
                            <strong>3. Testing & Feedback:</strong> Al final de cada iteración, proveer herramientas para que el resto pueda ajustar la aleatoriedad sin tocar código de programación.
                        </li>
                    </ul>
                </div>

                <!-- Blockings & Backup system -->
                <div class="bg-stone-900 text-stone-100 p-6 rounded-xl shadow-sm border border-stone-950 flex flex-col justify-between">
                    <div>
                        <h3 class="text-lg font-bold text-amber-400 mb-3"><i class="fa-solid fa-shield-halved"></i> Sistema Anti-Bloqueos</h3>
                        <p class="text-sm text-stone-300 mb-4">
                            Si alguien se encalla en el desarrollo de un asset o blueprint, todo el proyecto puede verse perjudicado. Para mitigar esto implementaremos un sistema de apoyo obligatorio:
                        </p>
                        <div class="space-y-3 text-xs">
                            <div class="p-3 bg-stone-800 rounded border border-stone-700">
                                <strong>Responsable Primario (Owner):</strong> El encargado principal de llevar la tarea a término. Si ve que no llega, debe levantar la mano el sábado por Discord.
                            </div>
                            <div class="p-3 bg-stone-800 rounded border border-stone-700">
                                <strong>Apoyo Secundario (Backup):</strong> Un miembro del equipo asignado explícitamente a esa tarea para ayudar a desatascar problemas, resolver dudas técnicas o aportar assets de emergencia.
                            </div>
                        </div>
                    </div>
                    <div class="mt-4 p-3 bg-teal-950 text-teal-200 rounded border border-teal-800 text-xs text-center font-bold">
                        <i class="fa-solid fa-bullhorn text-amber-400 animate-bounce"></i> Transparencia de Comunicación: "Me he visto tal vídeo de YouTube [Enlace] para hacer tal cosa."
                    </div>
                </div>
            </div>
        </section>

        <!-- VIEW: UNREAL FAB -->
        <section id="view-unreal-fab" class="view-section hidden fade-in">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-stone-800 mb-2">Unreal Engine & Ecosistema Fab Store</h2>
                <p class="text-stone-600 max-w-3xl">
                    Epic Games ha unificado todos sus marketplaces (Megascans, Unreal Marketplace, Sketchfab, ArtStation) bajo una única gran plataforma: <strong>Fab</strong>. Es nuestro mayor aliado de recursos, pero requiere orden.
                </p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <!-- Fab guide -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 lg:col-span-2">
                    <h3 class="text-lg font-bold text-stone-800 mb-4"><i class="fa-solid fa-store text-teal-600"></i> Importación Limpia desde la Tienda Fab</h3>
                    <p class="text-sm text-stone-600 mb-4">
                        El error típico de los principiantes es arrastrar gigabytes de assets de Fab directamente al proyecto de Unreal, ensuciando el control de versiones (SVN). Seguiremos este flujo inquebrantable:
                    </p>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div class="p-4 bg-stone-50 border border-stone-200 rounded-lg">
                            <div class="font-bold text-stone-800 mb-1">1. Descarga Local</div>
                            <p class="text-stone-600">Descarga los packs de Fab en un proyecto de pruebas o carpeta temporal fuera del SVN principal.</p>
                        </div>
                        <div class="p-4 bg-stone-50 border border-stone-200 rounded-lg">
                            <div class="font-bold text-stone-800 mb-1">2. Limpieza de Assets</div>
                            <p class="text-stone-600">Elimina niveles de demostración, texturas duplicadas y assets innecesarios de alta resolución que consuman espacio.</p>
                        </div>
                        <div class="p-4 bg-stone-50 border border-stone-200 rounded-lg">
                            <div class="font-bold text-teal-700 mb-1">3. Migración Oficial</div>
                            <p class="text-stone-600">Migra únicamente los assets filtrados al SVN usando la opción "Migrar" de Unreal para mantener las dependencias.</p>
                        </div>
                    </div>

                    <div class="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                        <strong>¡Regla de Oro!</strong> Nunca subas plugins pesados de Fab al SVN a menos que sea coordinado. Cada integrante debe tener los plugins instalados directamente en el motor localmente.
                    </div>
                </div>

                <!-- Unreal configuration details -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 flex flex-col justify-between">
                    <div>
                        <h3 class="text-lg font-bold text-stone-800 mb-3"><i class="fa-solid fa-gears"></i> Sincronización de Unreal con SVN</h3>
                        <p class="text-xs text-stone-600 mb-4">
                            Para evitar que dos personas editen el mismo archivo a la vez (por ejemplo, el mapa principal o un blueprint de personaje), configuramos el sistema de <strong>Locks (Bloqueos)</strong> en Unreal:
                        </p>
                        <ul class="space-y-2 text-xs text-stone-700">
                            <li><i class="fa-solid fa-circle text-teal-600 text-[8px]"></i> <strong>Needs Lock:</strong> Todo archivo binario (.umap, .uasset) requiere de un bloqueo antes de poder modificarlo.</li>
                            <li><i class="fa-solid fa-circle text-teal-600 text-[8px]"></i> <strong>Ignorar carpetas:</strong> Evitar subir carpetas temporales locales de Unreal en SVN (ver sección de Repos).</li>
                        </ul>
                    </div>
                    <div class="p-3 bg-stone-100 rounded text-xs text-stone-600">
                        <strong>Comprobación semanal:</strong> Cada domingo limpiaremos los "locks" olvidados del servidor de SVN para que nadie se quede con archivos secuestrados durante la semana.
                    </div>
                </div>
            </div>
        </section>

        <!-- VIEW: REPOS -->
        <section id="view-repos" class="view-section hidden fade-in">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-stone-800 mb-2">Git, SVN & Repositorios de Trabajo</h2>
                <p class="text-stone-600 max-w-3xl">
                    La clave del éxito reside en dividir el contenido: la documentación oficial y los scripts ágiles van a **Git**, mientras que los cambios pesados de Unreal Engine y el arte 3D van al servidor centralizado **SVN**.
                </p>
            </div>

            <!-- Warning about dangerous repositories -->
            <div class="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-4 mb-8 text-sm">
                <div class="text-red-600 text-3xl"><i class="fa-solid fa-radiation animate-bounce"></i></div>
                <div>
                    <strong class="text-red-900">Advertencia para el equipo:</strong> Los issues en el repositorio de la app de producción son de naturaleza altamente caótica y compleja. Se aconseja entrar con extrema precaución para no quemarse la cabeza antes de empezar.
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <!-- Repos links with custom styles -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 lg:col-span-2">
                    <h3 class="text-lg font-bold text-stone-800 mb-4"><i class="fa-brands fa-github text-stone-800"></i> Acceso Directo a los Repositorios Oficiales</h3>
                    
                    <div class="space-y-4">
                        <a href="https://github.com/hypenosys/scripts" target="_blank" class="block p-4 bg-stone-50 hover:bg-teal-50 border border-stone-200 rounded-lg transition">
                            <div class="flex justify-between items-center mb-1">
                                <span class="font-bold text-stone-800 text-sm"><i class="fa-solid fa-users-viewfinder"></i> hypenosys/scripts</span>
                                <span class="text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded font-mono">Programación</span>
                            </div>
                            <p class="text-xs text-stone-600">Repositorio de programación dedicado a scripts para la generación procedural de personajes de forma aleatoria.</p>
                        </a>

                        <a href="https://github.com/hypenosys/blueprints" target="_blank" class="block p-4 bg-stone-50 hover:bg-teal-50 border border-stone-200 rounded-lg transition">
                            <div class="flex justify-between items-center mb-1">
                                <span class="font-bold text-stone-800 text-sm"><i class="fa-solid fa-folder-tree"></i> hypenosys/blueprints</span>
                                <span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">Archivo definitivo</span>
                            </div>
                            <p class="text-xs text-stone-600">Repositorio archivo para almacenar y documentar aquellas Blueprints definitivas, limpias y listas para reutilizar.</p>
                        </a>

                        <a href="https://github.com/hypenosys/app/issues" target="_blank" class="block p-4 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition">
                            <div class="flex justify-between items-center mb-1">
                                <span class="font-bold text-red-950 text-sm"><i class="fa-solid fa-skull-crossbones"></i> hypenosys/app/issues</span>
                                <span class="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded font-mono">Infierno Técnico</span>
                            </div>
                            <p class="text-xs text-stone-600">El tablón de las pesadillas. Registro de bugs críticos del motor e integraciones complejas.</p>
                        </a>
                    </div>
                </div>

                <!-- Git vs SVN differences -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 flex flex-col justify-between">
                    <div>
                        <h3 class="text-lg font-bold text-stone-800 mb-3"><i class="fa-solid fa-circle-nodes text-teal-600"></i> Reparto de Contenido</h3>
                        <p class="text-xs text-stone-600 mb-4">
                            Dividir correctamente dónde va cada elemento salva el proyecto de la corrupción de datos y de las velocidades lentas de red:
                        </p>
                        <div class="space-y-3">
                            <div class="p-3 bg-teal-50 rounded text-xs">
                                <strong class="text-teal-800 block">Sube a Git:</strong>
                                Documentación (.md), actas dominicales, scripts externos de Python/C++, y la configuración del servidor web.
                            </div>
                            <div class="p-3 bg-amber-50 rounded text-xs">
                                <strong class="text-amber-800 block">Sube a SVN:</strong>
                                Mapas (.umap), lógicas binarias (.uasset), texturas (.png/tga), modelos (.fbx/obj), archivos de audio (.wav) y assets del proyecto local de Unreal Engine.
                            </div>
                        </div>
                    </div>
                    <p class="text-[10px] text-stone-500 mt-4">Toda coordinación de tareas se llevará en una herramienta estilo **HacknPlan** para visibilidad total de las tareas del equipo.</p>
                </div>
            </div>
        </section>

        <!-- VIEW: RITUAL DOMINGO -->
        <section id="view-ritual" class="view-section hidden fade-in">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-stone-800 mb-2">⚡ El Ritual del Domingo: Sincronización Crítica</h2>
                <p class="text-stone-600 max-w-3xl">
                    Cada domingo por la mañana, el equipo se reúne para alinear la visión, destruir bloqueos técnicos y repartir la carga de la semana entrante. Este es el corazón operativo de Hypenosys.
                </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="bg-stone-900 text-stone-100 p-6 rounded-xl border-l-4 border-l-teal-500 shadow-sm">
                    <h3 class="text-lg font-bold mb-3"><i class="fa-solid fa-satellite-dish text-teal-400"></i> 1. El Púlpito (15 min)</h3>
                    <p class="text-xs text-stone-400 leading-relaxed">
                        Cada miembro realiza una demo visual rápida de sus avances. No vale con "he hecho código", hay que mostrar resultados tangibles en el motor o assets terminados.
                    </p>
                </div>
                <div class="bg-stone-900 text-stone-100 p-6 rounded-xl border-l-4 border-l-amber-500 shadow-sm">
                    <h3 class="text-lg font-bold mb-3"><i class="fa-solid fa-screwdriver-wrench text-amber-400"></i> 2. La Forja (30 min)</h3>
                    <p class="text-xs text-stone-400 leading-relaxed">
                        Resolución de dudas técnicas complejas. Axel y Alex actúan como consultores senior para desatascar problemas de Git, SVN o lógica de Blueprints.
                    </p>
                </div>
                <div class="bg-stone-900 text-stone-100 p-6 rounded-xl border-l-4 border-l-purple-500 shadow-sm">
                    <h3 class="text-lg font-bold mb-3"><i class="fa-solid fa-list-check text-purple-400"></i> 3. El Reparto (15 min)</h3>
                    <p class="text-xs text-stone-400 leading-relaxed">
                        Asignación de tareas en el Kanban. Definimos el "Sprint de 7 días". Nadie sale de la reunión sin saber exactamente qué tiene que entregar el próximo domingo.
                    </p>
                </div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
                <h3 class="text-lg font-bold text-stone-800 mb-4"><i class="fa-solid fa-calendar-day text-teal-600"></i> Próxima Sesión Ritual</h3>
                <div class="flex flex-col md:flex-row items-center gap-6">
                    <div class="bg-stone-100 p-4 rounded-lg text-center min-w-[120px]">
                        <span class="block text-xs uppercase font-bold text-stone-500">Próximo</span>
                        <span class="block text-3xl font-black text-stone-800">DOM</span>
                        <span class="block text-xs font-mono text-teal-700">10:00 AM</span>
                    </div>
                    <div class="flex-grow">
                        <h4 class="font-bold text-stone-800 mb-2">Objetivo Principal: Cierre de Infraestructura</h4>
                        <ul class="text-xs text-stone-600 space-y-2">
                            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-teal-500"></i> Verificación de cuentas Git de Javi y Dídac.</li>
                            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-teal-500"></i> Test de stress del servidor SVN con assets pesados.</li>
                            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-teal-500"></i> Primera lluvia de ideas para el pilar narrativo del GDD.</li>
                        </ul>
                    </div>
                    <div class="w-full md:w-auto">
                        <button class="w-full bg-stone-800 text-white px-6 py-3 rounded-lg font-bold hover:bg-stone-700 transition shadow-md flex items-center justify-center gap-2">
                            <i class="fa-brands fa-discord"></i> Unirse al Canal de Voz
                        </button>
                    </div>
                </div>
            </div>
        </section>

        <!-- VIEW: CHANGELOGS -->
        <section id="view-changelogs" class="view-section hidden fade-in">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-stone-800 mb-2">Registros de Cambios (Changelogs)</h2>
                <p class="text-stone-600 max-w-3xl">
                    Para evitar ruido de comunicación y sobrecarga de información, dividimos estrictamente los changelogs en tres áreas. Registra cualquier cambio en la interfaz interactiva para simular el comportamiento de nuestro repositorio Markdown en Git.
                </p>
            </div>

            <!-- Simulator Tool -->
            <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-8">
                <h3 class="text-lg font-bold text-stone-800 mb-4"><i class="fa-solid fa-plus text-teal-600"></i> Registrar Cambio en el Repositorio de Documentación</h3>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label class="block text-xs font-semibold text-stone-600 mb-1">Autor</label>
                        <select id="change-author" class="w-full bg-stone-50 border border-stone-300 rounded p-2 text-xs">
                            <option value="Alex">Alex</option>
                            <option value="Axel">Axel</option>
                            <option value="Mitxel">Mitxel</option>
                            <option value="Javi">Javi</option>
                            <option value="Dídac">Dídac</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-stone-600 mb-1">Changelog</label>
                        <select id="change-category" class="w-full bg-stone-50 border border-stone-300 rounded p-2 text-xs">
                            <option value="programacion">🛠️ Programación</option>
                            <option value="arte">🎨 Arte 3D/Audio</option>
                            <option value="diseno">📐 Diseño & GDD</option>
                        </select>
                    </div>
                    <div class="md:col-span-2 flex gap-2">
                        <div class="flex-grow">
                            <label class="block text-xs font-semibold text-stone-600 mb-1">Descripción del Cambio</label>
                            <input id="change-desc" type="text" placeholder="Ej: Implementada lógica inicial de generación procedural..." class="w-full bg-stone-50 border border-stone-300 rounded p-2 text-xs">
                        </div>
                        <button onclick="addChangelogEntry()" class="bg-teal-700 hover:bg-teal-800 text-white font-bold px-4 py-2 rounded text-xs self-end h-[34px]"><i class="fa-solid fa-save"></i> Registrar</button>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- Programacion -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 border-t-4 border-t-sky-500">
                    <h3 class="text-lg font-bold text-sky-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-code"></i> Programación</h3>
                    <div id="log-programacion" class="space-y-3 max-h-96 overflow-y-auto pr-2">
                        <div class="bg-stone-50 p-3 rounded text-xs">
                            <span class="block text-[10px] text-stone-500 font-mono">Alex - Inicial</span>
                            <p class="font-medium text-stone-700">Subidos los primeros templates de generación de caracteres aleatorios en /scripts.</p>
                        </div>
                    </div>
                </div>

                <!-- Arte -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 border-t-4 border-t-fuchsia-500">
                    <h3 class="text-lg font-bold text-fuchsia-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-palette"></i> Arte & Audio</h3>
                    <div id="log-arte" class="space-y-3 max-h-96 overflow-y-auto pr-2">
                        <div class="bg-stone-50 p-3 rounded text-xs">
                            <span class="block text-[10px] text-stone-500 font-mono">Mitxel - Inicial</span>
                            <p class="font-medium text-stone-700">Consolidado el moodboard estético inicial con referencias de juegos clave en el Git.</p>
                        </div>
                    </div>
                </div>

                <!-- Diseño -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 border-t-4 border-t-emerald-500">
                    <h3 class="text-lg font-bold text-emerald-800 mb-4 flex items-center gap-2"><i class="fa-solid fa-compass"></i> Diseño & GDD</h3>
                    <div id="log-diseno" class="space-y-3 max-h-96 overflow-y-auto pr-2">
                        <div class="bg-stone-50 p-3 rounded text-xs">
                            <span class="block text-[10px] text-stone-500 font-mono">Líder - Inicial</span>
                            <p class="font-medium text-stone-700">Creada la estructura básica Markdown para el GDD de la preproducción.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

    </main>

    <footer class="bg-stone-900 text-stone-400 py-6 text-center text-xs mt-auto">
        <p>Documento Técnico de Arranque - Organización Hypenosys - Todos los derechos reservados.</p>
    </footer>

    <!-- JavaScript Logic -->
    <script>
        // --- Navigation Logic ---
        function navigate(viewId) {
            // Update buttons
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.remove('active', 'bg-teal-700', 'text-white', 'border-teal-700');
                btn.classList.add('text-stone-700', 'border-stone-300');
            });
            const activeBtn = document.getElementById('btn-' + viewId);
            activeBtn.classList.remove('text-stone-700', 'border-stone-300');
            activeBtn.classList.add('active');

            // Update views
            document.querySelectorAll('.view-section').forEach(view => {
                view.classList.add('hidden');
            });
            document.getElementById('view-' + viewId).classList.remove('hidden');

            // Render charts if viewing specific tabs to handle canvas sizing correctly
            if(viewId === 'resumen' && !chartsRendered.resumen) renderResumenCharts();
        }

        // --- Simulated Changelog Logic ---
        function addChangelogEntry() {
            const author = document.getElementById('change-author').value;
            const category = document.getElementById('change-category').value;
            const desc = document.getElementById('change-desc').value;

            if(!desc.trim()) {
                alert("Por favor, escribe una descripción.");
                return;
            }

            const targetDiv = document.getElementById('log-' + category);
            const entry = document.createElement('div');
            entry.className = "bg-stone-50 p-3 rounded text-xs border border-teal-200 fade-in";
            
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            entry.innerHTML = `
                <span class="block text-[10px] text-stone-500 font-mono">${author} - Hoy ${timestamp}</span>
                <p class="font-medium text-stone-700">${desc}</p>
            `;

            targetDiv.insertBefore(entry, targetDiv.firstChild);
            document.getElementById('change-desc').value = ""; // Reset
        }

        // --- Chart.js Implementation ---
        let chartsRendered = { resumen: false };
        Chart.defaults.color = '#78716c'; // stone-500
        Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

        function renderResumenCharts() {
            const ctxPlan = document.getElementById('effortChart').getContext('2d');
            new Chart(ctxPlan, {
                type: 'bar',
                data: {
                    labels: ['Fase 0: Infraestructura', 'Fase 1: Ideación & GDD', 'Fase 2: Greyboxing & Arte', 'Fase 3: Decoración/Vestido'],
                    datasets: [{
                        label: 'Esfuerzo Estimado (%)',
                        data: [20, 25, 40, 15],
                        backgroundColor: [
                            'rgba(239, 68, 68, 0.7)',  // red
                            'rgba(15, 118, 110, 0.7)', // teal
                            'rgba(217, 119, 6, 0.7)',  // amber
                            'rgba(147, 51, 234, 0.7)'  // purple
                        ],
                        borderColor: [
                            'rgb(239, 68, 68)',
                            'rgb(15, 118, 110)',
                            'rgb(217, 119, 6)',
                            'rgb(147, 51, 234)'
                        ],
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y', // Horizontal bar
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { beginAtZero: true, max: 100 }
                    }
                }
            });
            chartsRendered.resumen = true;
        }

        // Initialize first view on load
        window.addEventListener('DOMContentLoaded', () => {
            renderResumenCharts();
        });

    </script>
</body>
