# Palette's Journal - Micro-UX & Accessibility Learnings

## 2026-10-30 - Interactive Quick-Nav Cards Accessibility
**Learning:** Interactive `<div>` elements used as cards (like category quick-links in documentation) are invisible to keyboard navigation unless given `role="button"`, `tabindex="0"`, focus indicators, and keydown listeners for Enter/Space keys.
**Action:** Always convert interactive card divs into keyboard-focusable controls with proper ARIA attributes, keydown handlers, and visible focus rings.
