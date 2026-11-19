import { asObject, asString, isObject } from '../../lib/json.js';
import type { CfClient } from './client.js';

/** `plan`: the plan's legacy id (free, pro, business, enterprise) when Cloudflare states one. */
export interface Zone { id: string; name: string; plan: string | undefined }

/** Candidate zone names for a host, longest first: a.b.example.com → b.example.com → example.com. */
export function zoneCandidates(host: string): string[] {
  const labels = host.toLowerCase().split('.');
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i += 1) out.push(labels.slice(i).join('.'));
  return out;
}

export async function findZoneForHost(cf: CfClient, host: string): Promise<Zone | undefined> {
  for (const name of zoneCandidates(host)) {
    const items = await cf.list(`/zones?name=${encodeURIComponent(name)}`, 5);
    const first = items[0];
    if (first !== undefined) {
      const z = asObject(first, 'zone');
      const plan = isObject(z.plan) && typeof z.plan.legacy_id === 'string' ? z.plan.legacy_id : undefined;
      return { id: asString(z.id, 'zone.id'), name: asString(z.name, 'zone.name'), plan };
    }
  }
  return undefined;
}
