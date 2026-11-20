import { parseSitemap } from './sitemap.js';

export const LIGHTHOUSE_RUNS = 3;
export const LIGHTHOUSE_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const;

/**
 * The first `max` sitemap paths that are `pageRoutes` (the pages GeoHarness processed), in sitemap order, on
 * `origin` (the local server before deploy, the live site after). A sitemap may list llms.txt or excluded routes;
 * Lighthouse refuses anything that is not HTML.
 */
export function lighthouseUrls(sitemapXml: string, pageRoutes: readonly string[], origin: string, max: number): string[] {
  const pages = new Set(pageRoutes);
  return parseSitemap(sitemapXml)
    .map((e) => new URL(e.loc).pathname)
    .filter((path) => pages.has(path))
    .slice(0, max)
    .map((path) => `${origin}${path}`);
}

/**
 * lighthouserc for `urls`, served by someone else (wrangler dev locally, Cloudflare live): lhci's own static
 * server ignores _headers, html_handling and not_found handling, so it never audits what production serves.
 */
export function lighthouseRc(urls: string[]): unknown {
  const assertion = ['error', { minScore: 1, aggregationMethod: 'median-run' }];
  return {
    ci: {
      collect: { url: urls, numberOfRuns: LIGHTHOUSE_RUNS },
      assert: { assertions: Object.fromEntries(LIGHTHOUSE_CATEGORIES.map((c) => [`categories:${c}`, assertion])) },
      upload: { target: 'temporary-public-storage' },
    },
  };
}
