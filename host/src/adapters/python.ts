import { join } from 'node:path';
import type { Adapter, AdapterOptions } from './types.js';
import { pagesFromOutput } from './pages.js';
import { assertBuilt, outputDirWithin, requireOutputDir, runBuildCommand, runStep } from './shared.js';

/** Markdown sources such generators conventionally read; attached to pages when found. */
const MARKDOWN_ROOT = 'content';

/** tools/build.py (run with python3), or pyproject.toml plus an explicit build-command; output-dir always explicit. */
export function pythonAdapter(opts: AdapterOptions): Adapter {
  return {
    id: 'python',
    async detect(dir, io) {
      if (await io.fs.exists(join(dir, 'tools/build.py'))) return { confidence: 0.7, evidence: ['tools/build.py exists'] };
      if (await io.fs.exists(join(dir, 'pyproject.toml'))) return { confidence: 0.5, evidence: ['pyproject.toml exists'] };
      return { confidence: 0, evidence: [] };
    },
    async build(ctx) {
      const outputDir = outputDirWithin(ctx.siteDir, requireOutputDir('python', opts.outputDir));
      if (opts.buildCommand !== undefined) await runBuildCommand(ctx.io, ctx.siteDir, opts.buildCommand);
      else if (await ctx.io.fs.exists(join(ctx.siteDir, 'tools/build.py'))) await runStep(ctx.io, ctx.siteDir, ['python3', 'tools/build.py']);
      else throw new Error('adapter python found pyproject.toml but no tools/build.py; set build-command');
      await assertBuilt(ctx.io, outputDir);
      return { outputDir, notFoundHandling: '404-page' };
    },
    pages: (outputDir, io) => pagesFromOutput(outputDir, io, { siteDir: opts.siteDir, markdownRoot: MARKDOWN_ROOT }),
  };
}
