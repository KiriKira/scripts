import { ruleSet } from './constants.js';
export default [
  { id: 'openai', kind: 'rule-set', values: [ruleSet('OpenAI')], policy: '🤖 AI 平台' },
  { id: 'google-ai', kind: 'domain-suffix', values: [
    'googleapis.com', 'google.com', 'google', 'g.ai', 'deepmind.com',
    'kaggle.com', 'tensorflow.org', 'tfhub.dev',
  ], policy: '🤖 AI 平台' },
];
