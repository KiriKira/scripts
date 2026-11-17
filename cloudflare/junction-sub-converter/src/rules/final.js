export default [
  { id: 'lan', kind: 'rule-set', values: ['LAN'], policy: 'DIRECT' },
  { id: 'final', kind: 'final', values: [], policy: '🐟 漏网之鱼', flags: ['dns-failed'] },
];
