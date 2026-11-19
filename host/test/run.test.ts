import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Inputs } from '../src/inputs.js';
import { runAll } from '../src/stages/index.js';
import type { StageContext } from '../src/stages/context.js';
import { startFakeCf, type FakeCf } from './helpers/cf-server.js';
import { makeContext, makeInputs, SHA } from './helpers/context.js';
import { FAKE_INDEXNOW_KEY, fakeCore, type FakeCoreOptions } from './helpers/fake-core.js';
import { copyFixture, testIO } from './helpers/io.js';
import { gitCommitAll, recordingProc, tempDir, world, type ProcCall, type SiteWorld } from './helpers/world.js';

const HOST = 'geo.example.com';
const ZONE = { id: 'zone1', name: 'example.com' };
let cf: FakeCf | undefined;
afterEach(async () => { await cf?.close(); cf = undefined; });

interface Harness { ctx: StageContext; w: SiteWorld; proc: ReturnType<typeof recordingProc>; summary: string; output: string; log: string[] }

async function harness(o: { cfState?: Parameters<typeof startFakeCf>[0]; inputs?: Partial<Inputs>; core?: FakeCoreOptions; onProc?: (c: ProcCall) => Promise<void> }): Promise<Harness> {
  const site = await copyFixture('static');
  await writeFile(join(site, 'geoharness.toml'), `[site]\norigin = "https://${HOST}"\n`);
  gitCommitAll(site);
  const stateDir = await tempDir('gh-state-');
  const summary = join(stateDir, 'summary.md');
  const output = join(stateDir, 'output.txt');
  await writeFile(summary, '');
  await writeFile(output, '');
  cf = await startFakeCf(o.cfState ?? { zones: [ZONE], workerDomains: [{ hostname: HOST, service: 'geo-site', zone_id: 'zone1' }] });
  const w = world(cf, HOST);
  const proc = recordingProc(async (c) => {
    if (c.args.includes('deploy')) w.outputDir = join(site, 'public');
    if (o.onProc !== undefined) await o.onProc(c);
  });
  const io = testIO({ http: w.http, env: { GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output }, proc });
  const inputs = makeInputs({ sitePath: site, outputDir: 'public', stateDir, ...o.inputs });
  const ctx = makeContext({ io, core: fakeCore(o.core ?? { score: 90, blockingFails: false }), inputs, cfBaseUrl: cf.baseUrl, state: {} });
  return { ctx, w, proc, summary, output, log: io.log.lines };
}

const wranglerCalls = (h: Harness): ProcCall[] => h.proc.calls.filter((c) => c.args.includes('--package=wrangler@4.156.0'));

describe('geoharness run', () => {
  it('runs every stage in order and reports', async () => {
    const h = await harness({});
    await runAll(h.ctx);

    const deploy = wranglerCalls(h);
    expect(deploy).toHaveLength(1);
    expect(deploy[0]?.command).toBe('npx');
    expect(deploy[0]?.options.env).toMatchObject({ CLOUDFLARE_API_TOKEN: 'test-token' });
    expect(deploy[0]?.options.redact).toContain('test-token');
    const config = JSON.parse(await readFile(join(h.ctx.inputs.stateDir, 'wrangler.json'), 'utf8')) as Record<string, unknown>;
    expect(config).toMatchObject({ name: 'geo-site', workers_dev: false, routes: [{ pattern: HOST, custom_domain: true }] });
    expect(config).not.toHaveProperty('main');

    expect(await readFile(join(h.ctx.inputs.sitePath, 'public', 'about', 'index.md'), 'utf8')).toContain('title: /about/');
    expect(cf?.state.rulesets['zone1:http_request_transform']).toHaveLength(3);
    expect(h.w.indexnow).toHaveLength(1);
    const submission = JSON.parse(h.w.indexnow[0]?.body ?? '{}') as { key: string; keyLocation: string; urlList: string[] };
    expect(submission.key).toBe(FAKE_INDEXNOW_KEY);
    expect(submission.keyLocation).toBe(`https://${HOST}/${FAKE_INDEXNOW_KEY}.txt`);
    expect(submission.urlList.sort()).toEqual([`https://${HOST}/`, `https://${HOST}/about/`]);

    expect(await readFile(h.output, 'utf8')).toBe(`geo-score=90\nurl=https://${HOST}/\nmarkdown-count=2\n`);
    const summary = await readFile(h.summary, 'utf8');
    expect(summary).toContain('GEO score (live): 90/100');
    expect(summary).toContain('URL Rewrite rules (geoharness:geo.example.com)');
  });

  it('stops at the audit gate, deploys nothing, and still writes the summary', async () => {
    const h = await harness({ core: { score: 50, blockingFails: false } });
    await expect(runAll(h.ctx)).rejects.toThrow(/GEO score 50 is below geo-min-score 80/);
    expect(wranglerCalls(h)).toEqual([]);
    expect(await readFile(h.summary, 'utf8')).toContain('**Failed:** audit:');
    expect(await readFile(h.output, 'utf8')).toContain('geo-score=50');
  });

  it('fails on a failed blocking finding even with a high score', async () => {
    const h = await harness({ core: { score: 100, blockingFails: true } });
    await expect(runAll(h.ctx)).rejects.toThrow(/blocking access.ai-bots-200/);
  });

  it('falls back to the negotiate Worker without zone access and warns about the quota', async () => {
    const h = await harness({ cfState: { zones: [], workerDomains: [{ hostname: HOST, service: 'geo-site', zone_id: 'z' }] } });
    await runAll(h.ctx);
    const config = JSON.parse(await readFile(join(h.ctx.inputs.stateDir, 'wrangler.json'), 'utf8')) as { main: string; assets: Record<string, unknown> };
    expect(config.assets).toMatchObject({ binding: 'ASSETS', run_worker_first: true });
    expect(await readFile(config.main, 'utf8')).toContain('import { negotiate, varyAccept } from "/action/edge/negotiate.mjs"');
    expect(h.log.some((l) => l.startsWith('WARN') && l.includes('100,000 requests/day') && l.includes('429'))).toBe(true);
    expect(cf?.requests.some((r) => r.path.includes('rulesets'))).toBe(false);
  });

  it('deploy: false builds, processes and audits, then makes no Cloudflare call and runs no wrangler', async () => {
    const h = await harness({ inputs: { deploy: false, apiToken: '', accountId: '' } });
    await runAll(h.ctx);
    expect(cf?.requests).toEqual([]);
    expect(wranglerCalls(h)).toEqual([]);
    expect(h.w.indexnow).toEqual([]);
    expect(await readFile(join(h.ctx.inputs.sitePath, 'public', 'about', 'index.md'), 'utf8')).toContain('title: /about/');
    const summary = await readFile(h.summary, 'utf8');
    expect(summary).toContain('Dry run (`deploy: false`)');
    expect(summary).toContain('GEO score (build): 90/100');
    expect(await readFile(h.output, 'utf8')).toBe('geo-score=90\nurl=\nmarkdown-count=2\n');
  });

  it('preflight names every missing permission group', async () => {
    const h = await harness({ cfState: { zones: [ZONE], denied: ['/zones/zone1/bot_management', '/zones/zone1/settings/http3'] } });
    const err = await runAll(h.ctx).catch((e: unknown) => e);
    expect(String(err)).toContain('Bot Management Write (zone)');
    expect(String(err)).toContain('Zone Settings Write (zone)');
    expect(h.proc.calls).toEqual([]);
  });

  it('opting out removes the permission requirement', async () => {
    const h = await harness({
      cfState: { zones: [ZONE], denied: ['/zones/zone1/bot_management'], workerDomains: [{ hostname: HOST, service: 'geo-site', zone_id: 'zone1' }] },
      inputs: { optimizations: new Set(['early_hints', 'http3'] as const) },
    });
    await runAll(h.ctx);
    expect(cf?.requests.some((r) => r.path.includes('bot_management'))).toBe(false);
  });

  it('verify waits for the deployed build with a bounded poll', async () => {
    const h = await harness({});
    h.w.staleLoads = 2;
    await runAll(h.ctx);
    expect(h.log.filter((l) => l.startsWith('waiting for build'))).toHaveLength(2);
  });

  it('verify gives up after its bound', async () => {
    const h = await harness({});
    h.w.staleLoads = 1000;
    await expect(runAll(h.ctx)).rejects.toThrow(/never served build abcdef012345/);
  });

  it('live audit fails when an AI crawler is refused', async () => {
    const h = await harness({});
    h.w.liveStatusFor = (ua) => (ua === 'GPTBot' ? 403 : 200);
    await expect(runAll(h.ctx)).rejects.toThrow(/live verification failed/);
  });

  it('runs the Lighthouse gate on sitemap URLs, 3 runs, median, minScore 1, capped', async () => {
    const h = await harness({
      inputs: { lighthouse: true, lighthouseMaxUrls: 1 },
      onProc: async (c) => {
        if (c.args.includes('upload')) {
          await mkdir(join(c.options.cwd, '.lighthouseci'), { recursive: true });
          await writeFile(join(c.options.cwd, '.lighthouseci', 'links.json'), JSON.stringify({ 'http://localhost:9/about/': 'https://storage.example/r1' }));
        }
      },
    });
    await runAll(h.ctx);
    const lhci = h.proc.calls.filter((c) => c.args.includes('--package=@lhci/cli@0.15.1'));
    expect(lhci.map((c) => c.args[4])).toEqual(['collect', 'upload', 'assert']);
    const rcPath = String(lhci[0]?.args[5]).replace('--config=', '');
    const rc = JSON.parse(await readFile(rcPath, 'utf8')) as { ci: { collect: { url: string[]; numberOfRuns: number }; assert: { assertions: Record<string, unknown> } } };
    expect(rc.ci.collect.numberOfRuns).toBe(3);
    expect(rc.ci.collect.url).toEqual(['http://localhost/about/']);
    expect(Object.keys(rc.ci.assert.assertions).sort()).toEqual(['categories:accessibility', 'categories:best-practices', 'categories:performance', 'categories:seo']);
    expect(rc.ci.assert.assertions['categories:seo']).toEqual(['error', { minScore: 1, aggregationMethod: 'median-run' }]);
    expect(await readFile(h.summary, 'utf8')).toContain('[report](https://storage.example/r1)');
    expect(SHA).toHaveLength(40);
  });
});
