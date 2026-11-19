// Contract test: the REAL wasm core, through the host's typed adapter, on fixtures/core — every export.
// The expected values are the goldens the native Rust tests produce, so wasm and native must agree.
import { describe, expect, it } from 'vitest';
import { CORE_EXPORTS } from '../src/core/wasm.js';
import { loadWasmCore } from '../src/core/wasm.js';
import type { AuditInput, LiveObservation, LiveRequest, SiteOutput } from '../src/core/types-index.js';
import { unwrap } from '../src/core/core.js';
import { CORE_MODULE, FIXTURE_BUILD_ID, expectedJson, fixtureSiteInput, fixtureText, realCore } from './helpers/real-core.js';

const core = realCore();
const input = fixtureSiteInput(core);
const out: SiteOutput = unwrap('processSite', core.processSite(input));
const file = (name: string): string | undefined => out.files.find((f) => f.file === name)?.contents;
const htmlFileOf = (route: string): string => input.pages.find((p) => p.route === route)?.file ?? '';

function staticAuditInput(): AuditInput {
  const llms = file('llms.txt');
  return {
    config: input.config, buildId: FIXTURE_BUILD_ID,
    pages: out.pages.map((p) => ({ route: p.route, html: file(htmlFileOf(p.route)) ?? '', markdown: file(p.markdownFile) ?? '' })),
    robots: file('robots.txt') ?? '', headers: file('_headers') ?? '', sitemap: file('sitemap.xml') ?? '',
    ...(llms === undefined ? {} : { llms }),
  };
}

/** Observations that meet every expectation (mirrors crates/geoharness-audit/tests/support::observe). */
function healthy(plan: LiveRequest[]): LiveObservation[] {
  return plan.map((r) => {
    const ct = r.expect.contentType ?? 'text/html';
    const link: Record<string, string> = r.expect.contentType === 'text/html' ? { link: `<${r.url}index.md>; rel="alternate"; type="text/markdown"` }
      : r.expect.contentType === 'text/markdown' ? { link: `<${r.url}>; rel="canonical"` } : {};
    return {
      url: r.url, userAgent: r.userAgent, accept: r.accept, status: r.expect.status,
      headers: { 'content-type': ct === 'xml' ? 'application/xml' : `${ct}; charset=utf-8`, vary: 'Accept-Encoding, Accept', ...link },
      bodyPrefix: r.expect.bodyIncludes ?? '', bodySuffix: '</body></html>',
    };
  });
}

describe('real wasm core through the typed adapter', () => {
  it('exposes exactly the contract exports', async () => {
    const mod = (await import(CORE_MODULE)) as Record<string, unknown>;
    for (const name of CORE_EXPORTS) expect(typeof mod[name]).toBe('function');
    expect(() => loadWasmCore('/nonexistent/geoharness_wasm.js')).toThrow(/cannot load the GeoHarness core/);
  });

  it('parseConfig: valid fixture parses; an unknown key is config.unknown_key with its path', () => {
    expect(input.config.site.origin).toMatch(/^https:\/\//);
    const bad = core.parseConfig('[site]\nnope = 1\n');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]).toMatchObject({ code: 'config.unknown_key' });
  });

  it('processSite: files, rewrite rules, pages and warnings equal the native goldens', () => {
    for (const f of out.files) expect(f.contents, f.file).toBe(fixtureText(`expected/files/${f.file}`));
    expect(out.rewriteRules).toEqual(expectedJson('rewrite-rules.json'));
    expect(out.pages).toEqual(expectedJson('pages.json'));
    expect(out.warnings).toEqual(expectedJson('warnings.json'));
  });

  it('processSite: malformed input is input.invalid naming the bad field', () => {
    const bad = core.processSite({ ...input, pages: [{ route: '/', file: '../escape.html', html: '' }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.map((e) => e.code)).toContain('input.invalid');
  });

  it('audit: static report equals the native golden', () => {
    expect(unwrap('audit', core.audit(staticAuditInput()))).toEqual(expectedJson('audit-static.json'));
  });

  it('liveCheckPlan (config) equals the golden; audit with healthy live data never lowers the score', () => {
    const routes = out.pages.map((p) => p.route);
    const plan = unwrap('liveCheckPlan', core.liveCheckPlan({ config: input.config, routes, buildId: FIXTURE_BUILD_ID }));
    expect(plan).toEqual(expectedJson('live-plan.json'));
    const base = unwrap('audit', core.audit(staticAuditInput()));
    const live = unwrap('audit', core.audit({ ...staticAuditInput(), live: healthy(plan) }));
    expect(live.score).toBeGreaterThanOrEqual(base.score);
  });

  it('audit: a beacon at the end of the live HTML fails without the analytics opt-in and passes with it', () => {
    const routes = out.pages.map((p) => p.route);
    const plan = unwrap('liveCheckPlan', core.liveCheckPlan({ config: input.config, routes, buildId: FIXTURE_BUILD_ID }));
    const live = healthy(plan).map((o) => ({ ...o, bodySuffix: '<script src="https://static.cloudflareinsights.com/beacon.min.js/v1"></script></body>' }));
    const beacon = (config: typeof input.config): boolean | undefined =>
      unwrap('audit', core.audit({ ...staticAuditInput(), config, live })).findings.find((f) => f.checkId === 'index.live_beacon')?.passed;
    expect(beacon(input.config)).toBe(false);
    expect(beacon({ ...input.config, analytics: { cloudflareWebAnalytics: true } })).toBe(true);
  });

  it('liveCheckPlan rejects both config and origin', () => {
    const r = core.liveCheckPlan({ config: input.config, origin: 'https://example.com', routes: ['/'] });
    expect(r.ok).toBe(false);
  });

  it('auditLive: healthy observations pass; missing observations fail every check', () => {
    const origin = 'https://example.com';
    const plan = unwrap('liveCheckPlan', core.liveCheckPlan({ origin, routes: ['/'] }));
    const ok = unwrap('auditLive', core.auditLive({ origin, routes: ['/'], live: healthy(plan) }));
    expect(ok.findings.length).toBeGreaterThan(0);
    expect(ok.findings.filter((f) => f.severity === 'blocking').every((f) => f.passed)).toBe(true);
    const none = unwrap('auditLive', core.auditLive({ origin, routes: ['/'], live: [] }));
    expect(none.findings.some((f) => f.passed)).toBe(false);
  });

  it('ragInputs equals the native golden', () => {
    const html = out.pages.map((p) => ({ route: p.route, html: file(htmlFileOf(p.route)) ?? '' }));
    expect(unwrap('ragInputs', core.ragInputs({ config: input.config, pages: out.pages, html }))).toEqual(expectedJson('rag.json'));
  });
});
