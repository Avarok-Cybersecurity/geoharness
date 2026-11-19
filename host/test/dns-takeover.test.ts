// A domain that still has its own DNS records (the Pages → Workers migration): caught in preflight, before the
// build, and moved to the Worker host by host only when the workflow says takeover-dns: true.
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { runAll } from '../src/stages/index.js';
import { ACCOUNT } from './helpers/context.js';
import { mutations, type FakeDnsRecord } from './helpers/cf-server.js';
import { currentCf, harness, HOST, wranglerCalls, ZONE } from './helpers/harness.js';

const WWW = 'www.example.com';
const pagesCname = (name: string, id: string): FakeDnsRecord => ({ id, zone_id: ZONE.id, type: 'CNAME', name, content: 'old-site.pages.dev', proxied: true, ttl: 1 });
const MIGRATING = { zones: [ZONE], workerDomains: [], dnsRecords: [pagesCname(HOST, 'r1'), pagesCname(WWW, 'r2'), { id: 'mx', zone_id: ZONE.id, type: 'MX', name: HOST, content: 'mail.example.com', proxied: false, ttl: 1 }] };
const domains = [HOST, WWW];
const deploys = (h: Awaited<ReturnType<typeof harness>>) => wranglerCalls(h).filter((c) => c.args.includes('deploy'));

describe('preflight: a domain with its own DNS records', () => {
  it('fails before the build when takeover-dns is not stated, explaining both ways to move', async () => {
    const h = await harness({ cfState: MIGRATING, inputs: { domains } });
    const err = await runAll(h.ctx).then(() => undefined, (e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(err).toContain(`${HOST}: CNAME → old-site.pages.dev (proxied)`);
    expect(err).toContain(`${WWW}: CNAME → old-site.pages.dev (proxied)`);
    expect(err).toContain('error 100117');
    expect(err).toContain(`PUT /accounts/${ACCOUNT}/workers/domains {"hostname":"${HOST}","service":"geo-site","zone_id":"${ZONE.id}","environment":"production"}`);
    expect(err).toContain('remove each host from the Pages project');
    expect(err).toContain('takeover-dns: true');
    expect(err).not.toContain('MX');
    expect(h.proc.calls).toEqual([]);
    expect(mutations(currentCf().requests)).toEqual([]);
  });

  it('takeover-dns: false fails the same way and offers only the manual move', async () => {
    const h = await harness({ cfState: MIGRATING, inputs: { domains, takeoverDns: false } });
    await expect(runAll(h.ctx)).rejects.toThrow(/takeover-dns is false: move them by hand/);
    expect(mutations(currentCf().requests)).toEqual([]);
  });

  it('never takes a host from another Worker, even with takeover-dns: true', async () => {
    const h = await harness({ cfState: { zones: [ZONE], workerDomains: [{ hostname: HOST, service: 'other-worker', zone_id: ZONE.id }] }, inputs: { takeoverDns: true } });
    await expect(runAll(h.ctx)).rejects.toThrow(`${HOST} is a Custom Domain of another Worker, other-worker`);
    expect(mutations(currentCf().requests)).toEqual([]);
  });

  it('a host already on this Worker is not a conflict', async () => {
    const h = await harness({});
    await runAll(h.ctx);
    expect(deploys(h)).toHaveLength(1);
  });
});

describe('takeover-dns: true', () => {
  it('uploads the Worker without routes, then per host deletes the records and binds the Custom Domain back to back', async () => {
    const h = await harness({ cfState: MIGRATING, inputs: { domains, takeoverDns: true } });
    await runAll(h.ctx);
    const cf = currentCf();
    const [first, second] = deploys(h);
    const routes = async (c: typeof first) => (JSON.parse(await readFile(String(c?.args[c.args.indexOf('--config') + 1]), 'utf8')) as { routes: unknown[] }).routes;
    expect(await routes(first)).toEqual([]);
    expect(await routes(second)).toEqual([{ pattern: HOST, custom_domain: true }, { pattern: WWW, custom_domain: true }]);
    const moves = mutations(cf.requests).filter((r) => r.path.includes('dns_records') || r.path.endsWith('/workers/domains'));
    expect(moves.map((r) => `${r.method} ${r.path}`)).toEqual([
      `DELETE /zones/${ZONE.id}/dns_records/r1`, `PUT /accounts/${ACCOUNT}/workers/domains`,
      `DELETE /zones/${ZONE.id}/dns_records/r2`, `PUT /accounts/${ACCOUNT}/workers/domains`,
    ]);
    expect(moves[1]?.body).toEqual({ hostname: HOST, service: 'geo-site', zone_id: ZONE.id, environment: 'production' });
    expect(cf.state.dnsRecords.map((r) => r.id)).toEqual(['mx']);
    const summary = await readFile(h.summary, 'utf8');
    expect(summary).toContain(`${HOST}: deleted CNAME → old-site.pages.dev (proxied), now a Custom Domain of Worker geo-site`);
    expect(summary).toContain('remove these hosts from Pages project old-site');
  });

  it('puts the records back when binding the Custom Domain fails, so the host keeps being served', async () => {
    const h = await harness({ cfState: { ...MIGRATING, refuse: [{ method: 'PUT', path: `/accounts/${ACCOUNT}/workers/domains` }] }, inputs: { domains, takeoverDns: true } });
    await expect(runAll(h.ctx)).rejects.toThrow(new RegExp(`binding ${HOST.replace(/\./g, '\\.')} to Worker geo-site failed[\\s\\S]*restored its DNS records`));
    const cf = currentCf();
    expect(cf.state.dnsRecords.filter((r) => r.name === HOST && r.type === 'CNAME')).toEqual([expect.objectContaining({ content: 'old-site.pages.dev', proxied: true })]);
    expect(cf.state.dnsRecords.some((r) => r.name === WWW)).toBe(true);
    expect(deploys(h)).toHaveLength(1);
  });
});
