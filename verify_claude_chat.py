import asyncio
import json
import time
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 390, 'height': 844})
        page = await context.new_page()

        # Step 1: Go to claude-chat.html and mock state
        await page.goto('http://localhost:4000/chat/neural/')

        # Mock GitHub API and User
        await page.evaluate("""() => {
            window.githubApi = { user: { login: 'testuser', avatar_url: '' }, getAuthToken: () => 'mock-token' };
            sessionStorage.setItem('gh_access_token', 'mock-token');

            // Create a session so loadSession is called
            const session = {
                id: 'session_test',
                title: 'Test Session',
                messages: [],
                systemPrompt: '',
                createdAt: new Date().toISOString()
            };
            localStorage.setItem('claude_chat_sessions', JSON.stringify([session]));
        }""")

        # Create a task context
        task = {
            "id": "12345",
            "title": "Large Task " + "A" * 500,
            "descripcion": "Large Desc " + "B" * 500,
            "estado": "Pending",
            "prioridad": "Major",
            "rama": "feature/test-branch"
        }

        await page.evaluate("""(task) => {
            localStorage.setItem('hy_neural_active', 'true');
            localStorage.setItem('hy_neural_task_context', JSON.stringify(task));
            window.location.reload();
        }""", task)

        # Re-mock after reload
        await page.evaluate("""() => {
            window.githubApi = { user: { login: 'testuser', avatar_url: '' }, getAuthToken: () => 'mock-token' };
        }""")

        await page.wait_for_selector('#task-context-banner', timeout=10000)
        print("Task loaded in Claude Chat.")
        await page.screenshot(path='claude_chat_task.png')
        print("Screenshot saved: claude_chat_task.png")

        # Simulate "Enviar a Jules"
        # We need a pending text for confirmSendToJules
        await page.evaluate("_pendingJulesText = 'Test Claude Response'")

        print("Executing confirmSendToJules()...")
        await page.evaluate("confirmSendToJules()")

        # Step 2: Wait for Jules Panel to load and pre-fill
        await page.wait_for_url('**/jules-panel/', timeout=10000)
        print("Redirected to Jules Panel V2.")

        # Re-mock for Jules Panel
        await page.evaluate("""() => {
            window.githubApi = { user: { login: 'testuser', avatar_url: '' }, getAuthToken: () => 'mock-token' };
            window.githubContext = { getRepos: async () => [] };
            window.taskOps = { getAllTasks: async () => [] };
        }""")

        try:
            await page.wait_for_selector('#v2-task-title', timeout=10000)
            banner_title = await page.inner_text('#v2-task-title')
            print(f"Banner Title found in V2: {banner_title[:100]}...")

            if "Large Task" in banner_title:
                print("SUCCESS: Large Task correctly handed off to Jules Panel V2 via localStorage.")
            else:
                print("FAILURE: Task NOT pre-filled correctly.")
        except Exception as e:
            print(f"Error finding banner title in V2: {e}")

        # Step 3: Verify localStorage key is gone
        handoff = await page.evaluate("localStorage.getItem('hy_jules_handoff')")
        if handoff is None:
            print("SUCCESS: localStorage key 'hy_jules_handoff' was cleared.")
        else:
            print(f"FAILURE: localStorage key 'hy_jules_handoff' STILL EXISTS.")

        await page.screenshot(path='jules_panel_v2_prefilled_mobile.png')
        print("Screenshot saved: jules_panel_v2_prefilled_mobile.png")

        await browser.close()

if __name__ == '__main__':
    asyncio.run(run())
