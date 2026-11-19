import { join } from 'node:path';
import type { Adapter, AdapterOptions, BuildContext } from './types.js';
import { detectNpmOutputDir } from './output-dir.js';
import { pagesFromOutput } from './pages.js';
import { PRERENDER_SCRIPT } from './prerender-script.js';
import { assertBuilt, firstExisting, npmInstallAndBuild, outputDirWithin, runStep } from './shared.js';

/** Pinned exactly; installed into a temp prefix only when this adapter runs. */
export const PLAYWRIGHT_CORE_VERSION = '1.65.1';
const RENDER_TIMEOUT_MS = 60_000;
const VITE_CONFIGS = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'];
const MOUNT = /<div\s+id=["'](root|app)["']\s*>\s*<\/div>/;

/** The public routes to render: "/" plus every route the site lists in llms sections. */
export function prerenderRoutes(ctx: BuildContext): string[] {
  const routes = new Set(['/']);
  for (const s of ctx.config.llms.sections) for (const r of s.routes) routes.add(r);
  return [...routes];
}

async function render(ctx: BuildContext, tempDir: string, outputDir: string): Promise<void> {
  const prefix = await ctx.io.fs.makeTempDir(tempDir, 'prerender-');
  await runStep(ctx.io, prefix, ['npm', 'install', '--prefix', prefix, '--no-save', '--no-audit', '--no-fund', `playwright-core@${PLAYWRIGHT_CORE_VERSION}`]);
  const pw = join(prefix, 'node_modules', 'playwright-core');
  await runStep(ctx.io, prefix, ['node', join(pw, 'cli.js'), 'install', '--only-shell', 'chromium']);
  const script = join(prefix, 'render.mjs');
  await ctx.io.fs.writeText(script, PRERENDER_SCRIPT);
  const routes = prerenderRoutes(ctx);
  await runStep(ctx.io, prefix, ['node', script, pw, outputDir, JSON.stringify(routes), String(RENDER_TIMEOUT_MS)]);
}

/** A Vite single-page app: build, then render public routes with headless Chromium so pages carry real text. */
export function vitePrerenderAdapter(opts: AdapterOptions & { tempDir: string }): Adapter {
  return {
    id: 'vite-prerender',
    async detect(dir, io) {
      const config = await firstExisting(io, dir, VITE_CONFIGS);
      if (config === undefined) return { confidence: 0, evidence: [] };
      if (await firstExisting(io, dir, ['svelte.config.js', 'svelte.config.mjs', 'svelte.config.ts']) !== undefined) {
        return { confidence: 0, evidence: [`${config} belongs to a SvelteKit app`] };
      }
      const index = await io.fs.readTextIfExists(join(dir, 'index.html'));
      return index !== undefined && MOUNT.test(index)
        ? { confidence: 0.8, evidence: [`${config} and an empty SPA mount point in index.html`] }
        : { confidence: 0, evidence: [`${config} without an SPA mount point in index.html`] };
    },
    async build(ctx) {
      const rel = opts.outputDir ?? (await detectNpmOutputDir(ctx.io, ctx.siteDir))?.dir;
      if (rel === undefined) throw new Error('adapter vite-prerender could not find the Vite output directory; set output-dir');
      const outputDir = outputDirWithin(ctx.siteDir, rel);
      await npmInstallAndBuild(ctx.io, ctx.siteDir, opts.buildCommand);
      await assertBuilt(ctx.io, outputDir);
      await render(ctx, opts.tempDir, outputDir);
      return { outputDir, notFoundHandling: 'single-page-application' };
    },
    pages: (outputDir, io) => pagesFromOutput(outputDir, io, { siteDir: opts.siteDir, markdownRoot: undefined }),
  };
}
