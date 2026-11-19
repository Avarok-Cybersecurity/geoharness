import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProcResult } from '../src/io/types.js';
import { runAll } from '../src/stages/index.js';
import { SHA } from './helpers/context.js';
import { CF_WITH_VERSION, currentCf, harness, HOST, wranglerCalls, ZONE, type Harness } from './helpers/harness.js';
import type { ProcCall } from './helpers/world.js';

const LHCI = '--package=@lhci/cli@0.16.1';
const lhciCalls = (h: Harness): ProcCall[] => h.proc.calls.filter((c) => c.args.includes(LHCI));
const configArg = (c: ProcCall | undefined): string => String(c?.args.find((a) => a.startsWith('--config='))).replace('--config=', '');

/** An lhr whose SEO category scored `seo`, with robots-txt failing when it is below 1. */
function lhr(url: string, seo: number): string {
  const robots = { id: 'robots-txt', title: 'robots.txt is valid', score: seo < 1 ? 0 : 1, explanation: 'Lighthouse was unable to download a robots.txt file' };
  const cat = (score: number, refs: unknown[]): unknown => ({ score, auditRefs: refs });
  return JSON.stringify({
    requestedUrl: url,
    categories: { performance: cat(1, []), accessibility: cat(1, []), 'best-practices': cat(1, []), seo: cat(seo, [{ id: 'robots-txt', weight: 1 }]) },
    audits: { 'robots-txt': robots },
  });
}

/** lhci stand-in: collect writes 3 lhrs per URL (SEO from `seoFor`), upload writes links, assert fails below 100. */
function lhci(seoFor: (url: string) => number): (c: ProcCall) => Promise<ProcResult | undefined> {
  return async (c) => {
    if (!c.args.includes(LHCI)) return undefined;
    const dir = join(c.options.cwd, '.lighthouseci');
    const rc = JSON.parse(await readFile(configArg(c), 'utf8')) as { ci: { collect: { url: string[] } } };
    const urls = rc.ci.collect.url;
    await mkdir(dir, { recursive: true });
    if (c.args.includes('collect')) {
      for (const [i, u] of urls.entries()) for (const r of [0, 1, 2]) await writeFile(join(dir, `lhr-${i}${r}.json`), lhr(u, seoFor(u)));
    }
    if (c.args.includes('upload')) await writeFile(join(dir, 'links.json'), JSON.stringify(Object.fromEntries(urls.map((u) => [u, `https://storage.example${new URL(u).pathname}`]))));
    if (c.args.includes('assert')) return { code: urls.some((u) => seoFor(u) < 1) ? 1 : 0, stdout: '', stderr: '' };
    return undefined;
  };
}

describe('pre-deploy Lighthouse gate (local wrangler server)', () => {
  it('serves the deploy config with wrangler dev --local, audits 127.0.0.1 URLs, then stops the server', async () => {
    const h = await harness({ inputs: { lighthouse: true, lighthouseMaxUrls: 1 }, onProc: lhci(() => 1) });
    await runAll(h.ctx);
    const dev = h.proc.calls.find((c) => c.args.includes('dev'));
    const deploy = wranglerCalls(h).find((c) => c.args.includes('deploy'));
    expect(dev?.args).toEqual(expect.arrayContaining(['dev', '--local', '--infer-origin-from-routes=false', '--ip', '127.0.0.1', '--show-interactive-dev-session=false']));
    const devConfig = dev?.args[dev.args.indexOf('--config') + 1];
    expect(devConfig).toBe(deploy?.args[deploy.args.indexOf('--config') + 1]);
    expect(dev?.options.env).toEqual({ WRANGLER_SEND_METRICS: 'false' });
    expect(dev?.options.cwd.startsWith(h.ctx.inputs.stateDir)).toBe(true);
    expect(h.proc.started).toBe(1);
    expect(h.proc.stopped).toBe(1);
    const collects = lhciCalls(h).filter((c) => c.args.includes('collect'));
    expect(collects).toHaveLength(2);
    const local = JSON.parse(await readFile(configArg(collects[0]), 'utf8')) as { ci: { collect: Record<string, unknown> } };
    expect(local.ci.collect.url).toEqual([expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/about\/$/)]);
    expect(local.ci.collect).not.toHaveProperty('staticDistDir');
    const live = JSON.parse(await readFile(configArg(collects[1]), 'utf8')) as { ci: { collect: { url: string[] } } };
    expect(live.ci.collect.url).toEqual([`https://${HOST}/about/`]);
    expect(lhciCalls(h)[1]?.options.env).toEqual({ LHCI_BUILD_CONTEXT__CURRENT_HASH: SHA });
    const summary = await readFile(h.summary, 'utf8');
    expect(summary).toContain('### Lighthouse (live)');
    expect(summary).toContain('[report](https://storage.example/about/)');
    expect(summary).toContain('| Page | Performance | Accessibility | Best practices | SEO | Failing audits |');
    expect(summary).toMatch(/\| \/about\/ \| 100 \| 100 \| 100 \| 100 \| — \|/);
  });

  it('fails before deploy, lists the failing audits, and still stops the server', async () => {
    const h = await harness({ inputs: { lighthouse: true, lighthouseMaxUrls: 1 }, onProc: lhci((u) => (u.startsWith('http://127.0.0.1') ? 0.92 : 1)) });
    await expect(runAll(h.ctx)).rejects.toThrow(/Lighthouse gate failed[\s\S]*seo 92 — robots-txt \(robots.txt is valid\): Lighthouse was unable to download a robots.txt file/);
    expect(wranglerCalls(h).some((c) => c.args.includes('deploy'))).toBe(false);
    expect(h.proc.stopped).toBe(1);
    expect(await readFile(h.summary, 'utf8')).toContain('| seo | 92 | robots-txt (robots.txt is valid)');
    expect(await readFile(h.summary, 'utf8')).toMatch(/\| \/about\/ \| 100 \| 100 \| 100 \| 92 \| `robots-txt` \|/);
  });

  it('fails clearly when the local server never becomes ready, and stops it', async () => {
    const h = await harness({ inputs: { lighthouse: true, lighthouseMaxUrls: 1 }, onProc: lhci(() => 1) });
    h.w.localDir = undefined;
    const start = h.proc.start.bind(h.proc);
    h.proc.start = (cmd, args, opts) => { const r = start(cmd, args, opts); h.w.localDir = undefined; return r; };
    await expect(runAll(h.ctx)).rejects.toThrow(/local server did not serve http:\/\/127\.0\.0\.1:\d+\/about\/ within 180s/);
    expect(h.proc.stopped).toBe(1);
    expect(lhciCalls(h)).toEqual([]);
  });
});

describe('post-deploy Lighthouse gate and rollback', () => {
  const liveFails = lhci((u) => (u.startsWith('https://') ? 0.92 : 1));

  it('rolls the Worker back to the version recorded before deploy, then fails with the audits', async () => {
    const h = await harness({ cfState: CF_WITH_VERSION, inputs: { lighthouse: true, lighthouseMaxUrls: 1 }, onProc: liveFails });
    await expect(runAll(h.ctx)).rejects.toThrow(/Lighthouse on the live site is below 100[\s\S]*robots-txt[\s\S]*Rolled back: rolled Worker geo-site back to version v-prev/);
    const rollback = wranglerCalls(h).find((c) => c.args.includes('rollback'));
    expect(rollback?.args.slice(4)).toEqual(['rollback', 'v-prev', '--name', 'geo-site', '--message', `geoharness: post-deploy verification failed (${SHA.slice(0, 12)})`, '--yes']);
    expect(rollback?.options.env).toMatchObject({ CLOUDFLARE_API_TOKEN: 'test-token' });
    const summary = await readFile(h.summary, 'utf8');
    expect(summary).toContain('**Rollback:** rolled Worker geo-site back to version v-prev');
    expect(summary).toContain(`| https://${HOST}/about/ | seo | 92 |`);
    expect(h.w.indexnow).toEqual([]);
  });

  it('a first deploy has nothing to roll back to and just fails', async () => {
    const h = await harness({ inputs: { lighthouse: true, lighthouseMaxUrls: 1 }, onProc: liveFails });
    await expect(runAll(h.ctx)).rejects.toThrow(/NOT rolled back: first deploy of Worker geo-site/);
    expect(wranglerCalls(h).some((c) => c.args.includes('rollback'))).toBe(false);
  });

  it('a Pages → Workers migration\'s first run does not "roll back" to the Worker\'s earlier failed upload', async () => {
    const cfState = { zones: [ZONE], workerDomains: [], workerDeployments: CF_WITH_VERSION.workerDeployments };
    const h = await harness({ cfState, inputs: { lighthouse: true, lighthouseMaxUrls: 1 }, onProc: liveFails });
    await expect(runAll(h.ctx)).rejects.toThrow(/NOT rolled back: no prior production version on Worker geo-site/);
    expect(wranglerCalls(h).some((c) => c.args.includes('rollback'))).toBe(false);
    expect(await readFile(h.summary, 'utf8')).toContain('is not something GeoHarness can roll back to');
  });

  it('rollback-on-failure: false leaves the build live and says so', async () => {
    const h = await harness({ cfState: CF_WITH_VERSION, inputs: { lighthouse: true, lighthouseMaxUrls: 1, rollbackOnFailure: false }, onProc: liveFails });
    await expect(runAll(h.ctx)).rejects.toThrow(/rollback-on-failure is false: the failing build stays live/);
    expect(wranglerCalls(h).some((c) => c.args.includes('rollback'))).toBe(false);
    expect(currentCf().requests.some((r) => r.path.endsWith('/deployments'))).toBe(true);
  });

  it('a failed live GEO audit rolls back too', async () => {
    const h = await harness({ cfState: CF_WITH_VERSION });
    h.w.liveStatusFor = (ua) => (ua === 'GPTBot' ? 403 : 200);
    await expect(runAll(h.ctx)).rejects.toThrow(/live verification failed[\s\S]*Rolled back/);
  });
});
