import type { CfRule } from '../io/cloudflare/rulesets.js';
import { canonicalJson } from './json.js';

/** `geoharness:<host>` — the only marker by which GeoHarness recognises rules it owns. */
export function ruleTag(host: string): string {
  return `geoharness:${host}`;
}

/** True when the description starts with the tag and the host name ends there (so a.com never owns a.com.evil). */
export function isTagged(description: unknown, tag: string): boolean {
  if (typeof description !== 'string' || !description.startsWith(tag)) return false;
  const next = description.charAt(tag.length);
  return next === '' || !/[a-z0-9.-]/i.test(next);
}

const COMPARED = ['description', 'expression', 'action', 'action_parameters', 'enabled'] as const;

function fingerprint(rule: CfRule): string {
  const picked: Record<string, unknown> = {};
  for (const k of COMPARED) picked[k] = rule[k];
  return canonicalJson(picked);
}

export interface RulePlan { changed: boolean; rules: CfRule[]; added: number; removed: number; others: CfRule[] }

/**
 * Replaces only the rules tagged for these hosts. Every other rule is kept verbatim and in place;
 * ours are appended in the desired order. No change is planned when ours already match exactly.
 */
export function planTaggedRules(existing: CfRule[] | undefined, desired: CfRule[], tags: readonly string[]): RulePlan {
  const owned = (description: unknown): boolean => tags.some((t) => isTagged(description, t));
  for (const d of desired) {
    if (!owned(d.description)) throw new Error(`desired rule "${String(d.description)}" is not tagged ${tags.join(' or ')}`);
  }
  const current = existing ?? [];
  const ours = current.filter((r) => owned(r.description));
  const others = current.filter((r) => !owned(r.description));
  const same = ours.length === desired.length && ours.every((r, i) => {
    const d = desired[i];
    return d !== undefined && fingerprint(r) === fingerprint(d);
  });
  if (same) return { changed: false, rules: current, added: 0, removed: 0, others };
  return { changed: true, rules: [...others, ...desired], added: desired.length, removed: ours.length, others };
}
