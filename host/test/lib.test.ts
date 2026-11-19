import { describe, expect, it } from 'vitest';
import { buildMetaContent, gateFailures } from '../src/lib/gate.js';
import { canonicalJson } from '../src/lib/json.js';
import { parseJsonc } from '../src/lib/jsonc.js';
import { allFeatureIds, featurePermissions, probePath } from '../src/lib/permissions.js';
import { OPTIMIZATION_IDS } from '../src/lib/optimizations.js';
import { changedUrls, parseSitemap } from '../src/lib/sitemap.js';
import { generateWranglerConfig } from '../src/lib/wrangler-generate.js';

const map = (entries: [string, string | undefined][]): string =>
  `<urlset>${entries.map(([l, m]) => `<url><loc>${l}</loc>${m === undefined ? '' : `<lastmod>${m}</lastmod>`}</url>`).join('')}</urlset>`;

describe('sitemap', () => {
  it('parses and decodes entries', () => {
    expect(parseSitemap(map([['https://a.com/?x=1&amp;y=2', '2026-01-01']]))).toEqual([{ loc: 'https://a.com/?x=1&y=2', lastmod: '2026-01-01' }]);
  });
  it('changed URLs are new or have a moved lastmod; all without a previous sitemap', () => {
    const prev = map([['https://a.com/', '1'], ['https://a.com/b/', '1']]);
    const next = map([['https://a.com/', '1'], ['https://a.com/b/', '2'], ['https://a.com/c/', undefined]]);
    expect(changedUrls(prev, next)).toEqual(['https://a.com/b/', 'https://a.com/c/']);
    expect(changedUrls(undefined, next)).toHaveLength(3);
  });
});

describe('gate and build meta', () => {
  it('reads the build meta in either attribute order', () => {
    expect(buildMetaContent('<meta name="build" content="abc">')).toBe('abc');
    expect(buildMetaContent("<meta content='abc' name=build>")).toBe('abc');
    expect(buildMetaContent('<meta name="builder" content="x">')).toBeUndefined();
  });
  it('ignores failed advisory findings', () => {
    const f = { checkId: 'c', title: 't', passed: false, evidence: 'e', citations: [] };
    expect(gateFailures({ score: 90, categories: [], findings: [{ ...f, severity: 'advisory' }] }, 80)).toEqual([]);
    expect(gateFailures({ score: 90, categories: [], findings: [{ ...f, severity: 'blocking' }] }, 80)).toHaveLength(1);
  });
});

describe('cloudflare-permissions.json', () => {
  it('covers every optimization and deploy feature', () => {
    for (const id of [...OPTIMIZATION_IDS, 'workers-deploy', 'workers-custom-domain', 'pages-deploy', 'pages-custom-domain', 'zone-read', 'rewrite-rules']) {
      expect(featurePermissions(id).groups.length).toBeGreaterThan(0);
    }
    expect(allFeatureIds()).toHaveLength(OPTIMIZATION_IDS.length + 6);
  });
  it('expands probe placeholders and refuses missing ones', () => {
    expect(probePath('/zones/{zone_id}/x', { zone_id: 'z' })).toBe('/zones/z/x');
    expect(() => probePath('/zones/{zone_id}/x', {})).toThrow(/needs zone_id/);
  });
});

describe('small parsers', () => {
  it('jsonc keeps // inside strings', () => {
    expect(parseJsonc('{ "u": "https://x//y", /* c */ "a": [1,], // t\n }')).toEqual({ u: 'https://x//y', a: [1] });
  });
  it('canonical JSON ignores key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
  it('generated wrangler config is assets-only unless negotiating', () => {
    const base = { name: 'n', outputDir: '/o', domains: ['a.com'], notFoundHandling: '404-page' as const };
    expect(generateWranglerConfig({ ...base, main: undefined })).not.toHaveProperty('main');
    expect(generateWranglerConfig({ ...base, main: '/m.mjs' })).toMatchObject({ main: '/m.mjs', assets: { run_worker_first: true, binding: 'ASSETS' } });
  });
});
