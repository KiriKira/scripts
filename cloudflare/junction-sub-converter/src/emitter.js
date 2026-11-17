// A rule is data; only this module knows Surge rule serialization.
const RESOLVING = new Set(['ip-cidr', 'ip-cidr6', 'geoip', 'ip-asn', 'rule-set', 'domain-set']);
export function flagsFor(rule) {
  return [...new Set([...(rule.flags || []), ...(RESOLVING.has(rule.kind) ? ['no-resolve'] : [])])];
}
export function predicates(rule) {
  if (rule.kind === 'and' || rule.kind === 'or') return [rule];
  if (rule.kind === 'final') return [{ ...rule, value: undefined }];
  return rule.values.map(value => ({ ...rule, value }));
}
export function condition(rule) {
  if (rule.kind === 'and' || rule.kind === 'or') {
    return `${rule.kind.toUpperCase()},(${rule.children.map(child => `(${condition(child)})`).join(',')})`;
  }
  return [rule.kind.toUpperCase(), rule.value, ...flagsFor(rule)].filter(v => v !== undefined).join(',');
}
export function emitRules(rules) {
  return rules.flatMap(rule => predicates(rule).map(predicate => {
    if (rule.kind === 'and' || rule.kind === 'or') return `${condition(predicate)},${rule.policy}`;
    return [rule.kind.toUpperCase(), predicate.value, rule.policy, ...flagsFor(rule)]
      .filter(v => v !== undefined).join(',');
  }));
}
export function scopeRules(rules, { ssid, policy, fold = false }) {
  return rules.flatMap(rule => {
    const children = predicates(rule);
    const conditions = fold && children.length > 1 ? [{ kind: 'or', children }] : children;
    return conditions.map(child => ({
      id: `${ssid}:${rule.id}`, kind: 'and', policy: policy ?? rule.policy,
      children: [{ kind: 'subnet', value: `SSID:${ssid}` }, child],
    }));
  });
}
