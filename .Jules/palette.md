## 2026-10-30 - Password Toggle Button Accessibility
**Learning:** Icon-only password visibility buttons in input groups require explicit initial `aria-label` and `aria-pressed` attributes, plus dynamic JavaScript state synchronization to effectively communicate state changes to screen readers.
**Action:** Always include `aria-label="Mostrar contraseña"` and `aria-pressed="false"` on password toggle buttons and update both attributes in JS visibility handlers.
