export default [
  { id: 'anthropic-domain', kind: 'domain', values: [
    'servd-anthropic-website.b-cdn.net', 'anthropic.com.cdn.cloudflare.net',
    'anthropic.auth0.com', 'anthropic-com.ghost.io',
    'browser-intake-us5-datadoghq.com', 'cdn.usefathom.com',
  ], policy: '🧠 Anthropic' },
  { id: 'anthropic-suffix', kind: 'domain-suffix', values: [
    'anthropic.com', 'claude.ai', 'claude.com', 'clau.de', 'claude.dev',
    'claudemcpclient.com', 'claudemcpcontent.com', 'claudeusercontent.com',
    'sentry.io', 'statsigapi.net', 'intercom.io', 'intercomcdn.com',
  ], policy: '🧠 Anthropic' },
  { id: 'anthropic-keyword', kind: 'domain-keyword', values: ['datadog', 'sift'], policy: '🧠 Anthropic' },
  { id: 'anthropic-v4', kind: 'ip-cidr', values: ['160.79.104.0/21'], policy: '🧠 Anthropic' },
  { id: 'anthropic-v6', kind: 'ip-cidr6', values: ['2607:6bc0::/32'], policy: '🧠 Anthropic' },
];
