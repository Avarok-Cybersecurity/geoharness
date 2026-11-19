import { asArray, asObject, type JsonObject } from '../../lib/json.js';
import { CloudflareApiError, type CfClient } from './client.js';

export type RulesetPhase = 'http_request_transform' | 'http_response_compression';

/** Rules as Cloudflare returns them; foreign rules are carried verbatim. */
export type CfRule = JsonObject;

/** Fields Cloudflare computes; they must not be sent back on PUT. */
const READ_ONLY_RULE_FIELDS = ['version', 'last_updated', 'categories'];

export function writableRule(rule: CfRule): CfRule {
  const out: CfRule = {};
  for (const [k, v] of Object.entries(rule)) if (!READ_ONLY_RULE_FIELDS.includes(k)) out[k] = v;
  return out;
}

/** undefined when the zone has no entrypoint ruleset for the phase yet (Cloudflare answers 404). */
export async function getEntrypointRules(cf: CfClient, zoneId: string, phase: RulesetPhase): Promise<CfRule[] | undefined> {
  try {
    const result = asObject(await cf.call('GET', `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`), 'ruleset');
    const rules = result.rules === undefined ? [] : asArray(result.rules, 'ruleset.rules');
    return rules.map((r, i) => asObject(r, `ruleset.rules[${i}]`));
  } catch (e) {
    if (e instanceof CloudflareApiError && e.status === 404) return undefined;
    throw e;
  }
}

/** PUT creates the entrypoint when absent and replaces its rule list otherwise. */
export async function putEntrypointRules(cf: CfClient, zoneId: string, phase: RulesetPhase, rules: CfRule[]): Promise<void> {
  await cf.call('PUT', `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`, { rules: rules.map(writableRule) });
}
