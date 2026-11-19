import { join } from 'node:path';
import type { Adapter, AdapterOptions } from './types.js';
import { pagesFromOutput } from './pages.js';
import { assertBuilt, firstExisting, outputDirWithin, requireOutputDir, runStep } from './shared.js';

const MAKEFILES = ['GNUmakefile', 'makefile', 'Makefile'];
const BUILD_TARGET = /^build\s*:/m;

/** A Makefile with a `build` target; output-dir explicit. */
export function makeAdapter(opts: AdapterOptions): Adapter {
  return {
    id: 'make',
    async detect(dir, io) {
      const name = await firstExisting(io, dir, MAKEFILES);
      if (name === undefined) return { confidence: 0, evidence: [] };
      const text = await io.fs.readText(join(dir, name));
      return BUILD_TARGET.test(text)
        ? { confidence: 0.6, evidence: [`${name} has a build target`] }
        : { confidence: 0, evidence: [] };
    },
    async build(ctx) {
      const outputDir = outputDirWithin(ctx.siteDir, requireOutputDir('make', opts.outputDir));
      await runStep(ctx.io, ctx.siteDir, ['make', 'build']);
      await assertBuilt(ctx.io, outputDir);
      return { outputDir, notFoundHandling: '404-page' };
    },
    pages: (outputDir, io) => pagesFromOutput(outputDir, io, { siteDir: opts.siteDir, markdownRoot: undefined }),
  };
}
