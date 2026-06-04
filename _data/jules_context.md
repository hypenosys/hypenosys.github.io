# Hypenosys — Contexto para Jules
Stack: Jekyll + GitHub Pages. Bootstrap 4.6 + Tailwind CSS. jQuery 3.6. JS ES6+.
Tema visual: Dracula (bg #282a36, fg #f8f8f2, purple #bd93f9, green #50fa7b, cyan #8be9fd, red #ff5555, yellow #f1fa8c).
Auth: GitHub OAuth via Cloudflare Worker gatekeeper. Token en sessionStorage ('gh_access_token') o localStorage ('github_token').
Persistencia: github-api.js con atomicWrite. MAX_RETRIES=4. Conflictos 409 gestionados.
NO usar frameworks adicionales. NO introducir dependencias npm. Solo vanilla JS + las librerías ya declaradas en _includes/head.html.
