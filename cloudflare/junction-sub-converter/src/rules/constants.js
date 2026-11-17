export const RULE_BASE = 'https://testingcf.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Surge';
export const ruleSet = (name, file = name) => `${RULE_BASE}/${name}/${file}.list`;
