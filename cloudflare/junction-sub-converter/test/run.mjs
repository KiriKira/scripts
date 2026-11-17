import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { convert } from '../src/config.js';
import { featuresForKey, PUBLIC_FEATURES, FULL_FEATURES } from '../src/features.js';
import { parseClash } from '../src/clash.js';
import { buildProxies, emitProxy, option } from '../src/proxies.js';
import { buildGroups } from '../src/groups.js';
import { buildRules, blocks } from '../src/rules/index.js';
import { emitRules, scopeRules } from '../src/emitter.js';
import synopsys from '../src/scenarios/synopsys.js';
import { createHandler } from '../src/index.js';
import { audit, check, meaningful } from './audit.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
function throws(fn, label) {
  let caught = false;
  try { fn(); } catch { caught = true; }
  check(caught, label);
}
function diff(reference, actual) {
  const expected = meaningful(reference), generated = meaningful(actual);
  let differences = 0;
  // Never print secret-bearing node/WireGuard/Tailscale lines, even on failures.
  const redact = line => {
    if (!line) return '<missing>';
    if (/password\s*=|private-key\s*=|public-key\s*=|auth-key\s*=|control-url\s*=/i.test(line)) return '<sensitive line redacted>';
    return line;
  };
  for (let i = 0; i < Math.max(expected.length, generated.length); i++) {
    if (expected[i] !== generated[i]) {
      differences++;
      console.log(`DIFF meaningful line ${i + 1}:\n- ${redact(expected[i])}\n+ ${redact(generated[i])}`);
    }
  }
  console.log(`逐行 diff: ${differences === 0 ? 'PASS / 一致' : 'FAIL'}; reference=${expected.length}, generated=${generated.length}, differences=${differences}`);
  check(differences === 0, 'Reference comparison failed');
}
async function sourceFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', '__pycache__', 'node_modules'].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(js|mjs|py|md|json)$/.test(entry.name)) files.push(path);
  }
  return files;
}
async function main() {
  const env = JSON.parse(await readFile(process.env.SECRETS_FILE || '/opt/data/.secrets/junction-secrets.json', 'utf8'));
  const [sample, reference] = await Promise.all([
    readFile(new URL('./clash_sample.yaml', import.meta.url), 'utf8'),
    readFile(new URL('./reference.conf', import.meta.url), 'utf8'),
  ]);
  const originalHashes = [hash(sample), hash(reference)];
  check(Boolean(env.ACCESS_KEY), 'ACCESS_KEY fixture must be configured');
  const full = featuresForKey(env, env.ACCESS_KEY);
  check(full === FULL_FEATURES, 'Correct fixture key must enable full features');
  const { conf, stats } = convert(sample, env, full);
  diff(reference, conf);
  const structure = audit(conf);
  check(stats.sourceNodes === 31 && stats.nodes === 33 && stats.groups === 17 && stats.rules === 69 && stats.skipped === 0, 'Fixture count regression');
  // 手工节点 tencent-tokyo 是 Anthropic 的独立出口：只进 Anthropic，不进自动选择/日本组
  const groupLine = name => conf.split('\n').find(line => line.startsWith(`${name} = `)) || '';
  check(groupLine('🧠 Anthropic').includes('tencent-tokyo'), 'Dedicated extra node missing from Anthropic group');
  check(!groupLine('♻️ 自动选择').includes('tencent-tokyo'), 'Dedicated extra node leaked into auto group');
  check(!groupLine('🇯🇵 日本节点').includes('tencent-tokyo'), 'Dedicated extra node leaked into a country group');
  check(!groupLine('🚀 节点选择').includes('tencent-tokyo'), 'Dedicated extra node leaked into manual selector');
  check(conf.includes('tencent-tokyo = vless,'), 'VLESS extra node line missing from [Proxy]');
  check(structure.proxies === stats.nodes + stats.infrastructure, 'Proxy count mismatch');
  console.log(`结构自检: PASS; rules=${structure.rules}, leaf conditions=${structure.conditions}, proxy policies=${structure.proxies}, groups=${structure.groups}; references/cycles/no-resolve OK`);

  // Auditor regression: prove that each promised invariant can actually fail.
  throws(() => audit(conf.replace('IP-CIDR,10.0.0.0/24,no-resolve', 'IP-CIDR,10.0.0.0/24')), 'Nested IP no-resolve audit missed a defect');
  throws(() => audit(conf.replace('/OpenAI/OpenAI.list,no-resolve', '/OpenAI/OpenAI.list')), 'Nested rule-set audit missed a defect');
  throws(() => audit(conf.replace('GEOIP,CN,DIRECT,no-resolve', 'GEOIP,CN,DIRECT')), 'Top-level GEOIP audit missed a defect');
  throws(() => audit(conf.replace('FINAL,🐟 漏网之鱼,', 'FINAL,nonexistent-policy,')), 'Rule policy audit missed a defect');
  throws(() => audit(conf.replace('🚀 节点选择 = select, ♻️ 自动选择', '🚀 节点选择 = select, nonexistent-member')), 'Group member audit missed a defect');
  const firstProxyLine = structure.sections.get('Proxy')[0];
  throws(() => audit(conf.replace('[Proxy]\n', `[Proxy]\n${firstProxyLine}\n`)), 'Duplicate proxy audit missed a defect');
  throws(() => audit(conf.replace('♻️ 自动选择 = smart, ', '♻️ 自动选择 = smart, DIRECT, ')), 'Smart group audit missed a defect');
  console.log('审计器负向回归: PASS; nested IP/set, GEOIP, missing policies/members, duplicates, smart constraints');

  const parsed = parseClash(sample);
  check(parsed.length === 31 && new Set(parsed.map(node => node.name)).size === 31, 'Section final-item flush regression');
  check(parseClash(sample.split(/\nproxy-groups\s*:/)[0]).length === 31, 'End-of-file flush regression');
  check(convert(Buffer.from(sample).toString('base64'), env, full).conf === conf, 'UTF-8 base64 subscription regression');
  check(parseClash('\uFEFF' + sample.replaceAll('\n', '\r\n')).length === 31, 'BOM/CRLF regression');
  check(parseClash('proxies: []\nrules: []').length === 0, 'Empty proxy list regression');
  const secret = parsed[0].password;
  const block = `proxies:\n- name: 'HY2, quoted # unicode 测试'\n  type: hysteria2\n  server: example.invalid\n  port: 443\n  password: ${JSON.stringify(secret)}\n  sni: example.invalid\n  obfs: salamander\n  obfs-password: ${JSON.stringify(secret)}\n  down: 100\n  up: 20\n  skip-cert-verify: true\n  alpn:\n    - h3\n    - h2\nproxy-groups: []\n`;
  const hy = parseClash(block)[0], hyLine = emitProxy(hy)?.line;
  check(hy.alpn.length === 2 && hyLine, 'HY2 block-list parser regression');
  for (const fragment of ['salamander-password', 'download-bandwidth=100', 'upload-bandwidth=20', 'skip-cert-verify=true', 'alpn="h3,h2"', 'sni=example.invalid']) check(hyLine.includes(fragment), 'HY2 option missing');
  const flow = `proxies:\n  - {name: 'Flow node', type: hy2, server: example.invalid, port: 443, password: ${JSON.stringify(secret)}, alpn: [h3, h2]} # trailing comment\nrules: []\n`;
  check(emitProxy(parseClash(flow)[0])?.line.includes('alpn="h3,h2"'), 'Flow YAML parser regression');
  const escaped = `proxies:\n  - name: 'It''s a node # literal'\n    type: trojan\n    server: example.invalid\n    port: 443\n    password: ${JSON.stringify(secret)} # comment\n`;
  check(parseClash(escaped)[0].name === "It's a node # literal", 'Quoted scalar parsing regression');
  const mixed = buildProxies([...parsed, { type: 'unsupported-protocol' }, { ...parsed[0], port: 0 }]);
  check(mixed.skipped === 2 && mixed.proxies.length === 31, 'Unsupported/invalid nodes must be skipped individually');
  throws(() => buildProxies([parsed[0], parsed[0]]), 'Duplicate source nodes must be rejected');
  throws(() => buildProxies([parsed[0]], `${parsed[0].name} = trojan, example.invalid, 443`), 'Duplicate extra nodes must be rejected');
  const sparse = buildGroups(['example-SFO']);
  check(sparse.find(group => group.name === '🇺🇸 美国节点')?.members[0] === 'example-SFO', 'SFO country matching regression');
  check(sparse.filter(group => group.type === 'smart').every(group => group.members.length), 'Empty smart groups must be omitted');
  console.log('节点转换/解析: PASS; 31 source + 1 secret extra; HY2 options, YAML flow/block/quotes, UTF-8 base64, last-item flush, skip counts');

  const descriptor = { id: 'extension-proof', kind: 'domain-suffix', values: ['extension.example.invalid'], policy: '🤖 AI 平台' };
  blocks.ai.push(descriptor);
  try {
    const extended = emitRules(buildRules());
    check(extended.includes('DOMAIN-SUFFIX,extension.example.invalid,🤖 AI 平台'), 'New module descriptor missing at top level');
    check(extended.some(line => line.startsWith('AND,') && line.includes('extension.example.invalid')), 'Scenario did not derive a new base descriptor');
  } finally { blocks.ai.pop(); }
  const custom = emitRules(synopsys(blocks, { ssid: 'EXAMPLE-OFFICE', exitPolicy: 'DIRECT', fallbackPolicy: 'Tailnet' }));
  check(custom.at(-1) === 'SUBNET,SSID:EXAMPLE-OFFICE,Tailnet', 'Scenario fallback parameter ignored');
  check(custom[0].endsWith(',DIRECT') && custom[0].includes('SSID:EXAMPLE-OFFICE'), 'Scenario exit parameter ignored');
  const asn = { id: 'asn-test', kind: 'ip-asn', values: ['64512'], policy: 'DIRECT' };
  check(emitRules(scopeRules([asn], { ssid: 'TEST' }))[0].includes('IP-ASN,64512,no-resolve'), 'Logical ASN lacks no-resolve');
  console.log('规则数据化/场景派生: PASS; adding one descriptor updates base + scenario without emitter changes');

  const publicResult = convert(sample, env, PUBLIC_FEATURES);
  const forbidden = ['Tailnet', 'Synopsys', 'DOWNTOWNBABY', 'kiri.homes', 'WARP', 'litemoe', 'tencent-tokyo', 'tkproxy.openkiri.zip',
    'com.tencent.mm', 'com.kirikira.rednote.fold', 'com.example.piliplus', 'com.callagent.host',
    '[SSID Setting]', '[WireGuard', '[Tailscale', '10.0.0.0/24', '192.168.31.0/24'];
  function publicSafe(text) {
    for (const value of forbidden) check(!text.includes(value), 'Public configuration contains a private identifier');
    audit(text, { publicMode: true });
  }
  publicSafe(publicResult.conf);
  check(publicResult.stats.nodes === 31 && publicResult.stats.groups === 17, 'Public node/group count regression');
  check(convert(sample, {}).conf === publicResult.conf, 'Public generation must not require any secrets');
  check(featuresForKey(env, undefined) === PUBLIC_FEATURES && featuresForKey(env, randomBytes(24).toString('hex')) === PUBLIC_FEATURES, 'Missing/wrong keys must choose public capabilities');
  check(featuresForKey({}, undefined) === PUBLIC_FEATURES && featuresForKey({ ACCESS_KEY: '' }, '') === PUBLIC_FEATURES, 'Unset ACCESS_KEY must fail closed to public');
  const publicReview = await readFile(new URL('./reference-public.conf', import.meta.url), 'utf8');
  check((publicReview.match(/<CLASH_PASSWORD_\d{2}>/g) || []).length === parsed.length, 'Public baseline credential placeholder count mismatch');
  check(!parsed.some(node => node.password && publicReview.includes(node.password)), 'Public review baseline embeds a subscription credential');
  let publicBaseline = publicReview;
  parsed.forEach((node, index) => {
    const placeholder = `<CLASH_PASSWORD_${String(index + 1).padStart(2, '0')}>`;
    publicBaseline = publicBaseline.replace(option('password', placeholder), option('password', node.password));
  });
  console.log('脱敏版基线（口令占位符仅在内存从输入还原）:');
  diff(publicBaseline, publicResult.conf);
  console.log(`脱敏版结构/隐私: PASS; rules=${publicResult.stats.rules}, nodes=${publicResult.stats.nodes}, groups=${publicResult.stats.groups}; no private identifiers, dangling references or personal secrets`);

  // A private addition in an otherwise public module declares ownership locally.
  blocks.ai.push({ ...descriptor, requires: ['privateRules'] });
  try {
    check(!emitRules(buildRules({}, PUBLIC_FEATURES)).some(line => line.includes('extension.example.invalid')), 'Descriptor-level capability metadata leaked private rule');
    check(emitRules(buildRules({}, FULL_FEATURES)).some(line => line.includes('extension.example.invalid')), 'Descriptor-level private rule missing in full build');
  } finally { blocks.ai.pop(); }

  let fetchCalls = 0;
  const fakeFetch = async (url, options) => {
    fetchCalls++;
    check(new URL(url).searchParams.get('clash') === '1', 'Subscription query was not preserved');
    check(options.headers['User-Agent'].includes('clash'), 'Missing Clash upstream UA');
    return new Response(sample);
  };
  const handler = createHandler(fakeFetch);
  const address = 'https://converter.invalid/?sub=' + encodeURIComponent('https://subscription.invalid/feed?clash=1');
  const fullAddress = address + '&key=' + encodeURIComponent(env.ACCESS_KEY);
  let result = await handler(new Request(fullAddress), env);
  check(result.status === 200 && await result.text() === conf, 'Correct key must return full reference configuration');
  check(result.headers.get('Cache-Control') === 'no-store' && result.headers.get('X-Junction-Nodes') === '33', 'Missing safe response headers');
  for (const suffix of ['', '&key=' + randomBytes(24).toString('hex'), '&key=']) {
    result = await handler(new Request(address + suffix), env);
    const body = await result.text();
    check(result.status === 200 && body === publicResult.conf, 'Missing/wrong key must return usable public configuration, not 403');
    publicSafe(body);
  }
  result = await handler(new Request(address), {});
  check(result.status === 200 && await result.text() === publicResult.conf, 'Unconfigured secrets must still allow public conversion');
  check((await handler(new Request('https://converter.invalid/'), env)).status === 400, 'Missing subscription must be rejected');
  check((await handler(new Request(address, { method: 'POST' }), env)).status === 405, 'POST must be rejected');
  check((await handler(new Request('https://converter.invalid/?sub=file:///etc/passwd'), env)).status === 400, 'Unsupported URL scheme accepted');
  check((await handler(new Request(fullAddress), { ...env, WARP_PROFILES: '' })).status === 422, 'Full request with missing WARP secret must not produce partial config');
  check((await createHandler(async () => new Response('upstream error', { status: 503 }))(new Request(address), env)).status === 502, 'Upstream failure not mapped to 502');
  check((await createHandler(async () => { throw new Error('network'); })(new Request(address), env)).status === 502, 'Network failure not mapped to 502');
  check((await createHandler(async () => new Response('small', { headers: { 'Content-Length': String(6 * 1024 * 1024) } }))(new Request(address), env)).status === 502, 'Oversize header not rejected');
  check((await createHandler(async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1)))(new Request(address), env)).status === 502, 'Oversize streaming body not rejected');
  result = await handler(new Request(fullAddress + '&extra=ignored&auth_key=ignored&warp_key=ignored'), env);
  check(result.status === 200 && await result.text() === conf, 'URL must not override secret bindings');
  result = await handler(new Request(address + '&extra=ignored&auth_key=ignored&warp_key=ignored'), env);
  check(result.status === 200 && await result.text() === publicResult.conf, 'Private URL overrides must not escalate public capabilities');
  console.log('Worker HTTP: PASS; correct key=full, missing/wrong/unset key=public; no overrides; 400/405/422/502, size limits');

  const sensitive = [...Object.values(env).filter(value => typeof value === 'string'), ...parsed.map(node => node.password)];
  const profiles = JSON.parse(env.WARP_PROFILES);
  for (const profile of Object.values(profiles)) sensitive.push(profile.private_key, ...profile.peers.map(peer => peer.public_key));
  const sourcePaths = await sourceFiles(root.replace(/\/$/, ''));
  for (const path of sourcePaths) {
    const text = await readFile(path, 'utf8');
    check(!sensitive.filter(value => value && value.length > 8).some(value => text.includes(value)), 'Secret value found in source or test code');
  }
  for (const [file, expected] of [['clash_sample.yaml', originalHashes[0]], ['reference.conf', originalHashes[1]]]) {
    check(hash(await readFile(new URL('./' + file, import.meta.url), 'utf8')) === expected, 'Acceptance fixture was modified');
  }
  console.log(`密钥/基线保护: PASS; ${sourcePaths.length} code/document files scanned; no fixture credentials embedded; fixtures unchanged`);

  const python = spawnSync('python3', ['test/deploy_test.py'], { cwd: root, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  // Python test intentionally suppresses payloads and never connects to Cloudflare.
  if (python.stdout) process.stdout.write(python.stdout);
  check(python.status === 0, 'Offline deploy helper tests failed (details suppressed to avoid secrets)');
  console.log(`PASS / 与参考完全一致: rules=${stats.rules}, nodes=${stats.nodes} (Clash=${stats.sourceNodes}, extra=${stats.nodes - stats.sourceNodes}), groups=${stats.groups}, skipped=${stats.skipped}`);
}
main().catch(error => {
  // Only our static labels are printed; never dump assertion operands/configs.
  console.error('FAIL:', error.message.replace(/\r?\n/g, ' '));
  process.exitCode = 1;
});
