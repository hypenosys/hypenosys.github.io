/**
 * Same-origin BYOK relay for Anthropic model discovery.
 * The browser supplies its own key on each request; no key is stored in Cloudflare.
 * This function does not log request headers or response bodies.
 */
export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  const suppliedOrigin = request.headers.get('origin');
  if (suppliedOrigin && suppliedOrigin !== origin) {
    return new Response('Cross-origin requests are not allowed', { status: 403 });
  }

  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S{8,512}$/i.test(authorization)) {
    return Response.json({ error: { type: 'authentication_error', message: 'Falta la API key de Anthropic.' } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const original = new URL(request.url);
  const target = new URL('https://api.anthropic.com/v1/models');
  const limit = original.searchParams.get('limit') || '100';
  if (!/^\d{1,4}$/.test(limit) || Number(limit) < 1 || Number(limit) > 1000) {
    return Response.json({ error: { type: 'invalid_request_error', message: 'Limit inválido.' } }, { status: 400 });
  }
  target.searchParams.set('limit', limit);
  const afterId = original.searchParams.get('after_id');
  if (afterId) {
    if (afterId.length > 200) return new Response('Invalid cursor', { status: 400 });
    target.searchParams.set('after_id', afterId);
  }

  const upstreamHeaders = new Headers({
    'Authorization': authorization,
    'anthropic-version': '2026-10-21',
    'Accept': 'application/json'
  });
  const workspaceId = request.headers.get('anthropic-workspace-id');
  if (workspaceId) {
    if (!/^wrkspc_[A-Za-z0-9_-]{4,128}$/.test(workspaceId)) return new Response('Invalid workspace ID', { status: 400 });
    upstreamHeaders.set('anthropic-workspace-id', workspaceId);
  }

  try {
    // Cloudflare Workers does not implement redirect: 'error'; it throws a TypeError.
    // Use manual and reject redirects so credentials never follow a Location header.
    const upstream = await fetch(target, { method: 'GET', headers: upstreamHeaders, redirect: 'manual' });
    if (upstream.status >= 300 && upstream.status < 400) {
      return Response.json({ error: { type: 'upstream_redirect', message: 'Redirección inesperada desde Anthropic.' } },
        { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    for (const name of ['retry-after', 'request-id']) {
      if (upstream.headers.has(name)) headers.set(name, upstream.headers.get(name));
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: { type: 'upstream_error', message: 'No se pudo contactar con Anthropic desde Cloudflare.' } },
      { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
