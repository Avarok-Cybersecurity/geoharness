import type { CfRule } from './rulesets.js';

/** Compression Rule preferring zstd, then brotli, then gzip, for one host (phase http_response_compression). */
export function zstdCompressionRule(host: string, tag: string): CfRule {
  return {
    description: `${tag} zstd`,
    expression: `(http.host eq "${host}")`,
    action: 'compress_response',
    action_parameters: { algorithms: [{ name: 'zstd' }, { name: 'brotli' }, { name: 'gzip' }] },
    enabled: true,
  };
}
