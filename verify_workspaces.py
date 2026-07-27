import sys
from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Listen to console logs and page errors
        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err.message}"))

        # Intercept GitHub User validation request and return valid Axflc team member
        page.route("https://api.github.com/user", lambda route: route.fulfill(
            status=200,
            headers={"Content-Type": "application/json"},
            body='{"login": "axlfc", "name": "Axel"}'
        ))

        # 1. First, load the root domain so we can set localStorage on the correct origin
        page.goto("http://localhost:4000/")
        page.evaluate("""() => {
            localStorage.setItem('github_token', 'mock-token-123');
            localStorage.setItem('gh_access_token', 'mock-token-123');
            sessionStorage.setItem('gh_access_token', 'mock-token-123');

            // Clear contaminated caches
            localStorage.removeItem('hy_cache_tasks_personal');
            localStorage.removeItem('hy_cache_archive_personal');
            localStorage.removeItem('hy_cache_stats_personal');
            localStorage.removeItem('hy_cache_budget_personal');
            localStorage.removeItem('hy_personal_tasks');
        }""")

        # 2. Now navigate to dashboard.html
        page.goto("http://localhost:4000/dashboard.html")
        page.wait_for_timeout(4000)

        # Let's check if the login overlay is still there, and hide it if needed
        page.evaluate("""() => {
            const overlay = document.getElementById('login-overlay');
            if (overlay) overlay.classList.add('hidden');

            const unauth = document.getElementById('unauthorized-overlay');
            if (unauth) unauth.classList.add('hidden');
        }""")

        # 3. Wait for the workspace menu button to appear
        page.wait_for_selector("#workspace-menu-button", timeout=15000)

        # Take a baseline screenshot of the dashboard
        page.screenshot(path="verification_baseline.png")
        print("Baseline dashboard screenshot saved.")

        # 4. Click the workspace menu button to show the organizations dropdown
        page.click("#workspace-menu-button")
        page.wait_for_selector("#workspace-menu:not(.hidden)", timeout=5000)

        # Take a screenshot showing the workspace dropdown dropdown open
        page.screenshot(path="verification_dropdown.png")
        print("Workspace dropdown screenshot saved.")

        # 5. Switch to 'personal' (Kanban Personal)
        page.evaluate("() => switchWorkspace('personal')")
        page.wait_for_timeout(4000)

        # Again, bypass login-overlay if needed since reload is called
        page.evaluate("""() => {
            const overlay = document.getElementById('login-overlay');
            if (overlay) overlay.classList.add('hidden');
            const unauth = document.getElementById('unauthorized-overlay');
            if (unauth) unauth.classList.add('hidden');
        }""")

        # Verify our Import and Export buttons are visible
        export_btn = page.locator("button:has-text('Exportar')")
        import_btn = page.locator("button:has-text('Importar')")

        expect(export_btn).to_be_visible(timeout=10000)
        expect(import_btn).to_be_visible(timeout=10000)
        print("Local Kanban actions validated.")

        # Take final screenshot showing personal kanban and the buttons
        page.screenshot(path="verification_personal.png")
        print("Personal Kanban dashboard screenshot saved.")

        browser.close()

if __name__ == "__main__":
    run()
