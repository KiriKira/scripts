// Public is the fail-closed default, even if ACCESS_KEY is unset.
const capabilities = ['tailnet', 'warp', 'scenarios', 'extraNodes', 'personalApps', 'privateRules'];
export const PUBLIC_FEATURES = Object.freeze(Object.fromEntries(capabilities.map(name => [name, false])));
export const FULL_FEATURES = Object.freeze(Object.fromEntries(capabilities.map(name => [name, true])));
export const enabled = (requires = [], features = PUBLIC_FEATURES) => requires.every(name => features[name] === true);
export function featuresForKey(env, suppliedKey) {
  return typeof env.ACCESS_KEY === 'string' && env.ACCESS_KEY.length > 0 && suppliedKey === env.ACCESS_KEY
    ? FULL_FEATURES : PUBLIC_FEATURES;
}
