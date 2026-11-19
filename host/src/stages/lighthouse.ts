import { join } from 'node:path';
import { lighthouseUrls } from '../lib/lighthouse-rc.js';
import { need, type StageContext } from './context.js';
import { withLocalServer } from './local-server.js';
import { describeFailures, runLighthouse } from './lighthouse-run.js';

/** The sitemap's first `lighthouse-max-urls` URLs, on `origin`. */
export async function auditedUrls(ctx: StageContext, origin: string): Promise<string[]> {
  const { outputDir } = need(ctx.state, 'build', 'lighthouse');
  const sitemap = await ctx.io.fs.readText(join(outputDir, 'sitemap.xml'));
  const max = ctx.inputs.lighthouseMaxUrls;
  if (max === undefined) throw new Error('lighthouse-max-urls is required when lighthouse is true');
  const urls = lighthouseUrls(sitemap, origin, max);
  if (urls.length === 0) throw new Error('the generated sitemap.xml lists no URLs to audit');
  return urls;
}

/**
 * Pre-deploy gate: Lighthouse against the processed output served by wrangler locally, with the deploy's own
 * config, so headers (CSP included), redirects and 404 handling are what production will serve.
 */
export async function lighthouseStage(ctx: StageContext): Promise<void> {
  if (!ctx.inputs.lighthouse) {
    ctx.io.log.info('lighthouse: false — Lighthouse gate skipped');
    ctx.state.lighthouse = { skipped: true, urls: [], links: {}, failures: [] };
    return;
  }
  const paths = await auditedUrls(ctx, '');
  const result = await withLocalServer(ctx, paths[0] ?? '/', (origin) => runLighthouse(ctx, paths.map((p) => `${origin}${p}`), 'local'));
  ctx.state.lighthouse = { skipped: false, urls: result.urls, links: result.links, failures: result.failures };
  if (!result.passed) {
    throw new Error(`Lighthouse gate failed: every category must score 100 (median of 3 runs):\n  - ${describeFailures(result)}`);
  }
}
