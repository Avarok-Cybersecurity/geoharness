import { afterEach, describe, expect, it } from 'vitest';
import { CfClient, CloudflareApiError } from '../src/io/cloudflare/client.js';
import { getEntrypointRules } from '../src/io/cloudflare/rulesets.js';
import { findZoneForHost, zoneCandidates } from '../src/io/cloudflare/zones.js';
import { nodeHttp } from '../src/io/node/http.js';
import { isTagged, planTaggedRules } from '../src/lib/tagged-rules.js';
import { zoneStage } from '../src/stages/zone.js';
import { mutations, startFakeCf, type FakeCf } from './helpers/cf-server.js';
import { ACCOUNT, makeContext, makeInputs } from './helpers/context.js';
import { fakeCore, sampleConfig } from './helpers/fake-core.js';
import { testIO } from './helpers/io.js';

const ZONE = { id: 'zone1', name: 'example.com' };
const FOREIGN = {
  id: 'keep-me', version: '3', last_updated: 'yesterday', description: 'site owner: legacy rewrite',
  expression: '(http.request.uri.path eq "/old")', action: 'rewrite',
  action_parameters: { uri: { path: { value: '/new' } } }, enabled: true,
};
const OTHER_HOST = { ...FOREIGN, id: 'other-host', description: 'geoharness:geo.example.com.evil dir' };

let cf: FakeCf | undefined;
afterEach(async () => { await cf?.close(); cf = undefined; });

async function zoneRun(fake: FakeCf): Promise<void> {
  const io = testIO({ http: nodeHttp, env: {} });
  const core = fakeCore({ score: 90, blockingFails: false });
  const config = sampleConfig('https://geo.example.com');
  const processed = core.processSite({ config, buildId: 'x', env: {}, pages: [{ route: '/', file: 'index.html', html: '<head></head>' }], existing: {} });
  if (!processed.ok) throw new Error('fake core failed');
  const ctx = makeContext({
    io, core, inputs: makeInputs({}), cfBaseUrl: fake.baseUrl,
    state: {
      config,
      access: { zone: ZONE, negotiation: 'rules', optimizations: ['email_obfuscation', 'early_hints', 'smart_tiered_cache', 'zstd', 'bot_fight_mode', 'ai_bots_protection'] },
      build: { outputDir: '/out', notFoundHandling: '404-page' },
      processed: { pages: processed.value.pages, rewriteRules: processed.value.rewriteRules, warnings: [], files: [] },
    },
  });
  await zoneStage(ctx);
}

describe('zone stage against the recording Cloudflare API', () => {
  const domains = [{ hostname: 'geo.example.com', service: 'geo-site', zone_id: 'zone1' }];

  it('creates the transform entrypoint via PUT when it does not exist', async () => {
    cf = await startFakeCf({ zones: [ZONE], workerDomains: domains });
    await zoneRun(cf);
    const put = cf.requests.find((r) => r.method === 'PUT' && r.path.endsWith('http_request_transform/entrypoint'));
    expect(put).toBeDefined();
    const rules = cf.state.rulesets['zone1:http_request_transform'] ?? [];
    expect(rules.map((r) => r.description)).toEqual(['geoharness:geo.example.com dir', 'geoharness:geo.example.com bare', 'geoharness:geo.example.com html']);
    expect(rules[0]?.action_parameters).toEqual({ uri: { path: { expression: 'concat(http.request.uri.path, "dir")' } } });
  });

  it('preserves rules that are not tagged geoharness:<host>, verbatim and without read-only fields sent back', async () => {
    cf = await startFakeCf({ zones: [ZONE], workerDomains: domains, rulesets: { 'zone1:http_request_transform': [FOREIGN, OTHER_HOST] } });
    await zoneRun(cf);
    const put = cf.requests.find((r) => r.method === 'PUT' && r.path.endsWith('http_request_transform/entrypoint'));
    const sent = (put?.body as { rules: Record<string, unknown>[] }).rules;
    expect(sent[0]).toEqual({ ...FOREIGN, version: undefined, last_updated: undefined });
    expect(sent[0]).not.toHaveProperty('version');
    expect(sent[1]?.id).toBe('other-host');
    expect(sent).toHaveLength(5);
  });

  it('is idempotent: a second run makes zero changes', async () => {
    cf = await startFakeCf({ zones: [ZONE], workerDomains: domains, rulesets: { 'zone1:http_request_transform': [FOREIGN] } });
    await zoneRun(cf);
    const first = mutations(cf.requests).length;
    expect(first).toBeGreaterThan(0);
    cf.requests.length = 0;
    await zoneRun(cf);
    expect(mutations(cf.requests)).toEqual([]);
  });

  it('applies settings, tiered cache, zstd and bot management only where they differ', async () => {
    cf = await startFakeCf({ zones: [ZONE], workerDomains: domains, settings: { 'zone1:early_hints': 'on', 'zone1:email_obfuscation': 'on' } });
    await zoneRun(cf);
    const paths = mutations(cf.requests).map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('PATCH /zones/zone1/settings/email_obfuscation');
    expect(paths).not.toContain('PATCH /zones/zone1/settings/early_hints');
    expect(paths).toContain('PATCH /zones/zone1/cache/tiered_cache_smart_topology_enable');
    expect(paths).toContain('PUT /zones/zone1/rulesets/phases/http_response_compression/entrypoint');
    expect(paths).toContain('PUT /zones/zone1/bot_management');
    expect(cf.state.bot['zone1']).toMatchObject({ fight_mode: false, ai_bots_protection: 'disabled' });
    expect(cf.state.settings['zone1:email_obfuscation']).toBe('off');
  });

  it('fails when a domain is not attached to the Worker after deploy', async () => {
    cf = await startFakeCf({ zones: [ZONE], workerDomains: [] });
    await expect(zoneRun(cf)).rejects.toThrow(/not a Custom Domain of Worker geo-site/);
  });
});

describe('Cloudflare client', () => {
  it('carries Cloudflare error codes', async () => {
    cf = await startFakeCf({ zones: [ZONE], denied: ['/zones/zone1/rulesets'] });
    const client = new CfClient({ http: nodeHttp, token: 'test-token', baseUrl: cf.baseUrl, timeoutMs: 5000 });
    const err = await getEntrypointRules(client, 'zone1', 'http_request_transform').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloudflareApiError);
    expect((err as CloudflareApiError).codes).toEqual([10000]);
    expect((err as CloudflareApiError).status).toBe(403);
    expect(String(err)).toContain('10000: Authentication error');
  });

  it('finds the zone by walking up the host name', async () => {
    cf = await startFakeCf({ zones: [ZONE] });
    const client = new CfClient({ http: nodeHttp, token: 'test-token', baseUrl: cf.baseUrl, timeoutMs: 5000 });
    expect(zoneCandidates('a.geo.example.com')).toEqual(['a.geo.example.com', 'geo.example.com', 'example.com']);
    expect(await findZoneForHost(client, 'a.geo.example.com')).toEqual(ZONE);
    expect(await findZoneForHost(client, 'other.org')).toBeUndefined();
    expect(cf.requests.every((r) => r.method === 'GET')).toBe(true);
    expect(ACCOUNT).toHaveLength(32);
  });
});

describe('tagged rule planning', () => {
  it('only owns its exact host', () => {
    expect(isTagged('geoharness:geo.example.com dir', 'geoharness:geo.example.com')).toBe(true);
    expect(isTagged('geoharness:geo.example.com', 'geoharness:geo.example.com')).toBe(true);
    expect(isTagged('geoharness:geo.example.com.evil dir', 'geoharness:geo.example.com')).toBe(false);
    expect(isTagged('geoharness:geo.example.comx', 'geoharness:geo.example.com')).toBe(false);
    expect(isTagged(undefined, 'geoharness:geo.example.com')).toBe(false);
  });

  it('refuses to write an untagged rule', () => {
    expect(() => planTaggedRules([], [{ description: 'mine' }], 'geoharness:a.com')).toThrow(/not tagged/);
  });

  it('plans nothing for an absent entrypoint with nothing to write', () => {
    expect(planTaggedRules(undefined, [], 'geoharness:a.com').changed).toBe(false);
  });
});
