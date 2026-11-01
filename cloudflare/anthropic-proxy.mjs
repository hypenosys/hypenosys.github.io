/**
 * Same-origin Anthropic API bridge for Cloudflare Pages Functions.
 * BYOK: caller supplies their own API key; this proxy never saves or logs it.
 * Only Anthropic /v1/models and /v1/messages are permitted. No arbitrary URLs.
 *
 * IMPORTANT: Browser localStorage is not a secure secret vault. This is a
 * user-supplied-key development bridge, not a shared production credential.
 */
const API_VERSION = '2026-10-21';
const UPSTREAM_ORIGIN = 'https://api.anthropic.com';
const MAX_MESSAGE_BYTES = 1024 * 1024;

function jsonError(status, code, message) {
  return new Response(JSON.stringify({ error: { type: code, message } }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function isSameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return false;
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
}

export async function proxyAnthropicRequest(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  const isModels = url.pathname === '/api/anthropic/models';
  const isMessages = url.pathname === '/api/anthropic/messages';
  if (!isModels && !isMessages) {
    return jsonError(404, 'not_found', 'Ruta no encontrada');
  }

  const requiredMethod = isModels ? 'GET' : 'POST';
  if (request.method !== requiredMethod) {
    return jsonError(405, 'method_not_allowed', 'Método no permitido');
  }
  if (!isSameOrigin(request, url)) {
    return jsonError(403, 'origin_denied', 'Se requiere una solicitud del mismo origen');
  }

  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer [^\s]+$/.test(authorization)) {
    return jsonError(401, 'authentication_error', 'Introduce una API key de Anthropic');
  }

  const outboundHeaders = new Headers({
    Authorization: authorization,
    'anthropic-version': API_VERSION,
    'accept': isModels ? 'application/json' : 'text/event-stream, application/json'
  });
  const workspace = request.headers.get('anthropic-workspace-id');
  if (workspace) {
    if (!/^wrkspc_[A-Za-z0-9_-]{8,128}$/.test(workspace)) {
      return jsonError(400, 'invalid_workspace', 'Workspace ID inválido');
    }
    outboundHeaders.set('anthropic-workspace-id', workspace);
  }

  const upstreamUrl = new URL(UPSTREAM_ORIGIN + (isModels ? '/v1/models' : '/v1/messages'));
  const init = { method: requiredMethod, headers: outboundHeaders, redirect: 'manual' };

  if (isModels) {
    for (const key of url.searchParams.keys()) {
      if (!['limit', 'after_id', 'before_id', 'lifecycle'].includes(key)) {
        return jsonError(400, 'invalid_parameter', 'Parámetro de catálogo no permitido');
      }
    }
    upstreamUrl.search = url.search;
  } else {
    if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
      return jsonError(415, 'invalid_content_type', 'Se requiere application/json');
    }
    const declaredSize = Number(request.headers.get('content-length') || 0);
    if (declaredSize > MAX_MESSAGE_BYTES) {
      return jsonError(413, 'request_too_large', 'Solicitud demasiado grande');
    }
    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_MESSAGE_BYTES) {
      return jsonError(413, 'request_too_large', 'Solicitud demasiado grande');
    }
    try {
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed.model !== 'string' || !Array.isArray(parsed.messages)) {
        return jsonError(400, 'invalid_request', 'Se requieren model y messages');
      }
    } catch {
      return jsonError(400, 'invalid_json', 'JSON inválido');
    }
    outboundHeaders.set('content-type', 'application/json');
    init.body = body;
  }

  try {
    const upstream = await fetchImpl(upstreamUrl.toString(), init);
    // Preserve SSE streaming end to end. Do not buffer or log the response body.
    const responseHeaders = new Headers({
      'content-type': upstream.headers.get('content-type') || (isModels ? 'application/json' : 'text/event-stream'),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    const requestId = upstream.headers.get('request-id');
    if (requestId) responseHeaders.set('request-id', requestId);
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) responseHeaders.set('retry-after', retryAfter);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return jsonError(502, 'upstream_unavailable', 'El proxy no pudo contactar con Anthropic');
  }
}
