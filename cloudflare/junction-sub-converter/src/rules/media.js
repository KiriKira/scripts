import { ruleSet } from './constants.js';
export default [
  { id: 'netflix', kind: 'rule-set', values: [ruleSet('Netflix')], policy: '🎥 奈飞视频' },
  { id: 'disney', kind: 'rule-set', values: [ruleSet('Disney')], policy: '🎥 奈飞视频' },
  { id: 'telegram', kind: 'rule-set', values: [ruleSet('Telegram')], policy: '📲 电报消息' },
  { id: 'game', kind: 'rule-set', values: [ruleSet('Game')], policy: '🎮 游戏平台' },
];
