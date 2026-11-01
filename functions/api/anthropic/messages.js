import { proxyAnthropicRequest } from '../../../cloudflare/anthropic-proxy.mjs';

export async function onRequestPost(context) {
  return proxyAnthropicRequest(context.request);
}
