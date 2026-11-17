const settingName = key => key.replaceAll('_', '-');
const setting = (key, value) => `${settingName(key)} = ${value}`;
export function section(name, entries) {
  return [`[${name}]`, ...Object.entries(entries).map(([key, value]) => setting(key, value))].join('\n');
}
export const general = () => section('General', {
  loglevel: 'notify', ipv6: true,
  handover_leak: 'allow', junction_handover_leak: 'allow',
  encrypted_dns_server: 'https://223.5.5.5/dns-query, https://1.12.12.12/dns-query',
  encrypted_dns_follow_outbound_mode: false,
  dns_server: '223.5.5.5, 119.29.29.29', test_timeout: 5,
  proxy_test_url: 'http://www.gstatic.com/generate_204',
});
export const ssidSettings = (ssid = 'Synopsys') => `[SSID Setting]\nSSID:${ssid} dns-server=system,encrypted-dns-server=off`;
function singleLine(value) {
  if (value === undefined || value === null || /[\r\n]/.test(String(value))) throw new Error('Invalid secret configuration');
  return String(value);
}
export function loadSecrets(env, features) {
  let profiles;
  if (features.warp) {
    try { profiles = JSON.parse(env.WARP_PROFILES); } catch { throw new Error('WARP_PROFILES must be configured as JSON'); }
    for (const name of ['direct', 'chain']) {
      const profile = profiles?.[name];
      if (!profile?.private_key || !Array.isArray(profile.address) || !profile.address.length || !Array.isArray(profile.peers) || !profile.peers.length) {
        throw new Error('Incomplete WARP_PROFILES');
      }
      singleLine(profile.private_key);
      profile.address.forEach(singleLine);
      for (const peer of profile.peers) {
        if (!peer.public_key || !peer.address || !peer.port || !Array.isArray(peer.allowed_ips)) throw new Error('Invalid WARP peer');
        [peer.public_key, peer.address, peer.port, ...peer.allowed_ips].forEach(singleLine);
        if (peer.reserved && (peer.reserved.length !== 3 || !peer.reserved.every(n => Number.isInteger(n) && n >= 0 && n <= 255))) throw new Error('Invalid WARP client identifier');
      }
    }
  }
  if (features.tailnet) {
    if (!env.TS_AUTH_KEY || !env.TS_CONTROL_URL) throw new Error('Tailscale secrets are not configured');
    singleLine(env.TS_AUTH_KEY); singleLine(env.TS_CONTROL_URL);
    let control;
    try { control = new URL(env.TS_CONTROL_URL); } catch { throw new Error('Invalid Tailscale control URL'); }
    if (control.protocol !== 'https:') throw new Error('Tailscale control URL must use HTTPS');
  }
  return {
    profiles,
    authKey: features.tailnet ? env.TS_AUTH_KEY : undefined,
    controlUrl: features.tailnet ? env.TS_CONTROL_URL : undefined,
    extraNodes: features.extraNodes ? env.EXTRA_NODES || '' : '',
  };
}
export function wireguard(name, profile) {
  const entries = { private_key: singleLine(profile.private_key) };
  const v4 = profile.address.find(address => !address.includes(':'));
  const v6 = profile.address.find(address => address.includes(':'));
  if (v4) entries.self_ip = v4.split('/')[0];
  if (v6) entries.self_ip_v6 = v6.split('/')[0];
  entries.mtu = profile.mtu || 1280;
  entries.dns_server = '1.1.1.1, 2606:4700:4700::1111';
  return [section(`WireGuard ${name}`, entries), ...profile.peers.map(peer => {
    const endpoint = `${peer.address.includes(':') ? `[${peer.address}]` : peer.address}:${peer.port}`;
    const fields = { public_key: peer.public_key, allowed_ips: `"${peer.allowed_ips.join(', ')}"`, endpoint };
    if (peer.reserved) fields.client_id = peer.reserved.join('/');
    return `peer = (${Object.entries(fields).map(([key, value]) => setting(key, value)).join(', ')})`;
  })].join('\n');
}
export function tailscale(secrets) {
  return section('Tailscale tailnet', {
    auth_key: secrets.authKey, control_url: secrets.controlUrl, hostname: 'kifold-sfa',
    exit_node: 'nas', auto_add_magic_dns_rule: true,
  });
}
