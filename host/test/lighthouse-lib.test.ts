import { describe, expect, it } from 'vitest';
import { LIGHTHOUSE_CATEGORIES, lighthouseRc, lighthouseUrls } from '../src/lib/lighthouse-rc.js';
import { lighthouseFailures, lighthouseMedians } from '../src/lib/lighthouse-report.js';

const SITEMAP = '<urlset><url><loc>https://geo.example.com/</loc></url><url><loc>https://geo.example.com/docs/</loc></url><url><loc>https://geo.example.com/a/</loc></url></urlset>';

const PAGES = ['/', '/docs/', '/a/'];
const MIXED = '<urlset><url><loc>https://geo.example.com/</loc></url><url><loc>https://geo.example.com/llms.txt</loc></url><url><loc>https://geo.example.com/app/</loc></url><url><loc>https://geo.example.com/docs/</loc></url><url><loc>https://geo.example.com/a/</loc></url></urlset>';

describe('lighthouseUrls', () => {
  it('maps sitemap paths onto the audited origin, capped', () => {
    expect(lighthouseUrls(SITEMAP, PAGES, 'http://127.0.0.1:8787', 2)).toEqual(['http://127.0.0.1:8787/', 'http://127.0.0.1:8787/docs/']);
    expect(lighthouseUrls(SITEMAP, PAGES, 'https://geo.example.com', 5)).toHaveLength(3);
  });

  it('audits only processed pages, in sitemap order: not llms.txt, not an excluded page', () => {
    expect(lighthouseUrls(MIXED, PAGES, 'https://geo.example.com', 2)).toEqual(['https://geo.example.com/', 'https://geo.example.com/docs/']);
    expect(lighthouseUrls(MIXED, ['/a/', '/'], '', 5)).toEqual(['/', '/a/']);
  });
});

describe('lighthouseRc', () => {
  it('collects the given URLs (no static server), 3 runs, median, minScore 1 in all four categories', () => {
    const rc = lighthouseRc(['http://127.0.0.1:1/']) as { ci: { collect: Record<string, unknown>; assert: { assertions: Record<string, unknown> } } };
    expect(rc.ci.collect).toEqual({ url: ['http://127.0.0.1:1/'], numberOfRuns: 3 });
    expect(rc.ci.collect).not.toHaveProperty('staticDistDir');
    expect(Object.keys(rc.ci.assert.assertions).sort()).toEqual(LIGHTHOUSE_CATEGORIES.map((c) => `categories:${c}`).sort());
    expect(rc.ci.assert.assertions['categories:seo']).toEqual(['error', { minScore: 1, aggregationMethod: 'median-run' }]);
  });
});

function lhr(url: string, seo: number, robots: number | null, perf = 1): unknown {
  return {
    requestedUrl: url,
    categories: {
      performance: { score: perf, auditRefs: [{ id: 'lcp', weight: 25 }] },
      accessibility: { score: 1, auditRefs: [] },
      'best-practices': { score: 1, auditRefs: [{ id: 'errors-in-console', weight: 1 }] },
      seo: { score: seo, auditRefs: [{ id: 'robots-txt', weight: 1 }, { id: 'manual', weight: 0 }] },
    },
    audits: {
      lcp: { id: 'lcp', title: 'LCP', score: perf },
      'errors-in-console': { id: 'errors-in-console', title: 'No console errors', score: 1 },
      'robots-txt': { id: 'robots-txt', title: 'robots.txt is valid', score: robots, explanation: 'Lighthouse was unable to download a robots.txt file' },
      manual: { id: 'manual', title: 'manual', score: 0 },
    },
  };
}

describe('lighthouseFailures', () => {
  it('lists median category scores below 100 with the weighted audits that failed in most runs', () => {
    const url = 'https://geo.example.com/';
    const failures = lighthouseFailures([lhr(url, 0.92, 0), lhr(url, 0.92, 0), lhr(url, 1, 1)]);
    expect(failures).toEqual([{
      url, category: 'seo', score: 92,
      audits: ['robots-txt (robots.txt is valid): Lighthouse was unable to download a robots.txt file'],
    }]);
  });

  it('is empty when every median is 100, even if one run dipped', () => {
    const url = 'https://geo.example.com/docs/';
    expect(lighthouseFailures([lhr(url, 1, 1, 0.97), lhr(url, 1, 1), lhr(url, 1, 1)])).toEqual([]);
  });

  it('rejects a report that is not a Lighthouse result', () => {
    expect(() => lighthouseMedians([{ nope: true }])).toThrow(/requestedUrl/);
    expect(() => lighthouseFailures([{ nope: true }])).toThrow(/requestedUrl/);
  });
});

describe('lighthouseMedians', () => {
  it('gives every audited URL its median score per category and the ids of audits failing in most runs', () => {
    const a = 'https://geo.example.com/';
    const b = 'https://geo.example.com/docs/';
    expect(lighthouseMedians([lhr(a, 0.92, 0, 0.97), lhr(a, 0.92, 0), lhr(a, 1, 1), lhr(b, 1, 1), lhr(b, 1, 1), lhr(b, 1, 1)])).toEqual([
      { url: a, scores: { performance: 100, accessibility: 100, 'best-practices': 100, seo: 92 }, failingAudits: ['robots-txt'] },
      { url: b, scores: { performance: 100, accessibility: 100, 'best-practices': 100, seo: 100 }, failingAudits: [] },
    ]);
  });
});
