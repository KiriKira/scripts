// Independent text-level audit: deliberately does not import the production emitter.
export function check(ok, message) {
  if (!ok) throw new Error(message);
}
export function meaningful(text) {
  return text.split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith('#'));
}
export function splitTop(text) {
  let depth = 0, quote = false, start = 0;
  const result = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === '\\') { i++; continue; }
      if (char === '"') quote = false;
    } else if (char === '"') quote = true;
    else if (char === '(') depth++;
    else if (char === ')') { depth--; check(depth >= 0, 'Unbalanced rule parentheses'); }
    else if (char === ',' && depth === 0) {
      result.push(text.slice(start, i).trim()); start = i + 1;
    }
  }
  check(depth === 0 && !quote, 'Unbalanced rule expression');
  result.push(text.slice(start).trim());
  return result;
}
function unwrap(text) {
  check(text.startsWith('(') && text.endsWith(')'), 'Logical child must be parenthesized');
  return text.slice(1, -1);
}
const RESOLVING = new Set(['IP-CIDR', 'IP-CIDR6', 'GEOIP', 'IP-ASN', 'RULE-SET', 'DOMAIN-SET']);
const LEAVES = new Set([...RESOLVING, 'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'PROCESS-NAME', 'SUBNET']);
function auditCondition(expression) {
  const tokens = splitTop(expression);
  if (tokens[0] === 'AND' || tokens[0] === 'OR') {
    check(tokens.length === 2, 'Invalid logical condition shape');
    const children = splitTop(unwrap(tokens[1]));
    check(children.length >= 2, 'Logical condition requires at least two children');
    return children.reduce((count, child) => count + auditCondition(unwrap(child)), 0);
  }
  check(LEAVES.has(tokens[0]), 'Unknown rule condition type');
  check(Boolean(tokens[1]), 'Missing rule condition value');
  if (RESOLVING.has(tokens[0])) check(tokens.slice(2).includes('no-resolve'), 'Resolving condition lacks no-resolve');
  return 1;
}
export function audit(conf, { publicMode = false } = {}) {
  const sections = new Map(); let active;
  for (const line of meaningful(conf)) {
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      active = header[1];
      check(!sections.has(active), 'Duplicate section');
      sections.set(active, []);
    } else {
      check(sections.has(active), 'Data outside a section');
      sections.get(active).push(line);
    }
  }
  const expectedSections = publicMode ? ['General', 'Proxy', 'Proxy Group', 'Rule'] : ['General', 'SSID Setting', 'Proxy', 'Proxy Group', 'Rule', 'WireGuard warp', 'WireGuard warp-ai', 'Tailscale tailnet'];
  check(JSON.stringify([...sections.keys()]) === JSON.stringify(expectedSections), 'Section ordering mismatch');
  const assignment = line => {
    const index = line.indexOf(' = ');
    check(index > 0, 'Invalid policy assignment');
    return [line.slice(0, index), line.slice(index + 3)];
  };
  const proxies = new Map();
  for (const line of sections.get('Proxy')) {
    const [name, body] = assignment(line);
    check(!proxies.has(name), 'Duplicate proxy name');
    proxies.set(name, splitTop(body));
  }
  const groups = new Map();
  for (const line of sections.get('Proxy Group')) {
    const [name, body] = assignment(line);
    check(!groups.has(name) && !proxies.has(name), 'Duplicate or colliding group name');
    groups.set(name, splitTop(body));
  }
  const builtin = new Set(['DIRECT', 'REJECT', 'REJECT-DROP']);
  const exists = name => builtin.has(name) || proxies.has(name) || groups.has(name);
  const edges = new Map();
  for (const [name, [type, ...members]] of groups) {
    check(['smart', 'select'].includes(type), 'Unexpected group type');
    check(members.length > 0, 'Empty proxy group');
    check(new Set(members).size === members.length, 'Duplicate group member');
    for (const member of members) {
      check(exists(member), 'Unknown group member');
      if (type === 'smart') check(proxies.has(member), 'Smart group contains a group or builtin');
    }
    edges.set(name, members.filter(member => !builtin.has(member)));
  }
  for (const [name, fields] of proxies) {
    const underlying = fields.find(field => field.startsWith('underlying-proxy='))?.slice('underlying-proxy='.length);
    if (underlying) {
      check(exists(underlying), 'Unknown underlying proxy');
      edges.set(name, [underlying]);
    }
    const section = fields.find(field => field.startsWith('section-name='))?.slice('section-name='.length);
    if (section) check(sections.has(`${fields[0] === 'wireguard' ? 'WireGuard' : 'Tailscale'} ${section}`), 'Missing transport section');
  }
  const visiting = new Set(), visited = new Set();
  function visit(name) {
    check(!visiting.has(name), 'Policy dependency cycle');
    if (visited.has(name)) return;
    visiting.add(name);
    for (const member of edges.get(name) || []) visit(member);
    visiting.delete(name); visited.add(name);
  }
  for (const name of edges.keys()) visit(name);
  let conditions = 0;
  for (const line of sections.get('Rule')) {
    const tokens = splitTop(line);
    let policy;
    if (tokens[0] === 'FINAL') {
      policy = tokens[1];
      check(tokens.slice(2).includes('dns-failed'), 'FINAL lacks dns-failed');
    } else if (tokens[0] === 'AND' || tokens[0] === 'OR') {
      check(tokens.length === 3, 'Invalid top-level logical rule');
      policy = tokens[2];
      conditions += auditCondition(tokens.slice(0, 2).join(','));
    } else {
      check(tokens.length >= 3, 'Missing rule policy');
      policy = tokens[2];
      conditions += auditCondition([tokens[0], tokens[1], ...tokens.slice(3)].join(','));
    }
    check(exists(policy), 'Unknown rule policy');
  }
  check(sections.get('Rule').some(line => line.startsWith('DOMAIN-SET,') && line.includes('/ChinaMax/ChinaMax_Domain.list,')), 'China domain coverage is missing');
  check(sections.get('Rule').at(-1) === 'FINAL,🐟 漏网之鱼,dns-failed', 'Invalid final fallback');
  return { sections, proxies: proxies.size, groups: groups.size, rules: sections.get('Rule').length, conditions };
}
