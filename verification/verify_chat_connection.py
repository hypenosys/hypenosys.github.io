import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 800}
        )
        page = await context.new_page()

        # Inyectar mocks de API y localStorage
        await page.add_init_script("""
            localStorage.setItem('github_token', 'mock-token');
            localStorage.setItem('jules_api_key', 'mock-jules-key');
            localStorage.setItem('hy_ai_config', JSON.stringify({
                provider: 'anthropic',
                api_key: 'sk-mock-key',
                model: 'claude-3-sonnet'
            }));

            window.githubApi = {
                getAuthToken: () => 'mock-token',
                validateToken: () => Promise.resolve({valid: true, user: {login: 'testuser'}})
            };
        """)

        print("Navigating to Jules Panel...")
        try:
            await page.goto("http://localhost:4000/jules-panel/", timeout=60000)
            await page.wait_for_timeout(3000)

            # Si aparece el overlay de auth, intentar bypass
            if await page.locator("#auth-overlay").is_visible():
                print("Auth overlay visible, attempting bypass...")
                await page.click("button:has-text('Bypass')")
                await page.wait_for_timeout(2000)

            print("Switching to Chat tab...")
            # Intentar clickear tanto en el link de escritorio como en el de móvil si uno falla
            try:
                await page.click("#nav-chat", timeout=5000)
            except:
                await page.click("button[data-tab='chat']", timeout=5000)

            await page.wait_for_timeout(2000)

            # Verificar que el input de chat existe y es funcional
            chat_input = page.locator("#v2-chat-input")
            if await chat_input.is_visible():
                print("Chat input is visible.")
                await chat_input.fill("Test message to Claude")
                await page.wait_for_timeout(1000)

                # Verificar el switch de modo
                claude_opt = page.locator(".dual-send-option[data-mode='claude']")
                jules_opt = page.locator(".dual-send-option[data-mode='jules']")

                claude_class = await claude_opt.get_attribute('class')
                print(f"Claude mode active: {'active' in (claude_class or '')}")

                await jules_opt.click()
                await page.wait_for_timeout(1000)
                jules_class = await jules_opt.get_attribute('class')
                print(f"Jules mode active after click: {'active' in (jules_class or '')}")

                # Captura de pantalla
                await page.screenshot(path="verification/jules_panel_v2_chat_fix.png")
                print("Screenshot saved to verification/jules_panel_v2_chat_fix.png")
            else:
                print("ERROR: Chat input not found!")

            # Abrir modal de API
            print("Opening API modal...")
            await page.click("button:has-text('API Key')")
            await page.wait_for_timeout(2000)

            # Verificar que las pcards son clickeables
            pcard = page.locator(".pcard[data-prov='anthropic']")
            await pcard.click()
            print("Clicked Anthropic provider in modal.")

            await page.screenshot(path="verification/api_modal_fix.png")
            print("API Modal screenshot saved.")
        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="verification/error_screenshot.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
