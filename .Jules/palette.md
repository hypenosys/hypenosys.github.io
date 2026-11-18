## 2026-10-30 - Password Toggle Button Accessibility
**Learning:** Icon-only password visibility buttons in input groups require explicit initial `aria-label` and `aria-pressed` attributes, plus dynamic JavaScript state synchronization to effectively communicate state changes to screen readers.
**Action:** Always include `aria-label="Mostrar contraseña"` and `aria-pressed="false"` on password toggle buttons and update both attributes in JS visibility handlers.

## 2026-10-30 - Icon-Only Navigation Links and Modal Buttons Accessibility
**Learning:** Icon-only interactive elements in Jekyll includes (`nav_dashboard.html`, `neural_session_drawer.html`, `api_config_modal.html`, `profile_modal.html`) often rely on `data-title` or font icons, which are invisible to screen readers.
**Action:** Ensure every icon-only `<a>` or `<button>` tag in template includes has an explicit, localized `aria-label` matching its intended function.
