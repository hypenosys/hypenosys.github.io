from playwright.sync_api import sync_playwright

def verify_auth_block(page, url, name):
    page.goto(url)
    page.wait_for_timeout(1000)

    # Inject mock session for testing logged-in state
    page.evaluate("""
        localStorage.setItem('gh_access_token', 'mock-token');
        if (window.githubApi) {
            window.githubApi.user = { login: 'testuser', avatar_url: 'https://avatars.githubusercontent.com/u/123456?v=4' };
        }
        document.dispatchEvent(new CustomEvent('authReady', {
            detail: { user: { login: 'testuser', avatar_url: 'https://avatars.githubusercontent.com/u/123456?v=4' } }
        }));
    """)
    page.wait_for_timeout(1000)

    screenshot_path = f"/home/jules/verification/screenshots/auth_header_{name}.png"
    page.screenshot(path=screenshot_path)
    print(f"Verified {name} auth header screenshot saved: {screenshot_path}")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(record_video_dir="/home/jules/verification/videos")
        page = context.new_page()
        try:
            verify_auth_block(page, "http://localhost:4000/", "home")
            verify_auth_block(page, "http://localhost:4000/dashboard.html", "dashboard")
            verify_auth_block(page, "http://localhost:4000/pages/claude-chat.html", "neural")
        finally:
            context.close()
            browser.close()
