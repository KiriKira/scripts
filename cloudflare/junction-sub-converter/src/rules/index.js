import * as anthropic from './anthropic.js';
import * as ai from './ai.js';
import * as china from './china.js';
import * as media from './media.js';
import * as tailnet from './tailnet.js';
import * as apps from './apps.js';
import * as final from './final.js';
import * as synopsys from '../scenarios/synopsys.js';
import * as home from '../scenarios/home.js';
import { enabled, FULL_FEATURES } from '../features.js';
const modules = { anthropic, ai, china, media, tailnet, apps, final };
export const blocks = Object.fromEntries(Object.entries(modules).map(([name, module]) => [name, module.default]));
export function buildRules(options = {}, features = FULL_FEATURES) {
  const active = Object.fromEntries(Object.entries(modules).map(([name, module]) => [name,
    enabled(module.requires, features) ? module.default.filter(rule => enabled(rule.requires, features)) : [],
  ]));
  // The registry controls ordering; capability ownership lives in each module.
  const registry = [
    { ...synopsys, derive: true, options: options.synopsys },
    { default: active.anthropic },
    { ...home, derive: true, options: options.home },
    ...['tailnet', 'apps', 'china', 'ai', 'media', 'final'].map(name => ({ default: active[name] })),
  ];
  return registry.filter(module => enabled(module.requires, features))
    .flatMap(module => module.derive ? module.default(active, module.options) : module.default);
}
