export const requires = ['tailnet', 'privateRules'];
export default [
  { id: 'tailnet-v4', kind: 'ip-cidr', values: ['10.0.0.0/24'], policy: 'Tailnet', scenarioOrder: 1 },
  { id: 'tailnet-home-lan', kind: 'ip-cidr', values: ['192.168.31.0/24'], policy: 'Tailnet', scenarioOrder: 2, homeOrder: 1 },
  { id: 'tailnet-domain', kind: 'domain-suffix', values: ['kiri.homes'], policy: 'Tailnet', scenarioOrder: 0, homeOrder: 0 },
];
