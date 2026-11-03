const { test, expect } = require('playwright/test');
const fs = require('node:fs');
const path = require('node:path');

// Use the real renderer and stylesheet without authentication or provider calls.
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`message selection stays inside the bubble at ${viewport.width}px and 130% zoom`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.route('http://neural.test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>
            body { margin: 0; background: #282a36; color: #f8f8f2; font: 14px sans-serif; zoom: 1.3; }
            #chat-messages { padding: 12px; }
            .flex { display: flex; } .justify-end { justify-content: flex-end; }
            .justify-start { justify-content: flex-start; } .relative { position: relative; }
            .absolute { position: absolute; } .-bottom-3 { bottom: -12px; } .right-4 { right: 16px; }
            .message-bubble { max-width: 85%; padding: 16px; box-sizing: border-box; }
            .mb-4 { margin-bottom: 16px; } .prose { overflow-wrap: anywhere; }
        </style>${fs.readFileSync(path.join(__dirname, '../_includes/neural-chat-styles.html'), 'utf8')}
        </head><body><main id="claude-main-interface"><div id="neural-selected-message-count"></div>
        <div id="welcome-screen"></div><div id="chat-messages"></div></main></body></html>` }));
        await page.goto('http://neural.test/');
        await page.addScriptTag({ path: path.join(__dirname, '../assets/javascript/neural-chat-core.js') });
        await page.addScriptTag({ path: path.join(__dirname, '../assets/javascript/neural-chat-ui.js') });
        await page.evaluate(() => {
            window.escapeHtml = window.NeuralChatCore.escapeHtml;
            window.sessions = [{ id: 'task-900009', messages: [
                { role: 'user', content: 'Tarea #900009\n\n' + 'Verificar PR, CI y estado de tarea.\n'.repeat(12) },
                { role: 'assistant', content: 'Respuesta de Claude\n\nPrimero verificamos el estado del PR y sus comprobaciones.' }
            ] }];
            window.currentSessionId = 'task-900009';
            window.chatMessages = document.getElementById('chat-messages');
            window.renderMessages();
        });
        const checks = page.getByRole('checkbox', { name: 'Seleccionar mensaje' });
        await checks.nth(0).check();
        await expect(page.locator('#neural-selected-message-count')).toHaveText('1 mensajes seleccionados');
        await page.evaluate(() => window.renderMessages());
        await expect(checks.nth(0)).toBeChecked();

        // Moving across the old hover boundary must leave controls fully visible.
        for (const point of [[0, 0], [viewport.width - 5, viewport.height - 5], [20, 20]]) {
            await page.mouse.move(...point);
            const controls = await page.locator('.neural-message-actions').evaluateAll(actions => actions.map(action => {
                const box = action.getBoundingClientRect();
                const bubble = action.closest('.message-bubble').getBoundingClientRect();
                const checkbox = action.querySelector('input');
                return {
                    inside: box.top >= bubble.top && box.bottom <= bubble.bottom && box.left >= bubble.left && box.right <= bubble.right,
                    opacity: getComputedStyle(action).opacity,
                    position: getComputedStyle(action).position,
                    checkboxOpacity: getComputedStyle(checkbox).opacity
                };
            }));
            for (const control of controls) {
                expect(control.inside).toBe(true);
                expect(control.opacity).toBe('1');
                expect(control.position).toBe('static');
                expect(control.checkboxOpacity).toBe('1');
            }
        }
        await page.screenshot({ path: testInfo.outputPath('message-actions.png'), fullPage: true });
    });
}
