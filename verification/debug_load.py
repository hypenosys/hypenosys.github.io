import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()
        print("Navigating to Jules Panel...")
        await page.goto("http://localhost:4000/jules-panel/", timeout=60000)
        await page.wait_for_timeout(5000)
        await page.screenshot(path="verification/initial_load_debug.png")
        print("Screenshot saved to verification/initial_load_debug.png")

        # Check for elements
        html = await page.content()
        with open("verification/page_content.html", "w") as f:
            f.write(html)
        print("HTML content saved to verification/page_content.html")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
