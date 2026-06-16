import base64
from playwright.sync_api import sync_playwright

def verify_docs(page):
    page.route("https://api.github.com/repos/hypenosys/docs/git/trees/main?recursive=1", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body='{"tree": [{"path": "01-Lore/Manual.md", "type": "blob", "sha": "sha1"}]}'
    ))

    content_b64 = base64.b64encode(b"# Manual del Juego\n\n## Seccion 1\nContenido.").decode()
    page.route("https://api.github.com/repos/hypenosys/docs/contents/01-Lore/Manual.md", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=f'{{"name": "Manual.md", "path": "01-Lore/Manual.md", "type": "file", "content": "{content_b64}"}}'
    ))

    page.route("https://api.github.com/repos/hypenosys/docs/contents/", lambda route: route.fulfill(
        status=200, content_type="application/json",
        body='[{"name": "01-Lore", "path": "01-Lore", "type": "dir", "sha": "dir1"}]'
    ))

    page.route("https://api.github.com/repos/hypenosys/docs/contents/01-Lore", lambda route: route.fulfill(
        status=200, content_type="application/json",
        body='[{"name": "Manual.md", "path": "01-Lore/Manual.md", "type": "file", "sha": "sha1"}]'
    ))

    page.goto("http://localhost:8000/documentacion.html")
    page.wait_for_selector("#sidebar-content")
    page.wait_for_timeout(2000)

    # Take sidebar screenshot first
    page.screenshot(path="verification/sidebar_initial.png")

    page.evaluate("window.location.hash = '01-Lore/Manual.md'")
    page.wait_for_selector(".prose-dracula")
    page.wait_for_timeout(5000)

    page.screenshot(path="verification/docs_final_v2.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_docs(page)
        finally:
            browser.close()
