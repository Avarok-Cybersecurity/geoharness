// Every domain gets its own rewrite rules, so the zone's URL Rewrite budget (10 on Free) is checked before deploy,
// counting the zone's other rules; and every domain must be in the zone whose rules GeoHarness writes.
import { describe, expect, it } from 'vitest';
import { runAll } from '../src/stages/index.js';
import { mutations } from './helpers/cf-server.js';
import { currentCf, harness, HOST, wranglerCalls, ZONE } from './helpers/harness.js';

const WWW = 'www.example.com';
const bound = [HOST, WWW].map((hostname) => ({ hostname, service: 'geo-site', zone_id: ZONE.id }));
const foreign = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, description: `site rule ${i}`, expression: 'true', action: 'rewrite', enabled: true }));
const zoneWith = (plan: string, others: number) => ({
  zones: [{ ...ZONE, plan: { legacy_id: plan } }], workerDomains: bound,
  rulesets: { [`${ZONE.id}:http_request_transform`]: foreign(others) },
});

describe('URL Rewrite budget', () => {
  it('fails before uploading when the zone\'s other rules plus 3 per domain exceed the Free plan\'s 10', async () => {
    const h = await harness({ cfState: zoneWith('free', 5), inputs: { domains: [HOST, WWW] } });
    const err = await runAll(h.ctx).then(() => '', (e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(err).toContain(`zone ${ZONE.name} (free plan) allows 10 URL Rewrite rules`);
    expect(err).toContain('6 for 2 domains');
    expect(err).toContain('5 other rules (site rule 0, site rule 1, site rule 2, site rule 3, site rule 4)');
    expect(err).toContain('11');
    expect(wranglerCalls(h).filter((c) => c.args.includes('deploy'))).toEqual([]);
    expect(mutations(currentCf().requests)).toEqual([]);
  });

  it('deploys when they fit, and writes both hosts\' rules', async () => {
    const h = await harness({ cfState: zoneWith('free', 4), inputs: { domains: [HOST, WWW] } });
    await runAll(h.ctx);
    const rules = currentCf().state.rulesets[`${ZONE.id}:http_request_transform`] ?? [];
    expect(rules).toHaveLength(10);
    expect(rules.filter((r) => String(r.description).startsWith(`geoharness:${WWW} `))).toHaveLength(3);
  });

  it('a larger plan allows more', async () => {
    const h = await harness({ cfState: zoneWith('pro', 15), inputs: { domains: [HOST, WWW] } });
    await runAll(h.ctx);
  });
});

describe('preflight: every domain in the zone', () => {
  it('fails before the build when a domain is served by another zone', async () => {
    const h = await harness({ cfState: { zones: [ZONE, { id: 'zone2', name: 'example.org' }], workerDomains: bound }, inputs: { domains: [HOST, 'www.example.org'] } });
    await expect(runAll(h.ctx)).rejects.toThrow(`www.example.org is not in zone ${ZONE.name}`);
    expect(h.proc.calls).toEqual([]);
  });
});
