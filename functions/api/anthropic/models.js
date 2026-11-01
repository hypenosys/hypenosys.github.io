import { proxyAnthropicRequest } from '../../../cloudflare/anthropic-proxy.mjs';

export async function onRequestGet(context) {
  return proxyAnthropicRequest(context.request);
}
