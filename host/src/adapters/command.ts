import type { Adapter, AdapterOptions } from './types.js';
import { pagesFromOutput } from './pages.js';
import { assertBuilt, outputDirWithin, requireOutputDir, runBuildCommand } from './shared.js';

/** Any language: run build-command (argv, no shell), then read output-dir. */
export function commandAdapter(opts: AdapterOptions): Adapter {
  return {
    id: 'command',
    detect() {
      return Promise.resolve(opts.buildCommand === undefined
        ? { confidence: 0, evidence: [] }
        : { confidence: 0.8, evidence: [`build-command input: ${opts.buildCommand}`] });
    },
    async build(ctx) {
      if (opts.buildCommand === undefined) throw new Error('adapter command needs the build-command input');
      const outputDir = outputDirWithin(ctx.siteDir, requireOutputDir('command', opts.outputDir));
      await runBuildCommand(ctx.io, ctx.siteDir, opts.buildCommand);
      await assertBuilt(ctx.io, outputDir);
      return { outputDir, notFoundHandling: '404-page' };
    },
    pages: (outputDir, io) => pagesFromOutput(outputDir, io, { siteDir: opts.siteDir, markdownRoot: undefined }),
  };
}
