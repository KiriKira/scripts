import { enabled, FULL_FEATURES } from './features.js';
const optionalMembers = [
  { name: '☁️ WARP', requires: ['warp'] },
  { name: '🔗 AI 平台 → WARP', requires: ['warp'] },
];
const allowedMember = (name, features) => enabled(optionalMembers.find(member => member.name === name)?.requires, features);
export const countries = [
  { name: '🇭🇰 香港节点', pattern: /🇭🇰|Hong[ -]?Kong|香港|\bHK\b/i },
  { name: '🇯🇵 日本节点', pattern: /🇯🇵|Tokyo|Osaka|Japan|日本|东京|\bJP\b/i },
  { name: '🇺🇸 美国节点', pattern: /🇺🇸|Los Angeles|San Jose|United States|美国|\b(?:US|USA|SFO|LAX)\b/i },
  { name: '🇹🇼 台湾节点', pattern: /🇹🇼|Taipei|Taiwan|台湾|台北|\bTW\b/i },
  { name: '🇸🇬 新加坡节点', pattern: /🇸🇬|Singapore|新加坡|\bSG\b/i },
];
const services = ['📈 网络测试', '🎥 奈飞视频', '📹 油管视频', '🌍 国外媒体', '📲 电报消息', '🎮 游戏平台', '🕹️ 游戏服务', '🤖 AI 平台'];
export function buildGroups(names, features = FULL_FEATURES) {
  const active = countries.map(country => ({ ...country, members: names.filter(name => country.pattern.test(name)) }))
    .filter(country => country.members.length);
  const regional = active.map(country => country.name);
  const common = ['🚀 节点选择', ...regional, '☁️ WARP', 'DIRECT'];
  return [
    { name: '♻️ 自动选择', type: 'smart', members: names },
    ...active.map(country => ({ name: country.name, type: 'smart', members: country.members })),
    { name: '🚀 节点选择', type: 'select', members: ['♻️ 自动选择', ...regional, '☁️ WARP', 'DIRECT'] },
    ...services.map(name => ({ name, type: 'select', members: [...common] })),
    { name: '🧠 Anthropic', type: 'select', members: [...common.slice(0, -1), '🔗 AI 平台 → WARP', 'DIRECT'] },
    { name: '🐟 漏网之鱼', type: 'select', members: ['🚀 节点选择', ...regional, 'DIRECT'] },
  ].map(group => ({ ...group, members: group.members.filter(name => allowedMember(name, features)) }));
}
export const emitGroups = groups => groups.map(group => `${group.name} = ${group.type}, ${group.members.join(', ')}`);
