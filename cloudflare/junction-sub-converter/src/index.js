import { convert } from './config.js';
import { featuresForKey } from './features.js';
const MAX_BYTES = 5 * 1024 * 1024;
function response(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: {
    'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...extra,
  } });
}
async function readLimited(upstream) {
  if (Number(upstream.headers.get('content-length')) > MAX_BYTES) {
    await upstream.body?.cancel();
    throw new Error('size');
  }
  const reader = upstream.body?.getReader();
  if (!reader) throw new Error('empty');
  const parts = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw new Error('size'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return new TextDecoder().decode(bytes);
}
export function createHandler(fetcher = globalThis.fetch) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    const features = featuresForKey(env, url.searchParams.get('key'));
    if (request.method !== 'GET') return response('Method not allowed\n', 405, { Allow: 'GET' });
    const source = url.searchParams.get('sub');
    if (!source) return response('Usage: GET /?sub=<URL-encoded Clash subscription URL>\n', 400);
    let subscription;
    try { subscription = new URL(source); } catch { return response('Invalid subscription URL\n', 400); }
    if (!['http:', 'https:'].includes(subscription.protocol) || subscription.username || subscription.password) return response('Invalid subscription URL\n', 400);
    // Secrets cannot be overridden via URL parameters (nor echoed in diagnostics).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let text;
    try {
      const upstream = await fetcher(subscription.toString(), {
        headers: { 'User-Agent': 'clash-verge/2.0.0', Accept: 'application/yaml,text/yaml,text/plain,*/*' },
        signal: controller.signal,
      });
      if (!upstream.ok) {
        await upstream.body?.cancel();
        return response(`Subscription upstream HTTP ${upstream.status}\n`, 502);
      }
      text = await readLimited(upstream);
    } catch { return response('Unable to read subscription\n', 502); }
    finally { clearTimeout(timer); }
    try {
      const { conf, stats } = convert(text, env, features);
      return response(conf, 200, {
        'Content-Disposition': 'inline; filename="junction.conf"',
        'X-Junction-Nodes': String(stats.nodes), 'X-Junction-Skipped': String(stats.skipped),
      });
    } catch { return response('Unable to convert subscription; check YAML and Worker secrets\n', 422); }
  };
}
export default { fetch: createHandler() };
