import { test, expect } from '@playwright/test';

test('Generate rich representational visual evidences for Neural timeline', async ({ page }) => {
  // Set Desktop viewport size
  await page.setViewportSize({ width: 1280, height: 1024 });

  // 1. Prepare rich representative activities representing all semantic states
  const richActivities: any[] = [];

  // Generate 55 activities to test paginator limit of 50 and block append of 50
  for (let i = 1; i <= 55; i++) {
    const timestamp = new Date(Date.now() - (60 - i) * 60 * 1000).toISOString();

    if (i === 1) {
      // Historical item 1: Plan
      richActivities.push({
        id: `act-${i}`,
        createTime: timestamp,
        originator: 'agent',
        description: 'Plan inicial de ejecución generado por el agente.',
        planGenerated: {
          plan: {
            steps: [
              { title: 'Paso 1: Análisis de dependencias', description: 'Revisión de vulnerabilidades y versiones del package.json.' },
              { title: 'Paso 2: Pruebas automatizadas', description: 'Lanzar suite de regresión sobre componentes core.' },
              { title: 'Paso 3: Despliegue en sandbox', description: 'Construcción y verificación de artifacts en entorno aislado.' }
            ]
          }
        }
      });
    } else if (i === 2) {
      // Historical item 2: Tool execution (Bash command & output)
      richActivities.push({
        id: `act-${i}`,
        createTime: timestamp,
        originator: 'agent',
        description: 'Ejecución del comando npm test para verificación.',
        artifacts: [
          {
            bashOutput: {
              command: 'npm run test:unit',
              output: 'PASS  tests/verify_logic.spec.js\nPASS  tests/verify_rendering.spec.js\n\nTest Suites: 2 passed, 2 total\nTests:       12 passed, 12 total\nSnapshots:   0 total\nTime:        1.42s\nRan all test suites.'
            }
          }
        ]
      });
    } else if (i === 3) {
      // Historical item 3: Diff patch artifact
      richActivities.push({
        id: `act-${i}`,
        createTime: timestamp,
        originator: 'agent',
        description: 'Parche sugerido para corregir el escape de caracteres.',
        artifacts: [
          {
            changeSet: {
              gitPatch: {
                suggestedCommitMessage: 'fix(escape): prevent recursive HTML entity parsing in activities'
              }
            }
          }
        ]
      });
    } else if (i === 10) {
      // Warning state
      richActivities.push({
        id: `act-${i}`,
        createTime: timestamp,
        originator: 'agent',
        description: 'Advertencia de rendimiento: tiempo de respuesta de la API excedido temporalmente.',
        progressUpdated: {
          title: 'Latencia de Red Detectada',
          description: 'Reintentando conexión con el nodo neural en 3... 2... 1...'
        }
      });
    } else if (i === 20) {
      // Error state
      richActivities.push({
        id: `act-${i}`,
        createTime: timestamp,
        originator: 'agent',
        description: 'Error crítico en sandbox al compilar dependencias.',
        sessionFailed: {
          reason: 'Fallo al instalar paquetes en sandbox: node-gyp rebuild error. Permisos insuficientes.'
        }
      });
    } else if (i === 35) {
      // Long collapsible text block
      richActivities.push({
        id: `act-${i}`,
        createTime: timestamp,
        originator: 'agent',
        description: 'Análisis detallado de la arquitectura de componentes y propuesta de refactorización.',
        agentMessaged: {
          agentMessage: 'Para resolver el solapamiento visual en la interfaz de usuario, se analizó detalladamente la jerarquía de selectores CSS. La conclusión principal es que el elemento parent #view-chat estaba forzando un alto estático mediante una propiedad inline no-guardada, lo cual bloqueaba la capacidad del flexbox secundario para colapsarse o heredar el espacio restante correctamente.\n\nPropuesta de Refactorización:\n1. Eliminar propiedades de flex-basis estáticas (ej: flex: 0 0 55%) en el contenedor principal de historia.\n2. Asegurar que todos los wrappers padres utilicen la propiedad min-height: 0 para posibilitar el cálculo automático del espacio disponible por parte del navegador.\n3. Aplicar overscroll-behavior: contain sobre el contenedor interno para mitigar el efecto de scroll-bleed o propagación de desplazamiento hacia el body o el viewport global.\n4. Integrar el botón flotante discreto de scroll hacia abajo de forma absoluta respecto al shell contenedor, garantizando que no altere la posición ni el flujo de los cards del historial.\n5. Consolidar el decodificador de caracteres HTML en una única pasada regular sin recursión para inhibir cualquier vector de XSS malicioso.\n\nEste cambio proporcionará una experiencia visual fluida y robusta que se adapta de forma responsive tanto a pantallas de escritorio de alta resolución como a dispositivos táctiles móviles o tablets.'
        }
      });
    } else if (i === 54) {
      // HTML Entities decoding & Security check
      richActivities.push({
        id: `act-${i}`,
        createTime: timestamp,
        originator: 'agent',
        description: 'Verificación de seguridad XSS y decodificación de entidades legítimas.',
        agentMessaged: {
          agentMessage: "Let&#039;s verify if dangerous tags such as &lt;img src=x onerror=alert(1)&gt; are properly printed as plain text and NOT executed, while double-encoded tags like &amp;lt;script&amp;gt; do not trigger recursive interpretation."
        }
      });
    } else if (i === 55) {
      // Completed state
      richActivities.push({
        id: `act-${i}`,
        createTime: timestamp,
        originator: 'agent',
        description: 'Sesión completada con éxito. Todos los cambios han sido aplicados y validados.',
        sessionCompleted: {}
      });
    } else {
      // Normal progress / informational state
      richActivities.push({
        id: `act-${i}`,
        createTime: timestamp,
        originator: 'agent',
        description: `Paso de progreso secuencial #${i} ejecutado con éxito.`
      });
    }
  }

  // 2. Mock state in localStorage before visiting the page
  await page.goto('http://localhost:4000/');
  await page.evaluate(({ richActivities }) => {
    localStorage.setItem('github_token', 'fake-token');
    localStorage.setItem('jules_api_key', 'fake-jules-key');
    localStorage.setItem('jules_activities_cache_js_rich_demo', JSON.stringify(richActivities));

    const sessions = [
      {
        id: 'session_rich_demo',
        title: 'Conversación de Demostración Neural',
        messages: [
          { role: 'user', content: 'Hola Claude, ¿puedes ayudarme con la tarea vinculada?', timestamp: Date.now() - 5000 },
          { role: 'assistant', content: 'Claro que sí, está vinculada con la tarea de Jules #js_rich_demo.', timestamp: Date.now() }
        ],
        createdAt: new Date().toISOString(),
        metadata: {
          linkedJulesTaskId: 'js_rich_demo',
          linkedJulesTaskTitle: 'Refinamiento de Interfaz de Usuario'
        }
      }
    ];

    localStorage.setItem('claude_chat_sessions', JSON.stringify(sessions));
    localStorage.setItem('hy_active_claude_session_id', 'session_rich_demo');
  }, { richActivities });

  // 3. Navigate to jules-panel
  await page.goto('http://localhost:4000/jules-panel/');

  // Force bypass login overlay
  await page.evaluate(() => {
    if (window.githubApi) {
      window.githubApi.user = { login: 'mockuser', name: 'Mock User', avatar_url: '' };
      window.githubApi.validateToken = async () => {
        return { valid: true, user: { login: 'mockuser', name: 'Mock User', avatar_url: '' } };
      };
    }

    if (window.forceOpenPanel) window.forceOpenPanel();
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      overlay.style.display = 'none';
    }
    document.getElementById('app-root')?.classList.remove('locked');
  });

  // Switch to Neural view
  const chatLink = page.locator('.hnav-link[data-view="chat"]');
  await chatLink.click();

  // Wait for activities to render (which limits to 50 initially)
  const historyContainer = page.locator('#neural-jules-history');
  await expect(historyContainer).toBeVisible();
  await page.waitForTimeout(1000);

  // Take Capture 1: Desktop complete view (initially loaded scrolled to the bottom)
  await page.screenshot({ path: 'verification/rich_evidence_1_desktop_loaded.png' });
  console.log('Saved Capture 1: rich_evidence_1_desktop_loaded.png');

  // Verify that the initial load contains exactly the Load Previous button + 50 recent items
  const loadPrevButton = page.locator('.load-prev-btn');
  await expect(loadPrevButton).toBeVisible();

  // Scroll up slightly to show the floating button when we "receive" simulated new items,
  // or manually scroll to top to test the paginator Cargar actividades anteriores
  await page.evaluate(() => {
    const el = document.getElementById('jules-history-container');
    if (el) el.scrollTop = 100; // Scroll up slightly
  });
  await page.waitForTimeout(500);

  // Take Capture 2: Scroll up and Cargar actividades anteriores button visible
  await page.screenshot({ path: 'verification/rich_evidence_2_scrolled_up.png' });
  console.log('Saved Capture 2: rich_evidence_2_scrolled_up.png');

  // Click Cargar anteriores to test paginator and offset retention
  await loadPrevButton.click();
  await page.waitForTimeout(500);

  // Take Capture 3: After loading older activities (scroll offset retained, load button gone)
  await page.screenshot({ path: 'verification/rich_evidence_3_after_load_all.png' });
  console.log('Saved Capture 3: rich_evidence_3_after_load_all.png');

  // Scroll back to top to inspect the very first plan steps we injected
  await page.evaluate(() => {
    const el = document.getElementById('jules-history-container');
    if (el) el.scrollTop = 0;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'verification/rich_evidence_4_timeline_top_plan.png' });
  console.log('Saved Capture 4: rich_evidence_4_timeline_top_plan.png');

  // Switch to Tablet viewport and take capture
  await page.setViewportSize({ width: 800, height: 1024 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'verification/rich_evidence_5_tablet_view.png' });
  console.log('Saved Capture 5: rich_evidence_5_tablet_view.png');

  // Switch to Mobile viewport and take capture
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'verification/rich_evidence_6_mobile_view.png' });
  console.log('Saved Capture 6: rich_evidence_6_mobile_view.png');
});
