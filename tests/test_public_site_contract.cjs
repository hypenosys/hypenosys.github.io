'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const index = read('index.html');
const nav = read('assets/javascript/global-header.js');
const privacy = read('privacidad.html');
const cookies = read('cookies.md');
const legal = read('aviso-legal.md');
const consent = read('assets/javascript/analytics-consent.js');
const css = read('assets/css/consent.css');
const headers = read('_headers');

assert.match(index, /<html lang="es">/, 'homepage language');
assert.match(index, /<main id="contenido"/, 'semantic main landmark');
assert.match(index, /<h1 id="hy-title"[^>]*>\s*<span class="sr-only">Hypenosys<\/span>/, 'accessible text heading');
assert.match(index, /id="mision"/);
assert.match(index, /id="proyectos"/);
assert.match(index, /id="documentacion"/);
for (const anchor of ['#mision', '#proyectos', '#documentacion']) {
  assert.ok(index.includes('href="' + anchor + '"'), 'homepage should link ' + anchor);
}
assert.match(index, /Convertir preguntas creativas y problemas técnicos en experimentos útiles/);
assert.match(index, /HAIS · Observatorio y simulación/);
assert.match(index, /THE MACHINE · Diseño conceptual/);
assert.match(index, /HOLD \/ NO-GO/);
assert.match(index, /no son equivalentes/);
assert.match(index, /github.com\/hypenosys\/the_machine/);
assert.match(index, /name="twitter:card"/);
assert.match(index, /property="og:image"/);
assert.match(index, /<link rel="canonical" href="https:\/\/hypenosys.com\/"/);
assert.match(nav, /gh-skip-link/);
assert.match(nav, /gh-nav-item:focus-within \.gh-dropdown-content/);
assert.match(nav, /<button type="button" class="gh-dropdown-toggle">Plataforma/);
assert.match(nav, /href="\/#mision"/);
assert.match(nav, /href="\/#proyectos"/);
assert.match(privacy, /El gestor de consentimiento está diseñado/);
assert.doesNotMatch(privacy, /no se envían datos antes de obtener tu consentimiento explícito/i);
assert.match(privacy, /inventario de flujos debe auditarse por separado/);
assert.match(cookies, /configuración real/);
assert.match(legal, /pendiente de evaluación jurídica|pendiente de determinar/);
assert.match(consent, /'hypenosys.com': '1'/);
assert.match(consent, /'dev.hypenosys.com': '2'/);
assert.match(consent, /if \(!MATOMO_SITE_ID\)/);
assert.match(consent, /_paq\.push\(\['requireConsent'\]\)/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /min-height: 44px;/);
assert.match(headers, /X-Content-Type-Options: nosniff/);
assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/);
console.log('Site mission, transparency, accessibility and privacy contract: OK');
