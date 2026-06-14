import asyncio
import json
import time
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 390, 'height': 844})
        page = await context.new_page()

        # Mock GitHub Token
        await page.goto('http://localhost:4000/jules-panel-v2/')
        await page.evaluate("sessionStorage.setItem('gh_access_token', 'mock-token')")

        task = {
            "id": "12345",
            "title": "Task with very long description " + "A" * 500,
            "descripcion": "This is a very long description " + "B" * 500,
            "estado": "Pending",
            "prioridad": "Major",
            "rama": "feature/test-branch"
        }

        print("Simulating handoff from Claude Chat...")
        await page.evaluate("""(task) => {
            localStorage.setItem('hy_jules_handoff', JSON.stringify({
                task: task,
                timestamp: Date.now(),
                source: 'claude-chat'
            }));
            window.location.reload();
        }""", task)

        # Step 2: Wait for Jules Panel to load and pre-fill
        print("Waiting for Jules Panel V2 to process handoff...")

        # We need to wait for the UI to reflect the handoff.
        # Since it redirects to 'chat' view, let's wait for that.
        try:
            await page.wait_for_selector('#v2-task-title', timeout=10000)
            banner_title = await page.inner_text('#v2-task-title')
            print(f"Banner Title found: {banner_title[:100]}...")

            if "Task with very long description" in banner_title:
                print("SUCCESS: Task correctly pre-filled from localStorage handoff.")
            else:
                print("FAILURE: Task NOT pre-filled correctly.")
        except Exception as e:
            print(f"Error finding banner title: {e}")

        # Step 3: Verify localStorage key is gone
        handoff = await page.evaluate("localStorage.getItem('hy_jules_handoff')")
        if handoff is None:
            print("SUCCESS: localStorage key 'hy_jules_handoff' was cleared.")
        else:
            print(f"FAILURE: localStorage key 'hy_jules_handoff' STILL EXISTS.")

        # Step 4: Screenshot
        await page.screenshot(path='jules_panel_prefilled.png')
        print("Screenshot saved: jules_panel_prefilled.png")

        # Step 5: Verify fallback to URL params
        print("\nVerifying fallback to URL params...")
        encoded_task = json.dumps(task)
        # Note: Large tasks in URL might still fail here due to WEBrick limit if I'm not careful,
        # but for verification of fallback logic I'll use a slightly smaller one if needed,
        # or just test that it works at all.
        await page.goto(f'http://localhost:4000/jules-panel-v2/?task_data={json.dumps({"id":"999","title":"URL Task"})}')

        try:
            await page.wait_for_selector('#v2-task-title', timeout=10000)
            banner_title = await page.inner_text('#v2-task-title')
            if "URL Task" in banner_title:
                print("SUCCESS: Fallback to URL params still works.")
            else:
                print(f"FAILURE: Fallback to URL params yielded: {banner_title}")
        except Exception as e:
            print(f"Error finding banner title for URL fallback: {e}")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
