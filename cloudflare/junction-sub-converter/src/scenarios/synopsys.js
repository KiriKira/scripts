import { scopeRules } from '../emitter.js';
export const requires = ['scenarios', 'privateRules', 'tailnet'];
const ordered = rules => [...rules].sort((a, b) => (a.scenarioOrder ?? Infinity) - (b.scenarioOrder ?? Infinity));
export default function synopsys(blocks, { ssid = 'Synopsys', exitPolicy = 'Tailnet', fallbackPolicy = 'DIRECT' } = {}) {
  return [
    ...scopeRules(blocks.apps, { ssid, policy: exitPolicy }),
    ...scopeRules([...blocks.anthropic, ...blocks.ai], { ssid, fold: true }),
    ...scopeRules(ordered(blocks.tailnet), { ssid, policy: exitPolicy }),
    ...scopeRules(ordered(blocks.china), { ssid, policy: exitPolicy }),
    { id: `${ssid}:fallback`, kind: 'subnet', values: [`SSID:${ssid}`], policy: fallbackPolicy },
  ];
}
