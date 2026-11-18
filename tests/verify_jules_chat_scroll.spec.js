const { test, expect } = require('playwright/test');
const fs = require('node:fs');
const path = require('node:path');

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`Jules panel Claude chat preserves reading position at ${viewport.width}px and 130% zoom`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        const styles = fs.readFileSync(path.join(__dirname, '../_includes/neural-panel-workspace-styles.html'), 'utf8');
        await page.route('http://neural.test/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
            <html><head><style>
            body { margin: 0; background: #090a12; color: #e5e5f5; font: 14px sans-serif; zoom: 1.3; }
            #view-chat { height: 600px !important; display: flex; flex-direction: column; }
            #neural-claude-workspace { display: flex; flex: 1; flex-direction: column; overflow: hidden; min-height: 0; }
            #v2-chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
            </style>${styles}</head><body><div id="view-chat"><section id="neural-claude-workspace">
            <div id="v2-chat-messages"></div></section></div></body></html>` }));
        await page.goto('http://neural.test/');
        await page.addScriptTag({ path: path.join(__dirname, '../assets/javascript/neural-chat-core.js') });
        await page.addScriptTag({ path: path.join(__dirname, '../assets/javascript/jules-panel-neural.js') });
        await page.evaluate(() => {
            window.$ = id => document.getElementById(id);
            window.julesPanelSessions = [{ id: 'claude-task', messages: Array.from({ length: 30 }, (_, index) => ({
                role: index % 2 ? 'assistant' : 'user', content: 'Mensaje ' + index + '\n\n' + 'Detalle verificable del plan de Jules.\n'.repeat(4)
            })) }];
            window.currentJulesPanelSessionId = 'claude-task';
            window.renderChatV2Messages();
        });
        const chat = page.locator('#v2-chat-messages');
        await expect(chat).toContainText('Mensaje 29');
        expect(await chat.evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThan(2);
        await chat.evaluate(node => { node.scrollTop = 220; window.firstMessageNode = node.firstElementChild; });
        await page.evaluate(() => { for (let poll = 0; poll < 5; poll++) window.renderChatV2Messages(); });
        expect(await chat.evaluate(node => node.scrollTop)).toBeCloseTo(220, 0);
        expect(await chat.evaluate(node => node.firstElementChild === window.firstMessageNode)).toBe(true);

        // A new Jules/Claude message while reading must not pull the reader down.
        await page.evaluate(() => {
            window.julesPanelSessions[0].messages.push({ role: 'assistant', content: 'Nueva revisión del plan' });
            window.renderChatV2Messages();
        });
        expect(await chat.evaluate(node => node.scrollTop)).toBeCloseTo(220, 0);
        // Streaming deltas preserve reading position too.
        await page.evaluate(() => {
            window.julesPanelSessions[0].messages.at(-1).content += '\nValidación recibida';
            window.renderChatV2Messages();
        });
        expect(await chat.evaluate(node => node.scrollTop)).toBeCloseTo(220, 0);
        await page.screenshot({ path: testInfo.outputPath('reading-position.png'), fullPage: true });
        // Readers already at the bottom continue to follow the stream.
        await chat.evaluate(node => { node.scrollTop = node.scrollHeight; });
        await page.evaluate(() => {
            window.julesPanelSessions[0].messages.push({ role: 'assistant', content: 'Último mensaje' });
            window.renderChatV2Messages();
        });
        expect(await chat.evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThan(2);
    });
}
