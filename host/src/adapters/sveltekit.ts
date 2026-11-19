import { join } from 'node:path';
import type { Adapter, AdapterOptions } from './types.js';
import { pagesFromOutput } from './pages.js';
import { assertBuilt, firstExisting, npmInstallAndBuild, outputDirWithin } from './shared.js';

const CONFIGS = ['svelte.config.js', 'svelte.config.mjs', 'svelte.config.ts'];
const STATIC = /@sveltejs\/adapter-static/;
const PAGES_OPTION = /pages\s*:\s*['"]([^'"]+)['"]/;
/** adapter-static's documented default output directory. */
const ADAPTER_STATIC_OUTPUT = 'build';

export function sveltekitStaticAdapter(opts: AdapterOptions): Adapter {
  return {
    id: 'sveltekit-static',
    async detect(dir, io) {
      const config = await firstExisting(io, dir, CONFIGS);
      if (config === undefined) return { confidence: 0, evidence: [] };
      const text = await io.fs.readText(join(dir, config));
      return STATIC.test(text)
        ? { confidence: 0.9, evidence: [`${config} uses @sveltejs/adapter-static`] }
        : { confidence: 0, evidence: [`${config} exists but does not use adapter-static`] };
    },
    async build(ctx) {
      let rel = opts.outputDir;
      if (rel === undefined) {
        const config = await firstExisting(ctx.io, ctx.siteDir, CONFIGS);
        const text = config === undefined ? '' : await ctx.io.fs.readText(join(ctx.siteDir, config));
        rel = PAGES_OPTION.exec(text)?.[1] ?? ADAPTER_STATIC_OUTPUT;
      }
      const outputDir = outputDirWithin(ctx.siteDir, rel);
      await npmInstallAndBuild(ctx.io, ctx.siteDir, opts.buildCommand);
      await assertBuilt(ctx.io, outputDir);
      return { outputDir, notFoundHandling: '404-page' };
    },
    pages: (outputDir, io) => pagesFromOutput(outputDir, io, { siteDir: opts.siteDir, markdownRoot: undefined }),
  };
}
