import { scopeRules } from '../emitter.js';
export const requires = ['scenarios', 'privateRules'];
export default function home(blocks, { ssid = 'DOWNTOWNBABY', policy = 'DIRECT' } = {}) {
  const rules = blocks.tailnet.filter(rule => rule.homeOrder !== undefined)
    .sort((a, b) => a.homeOrder - b.homeOrder);
  return scopeRules(rules, { ssid, policy });
}
