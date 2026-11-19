import raw from '../../../cloudflare-permissions.json' with { type: 'json' };
import { asArray, asObject, asString } from './json.js';

export interface PermissionGroup { name: string; scope: 'account' | 'zone' }
export interface FeaturePermissions { description: string; groups: PermissionGroup[]; probe: string }

function parse(u: unknown): Map<string, FeaturePermissions> {
  const features = asObject(asObject(u, 'cloudflare-permissions.json').features, 'features');
  const out = new Map<string, FeaturePermissions>();
  for (const [id, value] of Object.entries(features)) {
    const f = asObject(value, `features.${id}`);
    const groups = asArray(f.groups, `features.${id}.groups`).map((g, i) => {
      const o = asObject(g, `features.${id}.groups[${i}]`);
      const scope = asString(o.scope, 'scope');
      if (scope !== 'account' && scope !== 'zone') throw new Error(`features.${id}: bad scope ${scope}`);
      return { name: asString(o.name, 'name'), scope } satisfies PermissionGroup;
    });
    out.set(id, { description: asString(f.description, 'description'), groups, probe: asString(f.probe, 'probe') });
  }
  return out;
}

const FEATURES = parse(raw);

export function featurePermissions(id: string): FeaturePermissions {
  const f = FEATURES.get(id);
  if (f === undefined) throw new Error(`cloudflare-permissions.json has no feature "${id}"`);
  return f;
}

export function allFeatureIds(): string[] {
  return [...FEATURES.keys()];
}

/** Expands {account_id}, {zone_id}, {zone_name}; a placeholder without a value is an error. */
export function probePath(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
    const v = values[key];
    if (v === undefined) throw new Error(`probe ${template} needs ${key}`);
    return encodeURIComponent(v);
  });
}
