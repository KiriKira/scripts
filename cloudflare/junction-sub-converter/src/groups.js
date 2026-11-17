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
export const AUTO_GROUP = '♻️ 自动选择';
/**
 * @param names     全部代理名（订阅节点 + 手工补充节点）
 * @param features  能力开关
 * @param policyFor 手工补充节点的组归属：null = 默认（自动选择 + 名称匹配的国家组），
 *                  数组 = 只进列出的组。订阅节点一律 null。
 */
export function buildGroups(names, features = FULL_FEATURES, policyFor = () => null) {
  const explicit = name => {
    const policy = policyFor(name);
    return Array.isArray(policy) ? policy : null;
  };
  const followsDefault = name => explicit(name) === null;
  const inGroup = (name, groupName) => followsDefault(name) || explicit(name).includes(groupName);

  const active = countries.map(country => ({ ...country, members: names.filter(name => country.pattern.test(name) && inGroup(name, country.name)) }))
    .filter(country => country.members.length);
  const regional = active.map(country => country.name);
  const common = ['🚀 节点选择', ...regional, '☁️ WARP', 'DIRECT'];
  // 只想当某个组的独立出口的节点，插在该组 DIRECT 之前
  const withExplicit = (groupName, members) => {
    const extras = names.filter(name => explicit(name)?.includes(groupName));
    if (!extras.length) return members;
    const at = members.indexOf('DIRECT');
    return at < 0 ? [...members, ...extras] : [...members.slice(0, at), ...extras, ...members.slice(at)];
  };
  const autoMembers = names.filter(name => followsDefault(name) || explicit(name).includes(AUTO_GROUP));

  return [
    { name: AUTO_GROUP, type: 'smart', members: autoMembers },
    ...active.map(country => ({ name: country.name, type: 'smart', members: country.members })),
    { name: '🚀 节点选择', type: 'select', members: withExplicit('🚀 节点选择', ['♻️ 自动选择', ...regional, '☁️ WARP', 'DIRECT']) },
    ...services.map(name => ({ name, type: 'select', members: withExplicit(name, [...common]) })),
    { name: '🧠 Anthropic', type: 'select', members: withExplicit('🧠 Anthropic', [...common.slice(0, -1), '🔗 AI 平台 → WARP', 'DIRECT']) },
    { name: '🐟 漏网之鱼', type: 'select', members: withExplicit('🐟 漏网之鱼', ['🚀 节点选择', ...regional, 'DIRECT']) },
  ].map(group => ({ ...group, members: group.members.filter(name => allowedMember(name, features)) }));
}
export const emitGroups = groups => groups.map(group => `${group.name} = ${group.type}, ${group.members.join(', ')}`);
