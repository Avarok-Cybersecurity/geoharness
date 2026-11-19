import { join } from 'node:path';
import type { Adapter, AdapterOptions } from './types.js';
import { pagesFromOutput } from './pages.js';
import { assertBuilt, outputDirWithin } from './shared.js';

/** The output directory is already built and committed; nothing to run. */
export function staticAdapter(opts: AdapterOptions): Adapter {
  return {
    id: 'static',
    async detect(dir, io) {
      if (opts.outputDir === undefined || opts.buildCommand !== undefined) return { confidence: 0, evidence: [] };
      const hasIndex = await io.fs.exists(join(outputDirWithin(dir, opts.outputDir), 'index.html'));
      return hasIndex
        ? { confidence: 0.4, evidence: [`output-dir ${opts.outputDir}/index.html exists and no build-command is set`] }
        : { confidence: 0, evidence: [] };
    },
    async build(ctx) {
      if (opts.outputDir === undefined) throw new Error('adapter static needs the output-dir input');
      const outputDir = outputDirWithin(ctx.siteDir, opts.outputDir);
      await assertBuilt(ctx.io, outputDir);
      return { outputDir, notFoundHandling: '404-page' };
    },
    pages: (outputDir, io) => pagesFromOutput(outputDir, io, { siteDir: opts.siteDir, markdownRoot: undefined }),
  };
}
