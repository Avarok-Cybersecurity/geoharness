import type { Zone } from '../io/cloudflare/zones.js';
import type { RulePlan } from './tagged-rules.js';

/** URL Rewrite (Transform) rules per zone by plan (`cf-transform-rules`). */
export const REWRITE_RULE_LIMITS: Readonly<Record<string, number>> = { free: 10, pro: 25, business: 50, enterprise: 300 };

/** Why the planned rules would not fit the zone's plan; undefined when they fit or the plan is not known. */
export function ruleBudgetProblem(zone: Zone, plan: RulePlan, domains: number): string | undefined {
  const limit = zone.plan === undefined ? undefined : REWRITE_RULE_LIMITS[zone.plan];
  if (limit === undefined) return undefined;
  const ours = plan.rules.length - plan.others.length;
  if (plan.rules.length <= limit) return undefined;
  const names = plan.others.map((r) => (typeof r.description === 'string' && r.description !== '' ? r.description : (typeof r.id === 'string' ? r.id : '?')));
  return `zone ${zone.name} (${zone.plan} plan) allows ${limit} URL Rewrite rules, but this deploy needs ${plan.rules.length}: ` +
    `GeoHarness's ${ours} for ${domains} domains (3 each) plus the zone's ${plan.others.length} other rules (${names.join(', ')}). ` +
    'Remove rules you no longer need, or list fewer domains (each one gets its own rules), and rerun. Nothing was deployed.';
}
