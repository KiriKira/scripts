export function safeName(name) {
  return String(name ?? '').replace(/,/g, '·').replace(/=/g, '-').replace(/[\r\n]/g, '').trim() || 'unnamed';
}
function atom(value) {
  const text = String(value);
  if (/[\r\n]/.test(text)) throw new Error('Invalid multiline proxy value');
  // Surge quoted values protect delimiters without changing ordinary fixture lines.
  return /[,"\\]/.test(text) ? JSON.stringify(text) : text;
}
export const option = (key, value) => `${key}=${atom(value)}`;
export function emitProxy(fields) {
  const type = String(fields.type || '').toLowerCase();
  if (!['trojan', 'hysteria2', 'hy2'].includes(type)) return null;
  const port = Number(fields.port);
  if (!fields.server || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const secret = fields.password ?? fields.auth;
  if (secret === undefined || secret === '') return null;
  const opts = [option('password', secret)];
  const sni = fields.sni || fields.servername;
  if (sni) opts.push(option('sni', sni));
  if (type === 'trojan') opts.push(option('udp-relay', true));
  else {
    const salamander = fields['salamander-password'] || (fields.obfs === 'salamander' && fields['obfs-password']);
    if (salamander) opts.push(option('salamander-password', salamander));
    const down = fields['download-bandwidth'] ?? fields.down;
    const up = fields['upload-bandwidth'] ?? fields.up;
    if (down !== undefined) opts.push(option('download-bandwidth', down));
    if (up !== undefined) opts.push(option('upload-bandwidth', up));
    if (fields.alpn) {
      const alpn = Array.isArray(fields.alpn) ? fields.alpn.join(',') : fields.alpn;
      opts.push(option('alpn', alpn));
    }
  }
  if (fields['skip-cert-verify'] === true || fields['skip-cert-verify'] === 'true') opts.push(option('skip-cert-verify', true));
  return { name: safeName(fields.name), line: `${safeName(fields.name)} = ${type === 'hy2' ? 'hysteria2' : type}, ${atom(fields.server)}, ${port}, ${opts.join(', ')}` };
}
export function buildProxies(fields, extraText = '') {
  const proxies = [];
  let skipped = 0;
  for (const node of fields) {
    const proxy = emitProxy(node);
    if (proxy) proxies.push(proxy); else skipped++;
  }
  const sourceCount = proxies.length;
  for (const raw of String(extraText).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(.+?)\s*=\s*(trojan|hysteria2)\s*,/i);
    if (!match) { skipped++; continue; }
    const name = safeName(match[1]);
    proxies.push({ name, line: `${name} = ${line.slice(line.indexOf('=') + 1).trim()}` });
  }
  if (!proxies.length) throw new Error('No supported proxy nodes');
  const names = proxies.map(proxy => proxy.name);
  if (new Set(names).size !== names.length) throw new Error('Duplicate proxy names');
  for (const reserved of ['DIRECT', 'REJECT', '☁️ WARP', '🔗 AI 平台 → WARP', 'Tailnet']) {
    if (names.includes(reserved)) throw new Error('Reserved proxy name');
  }
  return { proxies, sourceCount, skipped };
}
export const infrastructureProxies = [
  { requires: ['warp'], line: '☁️ WARP = wireguard, section-name=warp' },
  { requires: ['warp'], line: '🔗 AI 平台 → WARP = wireguard, section-name=warp-ai, underlying-proxy=🤖 AI 平台' },
  { requires: ['tailnet'], line: 'Tailnet = tailscale, section-name=tailnet' },
];
