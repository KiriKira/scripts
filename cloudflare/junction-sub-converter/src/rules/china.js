import { ruleSet } from './constants.js';
export default [
  { id: 'deepseek', kind: 'domain-suffix', values: ['deepseek.com'], policy: 'DIRECT', scenarioOrder: 2 },
  { id: 'china-domains', kind: 'domain-set', values: [ruleSet('ChinaMax', 'ChinaMax_Domain')], policy: 'DIRECT', scenarioOrder: 0 },
  { id: 'china-networks', kind: 'rule-set', values: [ruleSet('ChinaMax')], policy: 'DIRECT', scenarioOrder: 1 },
  { id: 'china-geoip', kind: 'geoip', values: ['CN'], policy: 'DIRECT', scenarioOrder: 3 },
];
