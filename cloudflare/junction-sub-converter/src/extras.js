// 手工补充节点（secret EXTRA_NODES）在策略组里的归属。
//
// 没登记在这张表里的节点用默认策略：进「♻️ 自动选择」，并按节点名匹配国家组。
// 登记成数组的节点只出现在列出的组里，用来做一个「独立出口」——
// 例如某个节点只想当 Anthropic 的专用选项，就不要它混进自动选择和地区组。
//
// 节点的连接参数仍然只存在 Worker secret 里；这里只决定「它出现在哪些组」。
export const EXTRA_NODE_GROUPS = {
  'tencent-tokyo': ['🧠 Anthropic'],
};

/** 返回 null 表示默认策略，返回数组表示只进这些组。 */
export const groupPolicy = name => EXTRA_NODE_GROUPS[name] ?? null;
