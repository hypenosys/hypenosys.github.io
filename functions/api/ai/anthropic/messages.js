/**
 * Same-origin BYOK streaming relay to Claude Messages API.
 * Fixed upstream host and route (not a generic fetch proxy).
 * The provided user key only lives in this request and is never persisted.
 */
export async function onRequestPost({ request }) {
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
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return new Response('Expected JSON', { status: 415 });
  }
  const sizeHeader = Number(request.headers.get('content-length') || 0);
  if (sizeHeader > 1048576) return new Response('Request too large', { status: 413 });

  let body;
  try {
    const text = await request.text();
    if (text.length > 1048576) return new Response('Request too large', { status: 413 });
    body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        typeof body.model !== 'string' || !body.model || body.model.length > 200 ||
        !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 200 ||
        !Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 65536) {
      throw new Error('invalid');
    }
  } catch {
    return Response.json({ error: { type: 'invalid_request_error', message: 'Payload de mensajes inválido.' } },
      { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const headers = new Headers({
    'Authorization': authorization,
    'anthropic-version': '2026-10-21',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  });
  const workspaceId = request.headers.get('anthropic-workspace-id');
  if (workspaceId) {
    if (!/^wrkspc_[A-Za-z0-9_-]{4,128}$/.test(workspaceId)) return new Response('Invalid workspace ID', { status: 400 });
    headers.set('anthropic-workspace-id', workspaceId);
  }
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, body: JSON.stringify(body), redirect: 'error'
    });
    const out = new Headers({
      'Content-Type': upstream.headers.get('content-type') || (body.stream ? 'text/event-stream' : 'application/json'),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    for (const name of ['retry-after', 'request-id']) {
      if (upstream.headers.has(name)) out.set(name, upstream.headers.get(name));
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return Response.json({ error: { type: 'upstream_error', message: 'No se pudo contactar con Anthropic desde Cloudflare.' } },
      { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
