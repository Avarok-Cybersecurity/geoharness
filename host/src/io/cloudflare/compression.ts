import type { CfRule } from './rulesets.js';

/** Compression Rule preferring zstd, then brotli, then gzip, for the site's hosts (phase http_response_compression). */
export function zstdCompressionRule(hosts: readonly string[], tag: string): CfRule {
  return {
    description: `${tag} zstd`,
    expression: `(http.host in {${hosts.map((h) => `"${h}"`).join(' ')}})`,
    action: 'compress_response',
    action_parameters: { algorithms: [{ name: 'zstd' }, { name: 'brotli' }, { name: 'gzip' }] },
    enabled: true,
  };
}
