import { join } from 'node:path';
import { asObject, asString, parseJson } from '../lib/json.js';
import { parseSitemap } from '../lib/sitemap.js';
import { need, type StageContext } from './context.js';
import { runTool, runToolOk } from './tools.js';

const RUNS = 3;
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const;
const LHCI_TIMEOUT_MS = 45 * 60 * 1000;

/** lhci serves staticDistDir itself and swaps in its own port for http://localhost URLs. */
export function lighthouseUrls(sitemapXml: string, max: number): string[] {
  return parseSitemap(sitemapXml).slice(0, max).map((e) => {
    const u = new URL(e.loc);
    return `http://localhost${u.pathname}`;
  });
}

export function lighthouseRc(outputDir: string, urls: string[]): unknown {
  const assertion = ['error', { minScore: 1, aggregationMethod: 'median-run' }];
  return {
    ci: {
      collect: { staticDistDir: outputDir, url: urls, numberOfRuns: RUNS },
      assert: { assertions: Object.fromEntries(CATEGORIES.map((c) => [`categories:${c}`, assertion])) },
      upload: { target: 'temporary-public-storage' },
    },
  };
}

export async function lighthouseStage(ctx: StageContext): Promise<void> {
  if (!ctx.inputs.lighthouse) {
    ctx.io.log.info('lighthouse: false — Lighthouse gate skipped');
    ctx.state.lighthouse = { skipped: true, urls: [], links: {} };
    return;
  }
  const { outputDir } = need(ctx.state, 'build', 'lighthouse');
  const sitemap = await ctx.io.fs.readText(join(outputDir, 'sitemap.xml'));
  const max = ctx.inputs.lighthouseMaxUrls;
  if (max === undefined) throw new Error('lighthouse-max-urls is required when lighthouse is true');
  const urls = lighthouseUrls(sitemap, max);
  if (urls.length === 0) throw new Error('the generated sitemap.xml lists no URLs to audit');

  const dir = await ctx.io.fs.makeTempDir(ctx.inputs.stateDir, 'lhci-');
  const rc = join(dir, 'lighthouserc.json');
  await ctx.io.fs.writeText(rc, JSON.stringify(lighthouseRc(outputDir, urls), null, 2));
  const run = { cwd: dir, env: {}, timeoutMs: LHCI_TIMEOUT_MS };
  await runToolOk(ctx, 'lhci', ['collect', `--config=${rc}`], run);
  await runToolOk(ctx, 'lhci', ['upload', `--config=${rc}`], run);
  const linksText = await ctx.io.fs.readTextIfExists(join(dir, '.lighthouseci', 'links.json'));
  const links: Record<string, string> = {};
  if (linksText !== undefined) {
    for (const [k, v] of Object.entries(asObject(parseJson(linksText, 'links.json'), 'links.json'))) links[k] = asString(v, k);
  }
  ctx.state.lighthouse = { skipped: false, urls, links };
  const assert = await runTool(ctx, 'lhci', ['assert', `--config=${rc}`], run);
  if (assert.code !== 0) throw new Error('Lighthouse gate failed: every category must score 100 (median of 3 runs); see the report links');
}
