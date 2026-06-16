from playwright.sync_api import sync_playwright

def diagnose():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        # Mock GitHub API
        page.route("https://api.github.com/repos/hypenosys/docs/contents/", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body='[{"name": "01-Lore", "path": "01-Lore", "type": "dir", "sha": "dir1"}]'
        ))
        page.route("https://api.github.com/repos/hypenosys/docs/contents/01-Lore", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body='[{"name": "Manual.md", "path": "01-Lore/Manual.md", "type": "file", "sha": "sha1"}]'
        ))
        page.route("https://api.github.com/repos/hypenosys/docs/git/trees/main?recursive=1", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body='{"tree": [{"path": "01-Lore/Manual.md", "type": "blob", "sha": "sha1"}]}'
        ))
        page.route("https://api.github.com/repos/hypenosys/docs/contents/01-Lore/Manual.md", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body='{"name": "Manual.md", "path": "01-Lore/Manual.md", "type": "file", "content": "IyBNYW51YWw="}'
        ))

        page.goto("http://localhost:8000/documentacion.html#01-Lore/Manual.md")
        page.wait_for_timeout(2000)

        sidebar_content = page.inner_html("#sidebar-content")
        print(f"SIDEBAR HTML: {sidebar_content}")

        browser.close()

if __name__ == "__main__":
    diagnose()
