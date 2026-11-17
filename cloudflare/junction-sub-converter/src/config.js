import { parseClash } from './clash.js';
import { buildProxies, infrastructureProxies } from './proxies.js';
import { buildGroups, emitGroups } from './groups.js';
import { groupPolicy } from './extras.js';
import { buildRules } from './rules/index.js';
import { emitRules } from './emitter.js';
import { enabled, PUBLIC_FEATURES } from './features.js';
import { general, ssidSettings, loadSecrets, wireguard, tailscale } from './sections.js';
export function convert(clashText, env = {}, features = PUBLIC_FEATURES) {
  const secrets = loadSecrets(env, features);
  const { proxies, sourceCount, skipped, extraNames } = buildProxies(parseClash(clashText), secrets.extraNodes);
  const infrastructure = infrastructureProxies.filter(proxy => enabled(proxy.requires, features));
  const extraSet = new Set(extraNames);
  const policyFor = name => (extraSet.has(name) ? groupPolicy(name) : null);
  const groups = buildGroups(proxies.map(proxy => proxy.name), features, policyFor);
  const allNames = [...proxies.map(proxy => proxy.name), ...groups.map(group => group.name)];
  if (new Set(allNames).size !== allNames.length) throw new Error('Proxy and group name collision');
  const rules = buildRules({}, features);
  const ruleLines = emitRules(rules);
  const sections = [
    { render: general },
    { requires: ['scenarios', 'privateRules'], render: ssidSettings },
    { render: () => ['[Proxy]', ...proxies.map(proxy => proxy.line), ...infrastructure.map(proxy => proxy.line)].join('\n') },
    { render: () => ['[Proxy Group]', ...emitGroups(groups)].join('\n') },
    { render: () => ['[Rule]', ...ruleLines].join('\n') },
    { requires: ['warp'], render: () => wireguard('warp', secrets.profiles.direct) },
    { requires: ['warp'], render: () => wireguard('warp-ai', secrets.profiles.chain) },
    { requires: ['tailnet'], render: () => tailscale(secrets) },
  ];
  const conf = sections.filter(item => enabled(item.requires, features)).map(item => item.render()).join('\n\n') + '\n';
  return { conf, stats: { sourceNodes: sourceCount, nodes: proxies.length, infrastructure: infrastructure.length, skipped, groups: groups.length, rules: ruleLines.length } };
}
