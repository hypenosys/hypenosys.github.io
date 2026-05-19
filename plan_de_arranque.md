<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plan Operativo: Estudio Indie (Fase 0)</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        /* Base styles and specific chart container requirements */
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f5f5f4; /* stone-100 - warm neutral */
            color: #292524; /* stone-800 */
        }
        
        .chart-container { 
            position: relative; 
            width: 100%; 
            max-width: 800px; 
            margin-left: auto; 
            margin-right: auto; 
            height: 300px; 
            max-height: 400px; 
        } 
        
        @media (min-width: 768px) { 
            .chart-container { 
                height: 350px; 
            } 
        }

        /* Custom scrollbar for inner content if needed */
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
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>

    <!-- Chosen Palette: Warm Neutrals (Stone) with Muted Teal accents for a calm, professional, and structured feel. -->
    
    <!-- Application Structure Plan: A dashboard-style SPA divided into 4 logical views: 'Resumen' (Overview of the whole plan and deliverables), 'Equipo & Método' (Human resources and Sunday workflows), 'Producción' (GDD and Pipeline research), and 'Tecnología' (SVN, Unreal, AI). This structure shifts the linear text into actionable, thematic hubs, making it easier for a team of beginners to digest complex technical and organizational concepts step-by-step. -->
    
    <!-- Visualization & Content Choices: 
         1. Report Info: Team of 5 (1 pro, 4 noobs) -> Goal: Visualize roles -> Viz: Doughnut Chart (Chart.js) -> Justification: Shows part-to-whole relationship of responsibilities. 
         2. Report Info: 9-step research plan -> Goal: Plan timeline/effort -> Viz: Horizontal Bar Chart (Chart.js) -> Justification: Helps estimate effort for Sunday meetings.
         3. Report Info: Pipeline & Deliverables -> Goal: Organize actionable items -> Viz: Interactive CSS/HTML Grid cards -> Justification: Text-heavy structural information needs clean formatting, not data charts.
         4. Report Info: SVN/AI Matrix -> Goal: Compare options -> Viz: Interactive HTML Table with JS highlight -> Justification: Allows quick comparison of text-based attributes.
         Confirming NO SVG/Mermaid used. -> Library: Chart.js and Vanilla DOM manipulation. -->
         
    <!-- CONFIRMATION: NO SVG graphics used. NO Mermaid JS used. -->
</head>
<body class="min-h-screen flex flex-col">

    <!-- Header -->
    <header class="bg-stone-900 text-stone-50 shadow-md p-6">
        <div class="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h1 class="text-3xl font-bold tracking-tight">Proyecto Indie: Plan de Arranque</h1>
                <p class="text-stone-400 mt-1">Guía operativa y de investigación para equipo de 5 personas.</p>
            </div>
            <div class="flex items-center gap-2 bg-stone-800 p-2 rounded-lg border border-stone-700">
                <span class="text-xl">⚙️</span>
                <span class="text-sm font-semibold tracking-wider text-stone-300 uppercase">Fase de Pre-producción</span>
            </div>
        </div>
    </header>

    <!-- Navigation -->
    <nav class="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex space-x-2 overflow-x-auto py-3 hide-scrollbar">
                <button onclick="navigate('resumen')" id="btn-resumen" class="nav-btn active whitespace-nowrap px-4 py-2 rounded-md border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors">📊 Resumen y Entregables</button>
                <button onclick="navigate('equipo')" id="btn-equipo" class="nav-btn whitespace-nowrap px-4 py-2 rounded-md border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors">👥 Equipo y Método</button>
                <button onclick="navigate('produccion')" id="btn-produccion" class="nav-btn whitespace-nowrap px-4 py-2 rounded-md border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors">🎮 GDD y Pipeline</button>
                <button onclick="navigate('tecnologia')" id="btn-tecnologia" class="nav-btn whitespace-nowrap px-4 py-2 rounded-md border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors">💻 Tecnología (SVN/Unreal)</button>
            </div>
        </div>
    </nav>

    <!-- Main Content Area -->
    <main class="flex-grow max-w-6xl mx-auto w-full p-4 sm:p-6 lg:p-8">

        <!-- VIEW: RESUMEN -->
        <section id="view-resumen" class="view-section fade-in">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-stone-800 mb-2">Visión General del Plan</h2>
                <p class="text-stone-600 max-w-3xl">
                    Esta sección consolida el plan de investigación en un mapa de ruta accionable. El objetivo principal no es solo recopilar teoría, sino generar tres <strong>entregables clave</strong> que sirvan como el "sistema operativo" del proyecto antes de escribir la primera línea de código o crear el primer asset.
                </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <!-- Entregables Cards -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 border-t-4 border-t-teal-600">
                    <div class="text-3xl mb-3">📝</div>
                    <h3 class="text-lg font-bold mb-2">Plantilla GDD</h3>
                    <p class="text-sm text-stone-600">Documento listo para rellenar con pilares de diseño, core loop, narrativa y alcance ajustado a 5 personas.</p>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 border-t-4 border-t-teal-600">
                    <div class="text-3xl mb-3">⚖️</div>
                    <h3 class="text-lg font-bold mb-2">Matriz de Decisión</h3>
                    <p class="text-sm text-stone-600">Herramienta para evaluar y seleccionar el hosting SVN ideal y las herramientas de IA más eficientes para el equipo.</p>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 border-t-4 border-t-teal-600">
                    <div class="text-3xl mb-3">📅</div>
                    <h3 class="text-lg font-bold mb-2">Calendario Producción</h3>
                    <p class="text-sm text-stone-600">Cronograma con hitos semanales (domingos) y mensuales, desde la preproducción hasta el vertical slice.</p>
                </div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
                <h3 class="text-lg font-bold mb-4">Estimación de Esfuerzo Investigativo (Bloques)</h3>
                <p class="text-sm text-stone-500 mb-4">Distribución sugerida del tiempo para abarcar los 9 puntos del plan de investigación propuesto.</p>
                <div class="chart-container">
                    <canvas id="planTimelineChart"></canvas>
                </div>
            </div>
        </section>

        <!-- VIEW: EQUIPO Y METODO -->
        <section id="view-equipo" class="view-section hidden fade-in">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-stone-800 mb-2">Organización y Método de Trabajo</h2>
                <p class="text-stone-600 max-w-3xl">
                    Con un equipo de 5 personas donde 4 son principiantes, la estructura es vital. Esta sección define cómo se repartirán los roles para evitar bloqueos y establece el ritmo del proyecto mediante reuniones dominicales altamente estructuradas.
                </p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Roles Chart -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 flex flex-col">
                    <h3 class="text-lg font-bold mb-2">Estructura Propuesta del Equipo</h3>
                    <p class="text-sm text-stone-500 mb-4">Roles primarios (interno) y apoyo transversal (externo) para evitar cuellos de botella.</p>
                    <div class="flex-grow flex items-center justify-center chart-container">
                        <canvas id="teamRolesChart"></canvas>
                    </div>
                </div>

                <!-- Reuniones Dominicales -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
                    <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                        <span class="text-xl">☕</span> Sistema Operativo Semanal (Domingos)
                    </h3>
                    <ul class="space-y-4">
                        <li class="flex items-start gap-3">
                            <div class="bg-stone-100 p-2 rounded text-stone-600 font-bold">1</div>
                            <div>
                                <h4 class="font-semibold text-stone-800">Revisión de Avances (15 min)</h4>
                                <p class="text-sm text-stone-600">Demostración visual de lo logrado en la semana. Qué funcionó y qué no.</p>
                            </div>
                        </li>
                        <li class="flex items-start gap-3">
                            <div class="bg-stone-100 p-2 rounded text-stone-600 font-bold">2</div>
                            <div>
                                <h4 class="font-semibold text-stone-800">Resolución de Bloqueos (20 min)</h4>
                                <p class="text-sm text-stone-600">El integrante con experiencia asiste directamente a los principiantes estancados.</p>
                            </div>
                        </li>
                        <li class="flex items-start gap-3">
                            <div class="bg-stone-100 p-2 rounded text-stone-600 font-bold">3</div>
                            <div>
                                <h4 class="font-semibold text-stone-800">Asignación de Tareas (15 min)</h4>
                                <p class="text-sm text-stone-600">Reparto en tablero Kanban (Trello/Jira). Tareas pequeñas, claras y realizables en 1 semana.</p>
                            </div>
                        </li>
                        <li class="flex items-start gap-3">
                            <div class="bg-teal-50 p-2 rounded text-teal-700 font-bold">4</div>
                            <div>
                                <h4 class="font-semibold text-teal-900">Cierre y Objetivos (10 min)</h4>
                                <p class="text-sm text-teal-700">Fijar un objetivo medible y realista para el próximo domingo. Registro de decisiones.</p>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </section>

        <!-- VIEW: PRODUCCION Y GDD -->
        <section id="view-produccion" class="view-section hidden fade-in">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-stone-800 mb-2">Diseño de Juego y Pipeline</h2>
                <p class="text-stone-600 max-w-3xl">
                    Antes de abrir Unreal, el equipo necesita saber qué va a construir y en qué orden. Aquí se estructura la investigación sobre cómo documentar el juego (GDD) y cómo dividir su desarrollo en fases manejables (Pipeline) para no perder la motivación.
                </p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- GDD Column -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 lg:col-span-1">
                    <h3 class="text-lg font-bold mb-4 border-b pb-2">Foco del GDD Accionable</h3>
                    <div class="space-y-3 text-sm text-stone-700">
                        <p><strong>1. Alcance Realista:</strong> Adaptado estrictamente a 5 personas a tiempo parcial.</p>
                        <p><strong>2. Core Loop:</strong> Definir el bucle jugable principal en 1 párrafo.</p>
                        <p><strong>3. Pilares de Diseño:</strong> 3 reglas inquebrantables que guían todas las decisiones.</p>
                        <p><strong>4. IA en Ideación:</strong> Uso de IA para brainstorming de mecánicas, no para diseñar el juego entero.</p>
                        <div class="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                            <strong>Riesgo:</strong> Evitar crear un GDD de 50 páginas teóricas. Debe ser una wiki viva o un documento ágil.
                        </div>
                    </div>
                </div>

                <!-- Pipeline Column -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 lg:col-span-2">
                    <h3 class="text-lg font-bold mb-4">Pipeline de Producción Indie</h3>
                    <p class="text-sm text-stone-500 mb-6">Haz clic en cada fase para ver sus entregables e hitos.</p>
                    
                    <div class="flex flex-col md:flex-row gap-2 mb-6">
                        <button onclick="showPipeline('pre')" class="flex-1 py-2 px-2 bg-stone-100 hover:bg-teal-50 border border-stone-300 rounded text-sm font-semibold transition">1. Pre-producción</button>
                        <button onclick="showPipeline('proto')" class="flex-1 py-2 px-2 bg-stone-100 hover:bg-teal-50 border border-stone-300 rounded text-sm font-semibold transition">2. Prototipo/VS</button>
                        <button onclick="showPipeline('prod')" class="flex-1 py-2 px-2 bg-stone-100 hover:bg-teal-50 border border-stone-300 rounded text-sm font-semibold transition">3. Producción (Alpha)</button>
                    </div>

                    <div id="pipeline-content" class="min-h-[150px] p-5 bg-stone-50 rounded-lg border border-stone-200">
                        <h4 class="font-bold text-lg text-teal-800 mb-2">Selecciona una fase</h4>
                        <p class="text-stone-600">Explora los objetivos, responsables y riesgos de cada etapa del pipeline estructurado.</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- VIEW: TECNOLOGIA -->
        <section id="view-tecnologia" class="view-section hidden fade-in">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-stone-800 mb-2">Infraestructura, Motor y Herramientas</h2>
                <p class="text-stone-600 max-w-3xl">
                    El pilar técnico del proyecto. Configurar mal el control de versiones con archivos binarios de Unreal es el fin de muchos proyectos indie. Esta sección cubre la investigación de SVN, la guía de onboarding y la evaluación de herramientas IA.
                </p>
            </div>

            <!-- Tabs internas para Tecnología -->
            <div class="flex space-x-2 mb-6 border-b border-stone-200 pb-2">
                <button onclick="techTab('svn')" id="tab-svn" class="tech-tab active px-3 py-1 text-sm font-bold text-teal-700 border-b-2 border-teal-700">SVN & Unreal</button>
                <button onclick="techTab('ai')" id="tab-ai" class="tech-tab px-3 py-1 text-sm font-bold text-stone-500 hover:text-stone-800">Matriz Herramientas IA</button>
            </div>

            <!-- Tab Content: SVN -->
            <div id="content-svn" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
                    <h3 class="text-lg font-bold mb-3 flex items-center gap-2"><span class="text-xl">🗄️</span> Estrategia SVN</h3>
                    <ul class="space-y-3 text-sm text-stone-700">
                        <li><strong>Hosting:</strong> Investigar VPS (DigitalOcean/Linode) vs Hosting Gestionado (Assembla) vs Local.</li>
                        <li><strong>Unreal Specs:</strong> Archivos binarios (.uasset, .umap). Configuración crítica para ignorar carpetas DerivedDataCache, Intermediate, Saved.</li>
                        <li><strong>Locking:</strong> Obligatorio configurar "Needs Lock" en assets binarios para evitar conflictos irresolubles entre artistas.</li>
                    </ul>
                </div>
                <div class="bg-stone-800 text-stone-100 p-6 rounded-xl shadow-sm border border-stone-900">
                    <h3 class="text-lg font-bold mb-3 text-teal-400">Guía Novatos (Onboarding)</h3>
                    <p class="text-sm text-stone-300 mb-4">La documentación debe ser un manual a prueba de fallos. Conceptos a enseñar de forma visual:</p>
                    <div class="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div class="bg-stone-700 p-2 rounded">1. Checkout (Bajar)</div>
                        <div class="bg-stone-700 p-2 rounded">2. Update (Sincronizar)</div>
                        <div class="bg-stone-700 p-2 rounded border border-red-500">3. Get Lock (Bloquear)</div>
                        <div class="bg-stone-700 p-2 rounded text-teal-300">4. Commit (Subir)</div>
                    </div>
                </div>
            </div>

            <!-- Tab Content: AI -->
            <div id="content-ai" class="hidden">
                <div class="bg-white p-6 rounded-xl shadow-sm border border-stone-200 overflow-x-auto">
                    <h3 class="text-lg font-bold mb-4">Matriz de Decisión: Casos de Uso IA</h3>
                    <table class="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr class="bg-stone-100 text-stone-600 text-sm border-b-2 border-stone-300">
                                <th class="p-3">Caso de Uso</th>
                                <th class="p-3">Herramienta Potencial</th>
                                <th class="p-3">Curva de Aprendizaje</th>
                                <th class="p-3">Control/Calidad</th>
                                <th class="p-3">Riesgo para Principiantes</th>
                            </tr>
                        </thead>
                        <tbody class="text-sm">
                            <tr class="border-b border-stone-100 hover:bg-stone-50 transition">
                                <td class="p-3 font-semibold text-stone-800">Concept Art / Referencias</td>
                                <td class="p-3">Midjourney / DALL-E</td>
                                <td class="p-3"><span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Baja</span></td>
                                <td class="p-3">Medio</td>
                                <td class="p-3">Inconsistencia de estilo</td>
                            </tr>
                            <tr class="border-b border-stone-100 hover:bg-stone-50 transition">
                                <td class="p-3 font-semibold text-stone-800">Asistencia Programación</td>
                                <td class="p-3">GitHub Copilot / ChatGPT</td>
                                <td class="p-3"><span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">Media</span></td>
                                <td class="p-3">Alto (requiere revisión)</td>
                                <td class="p-3 text-red-600">Copiar código sin entender (Spaghetti code)</td>
                            </tr>
                            <tr class="border-b border-stone-100 hover:bg-stone-50 transition">
                                <td class="p-3 font-semibold text-stone-800">Ideación y Documentación</td>
                                <td class="p-3">Claude / ChatGPT</td>
                                <td class="p-3"><span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Baja</span></td>
                                <td class="p-3">Alto</td>
                                <td class="p-3">Textos genéricos o irreales</td>
                            </tr>
                            <tr class="border-b border-stone-100 hover:bg-stone-50 transition">
                                <td class="p-3 font-semibold text-stone-800">Generación Texturas/Assets</td>
                                <td class="p-3">Krea AI / Leonardo</td>
                                <td class="p-3"><span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">Media</span></td>
                                <td class="p-3">Medio-Bajo</td>
                                <td class="p-3">Problemas de topología / optimización</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

    </main>

    <footer class="bg-stone-900 text-stone-400 py-6 text-center text-sm mt-auto">
        <p>Documento Interactivo Generado - Planificación Inicial Equipo Indie</p>
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
            if(viewId === 'equipo' && !chartsRendered.equipo) renderEquipoCharts();
        }

        // --- Tech Sub-tabs Logic ---
        function techTab(tabId) {
            document.querySelectorAll('.tech-tab').forEach(tab => {
                tab.classList.remove('text-teal-700', 'border-b-2', 'border-teal-700');
                tab.classList.add('text-stone-500');
            });
            const activeTab = document.getElementById('tab-' + tabId);
            activeTab.classList.remove('text-stone-500');
            activeTab.classList.add('text-teal-700', 'border-b-2', 'border-teal-700');

            if(tabId === 'svn') {
                document.getElementById('content-svn').classList.remove('hidden');
                document.getElementById('content-ai').classList.add('hidden');
            } else {
                document.getElementById('content-ai').classList.remove('hidden');
                document.getElementById('content-svn').classList.add('hidden');
            }
        }

        // --- Pipeline Interactive Data ---
        const pipelineData = {
            pre: {
                title: "Fase 1: Pre-producción",
                color: "text-teal-700",
                content: "<strong>Objetivos:</strong> GDD cerrado, Concept Art clave, Pruebas de mecánicas aisladas.<br><strong>Entregable:</strong> Documento GDD y Matriz de herramientas aprobada.<br><strong>Riesgo:</strong> Quedarse atascado teorizando sin pasar al motor."
            },
            proto: {
                title: "Fase 2: Prototipado / Vertical Slice",
                color: "text-amber-700",
                content: "<strong>Objetivos:</strong> Construir el 'Core Loop' jugable. Un nivel pequeño que represente la calidad final.<br><strong>Entregable:</strong> Build ejecutable de 5 minutos de gameplay.<br><strong>Riesgo:</strong> Querer hacer demasiado; hay que centrarse solo en las mecánicas base."
            },
            prod: {
                title: "Fase 3: Producción (Camino a Alpha)",
                color: "text-blue-700",
                content: "<strong>Objetivos:</strong> Creación de contenido masivo basado en el Vertical Slice (niveles, assets, narrativa).<br><strong>Entregable:</strong> Juego jugable de principio a fin (Alpha), aunque falten texturas o haya bugs.<br><strong>Riesgo:</strong> Conflictos en SVN por archivos pesados, mala comunicación."
            }
        };

        function showPipeline(phase) {
            const container = document.getElementById('pipeline-content');
            const data = pipelineData[phase];
            container.innerHTML = `
                <h4 class="font-bold text-lg ${data.color} mb-2">${data.title}</h4>
                <p class="text-stone-700 text-sm leading-relaxed">${data.content}</p>
            `;
            // Visual effect
            container.classList.remove('fade-in');
            void container.offsetWidth; // trigger reflow
            container.classList.add('fade-in');
        }

        // --- Chart.js Implementations ---
        let chartsRendered = { resumen: false, equipo: false };
        
        // Common chart options for styling and responsiveness
        Chart.defaults.color = '#57534e'; // stone-500
        Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

        function renderResumenCharts() {
            const ctxPlan = document.getElementById('planTimelineChart').getContext('2d');
            new Chart(ctxPlan, {
                type: 'bar',
                data: {
                    labels: ['Definición & GDD', 'Setup Equipo', 'Setup SVN/Unreal', 'Investigación IA', 'Docs Onboarding'],
                    datasets: [{
                        label: 'Esfuerzo Relativo (Peso %)',
                        data: [25, 15, 30, 15, 15],
                        backgroundColor: [
                            'rgba(15, 118, 110, 0.7)', // teal
                            'rgba(217, 119, 6, 0.7)',  // amber
                            'rgba(3, 105, 161, 0.7)',  // sky
                            'rgba(147, 51, 234, 0.7)', // purple
                            'rgba(168, 162, 158, 0.7)' // stone
                        ],
                        borderColor: [
                            'rgb(15, 118, 110)',
                            'rgb(217, 119, 6)',
                            'rgb(3, 105, 161)',
                            'rgb(147, 51, 234)',
                            'rgb(120, 113, 108)'
                        ],
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y', // Horizontal bar chart
                    responsive: true,
                    maintainAspectRatio: false, // CRITICAL for chart-container logic
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.parsed.x + '% del esfuerzo inicial';
                                }
                            }
                        }
                    },
                    scales: {
                        x: { beginAtZero: true, max: 40, title: { display: true, text: 'Esfuerzo/Tiempo' } }
                    }
                }
            });
            chartsRendered.resumen = true;
        }

        function renderEquipoCharts() {
            const ctxRoles = document.getElementById('teamRolesChart').getContext('2d');
            new Chart(ctxRoles, {
                type: 'doughnut',
                data: {
                    labels: ['Programación (Core)', 'Arte 3D/2D (Core)', 'Diseño de Niveles', 'Líder / Productor', 'Generalista (QA/Narrativa)'],
                    datasets: [{
                        data: [1, 1, 1, 1, 1], // Represents the 5 members
                        backgroundColor: [
                            '#0284c7', // sky-600 (Code)
                            '#d946ef', // fuchsia-500 (Art)
                            '#10b981', // emerald-500 (Design)
                            '#f59e0b', // amber-500 (Lead)
                            '#64748b'  // slate-500 (Generalist)
                        ],
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        hoverOffset: 10
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // CRITICAL for chart-container logic
                    cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                usePointStyle: true,
                                padding: 20
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return ' 1 Persona (Rol Principal)';
                                }
                            }
                        }
                    }
                }
            });
            chartsRendered.equipo = true;
        }

        // Initialize first view on load
        window.addEventListener('DOMContentLoaded', () => {
            renderResumenCharts();
        });

    </script>
</body>
</html>
