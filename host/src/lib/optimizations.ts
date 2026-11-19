/** Zone optimizations GeoHarness applies; every id is a feature in cloudflare-permissions.json. */
export const OPTIMIZATION_IDS = [
  'email_obfuscation', 'rocket_loader', 'early_hints', 'http3', 'brotli',
  'smart_tiered_cache', 'zstd', 'bot_fight_mode', 'ai_bots_protection',
] as const;
export type OptimizationId = (typeof OPTIMIZATION_IDS)[number];

function isOptimizationId(s: string): s is OptimizationId {
  return (OPTIMIZATION_IDS as readonly string[]).includes(s);
}

/**
 * Grammar of the `extra-optimizations` input: tokens separated by whitespace or commas, applied left to right
 * to an empty set. `all` adds every id, `none` clears, `<id>` adds one, `-<id>` opts one out.
 * Example: "all -rocket_loader". An empty value is an error, not "nothing".
 */
export function parseOptimizations(raw: string): { ok: true; value: Set<OptimizationId> } | { ok: false; error: string } {
  const tokens = raw.split(/[\s,]+/).filter((t) => t !== '');
  if (tokens.length === 0) return { ok: false, error: 'extra-optimizations is empty; use "all", "none" or a list of ids' };
  const set = new Set<OptimizationId>();
  for (const token of tokens) {
    if (token === 'all') OPTIMIZATION_IDS.forEach((id) => set.add(id));
    else if (token === 'none') set.clear();
    else {
      const remove = token.startsWith('-');
      const id = remove ? token.slice(1) : token;
      if (!isOptimizationId(id)) {
        return { ok: false, error: `extra-optimizations: unknown id "${id}" (known: ${OPTIMIZATION_IDS.join(', ')})` };
      }
      if (remove) set.delete(id); else set.add(id);
    }
  }
  return { ok: true, value: set };
}
