from playwright.sync_api import sync_playwright

def inspect_page(url, name):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))

        page.goto(url)
        page.wait_for_timeout(1500)

        auth_nav = page.locator("#auth-nav-container")
        user_status = page.locator("#user-status")
        mobile_auth = page.locator("#gh-mobile-auth")
        mobile_login = page.locator("#btn-sign-in-mobile")

        print(f"=== Page: {name} ({url}) ===")
        print(f"• #auth-nav-container count: {auth_nav.count()}")
        if auth_nav.count() > 0:
            print(f"  - innerHTML: {auth_nav.inner_html()[:200]}")
            print(f"  - is_visible: {auth_nav.is_visible()}")
        print(f"• #user-status count: {user_status.count()}")
        if user_status.count() > 0:
            print(f"  - innerHTML: {user_status.inner_html()[:200]}")
            print(f"  - is_visible: {user_status.is_visible()}")
        print(f"• #gh-mobile-auth count: {mobile_auth.count()}")
        if mobile_auth.count() > 0:
            print(f"  - innerHTML: {mobile_auth.inner_html()[:200]}")
            print(f"  - is_visible: {mobile_auth.is_visible()}")
        print(f"• Console errors: {errors}")
        browser.close()

if __name__ == "__main__":
    inspect_page("http://localhost:4000/", "Home")
    inspect_page("http://localhost:4000/dashboard.html", "Dashboard")
    inspect_page("http://localhost:4000/pages/claude-chat.html", "Neural Chat")
