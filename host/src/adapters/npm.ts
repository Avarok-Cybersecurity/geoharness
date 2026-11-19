import type { Adapter, AdapterOptions } from './types.js';
import { detectNpmOutputDir } from './output-dir.js';
import { pagesFromOutput } from './pages.js';
import { assertBuilt, npmInstallAndBuild, outputDirWithin, readPackageJson } from './shared.js';

/** package.json with a build script. Output dir: input, else the generator's config, else an error. */
export function npmAdapter(opts: AdapterOptions): Adapter {
  return {
    id: 'npm',
    async detect(dir, io) {
      const pkg = await readPackageJson(io, dir);
      return pkg?.scripts.build === undefined
        ? { confidence: 0, evidence: [] }
        : { confidence: 0.6, evidence: [`package.json build script: ${pkg.scripts.build}`] };
    },
    async build(ctx) {
      let rel = opts.outputDir;
      if (rel === undefined) {
        const found = await detectNpmOutputDir(ctx.io, ctx.siteDir);
        if (found === undefined) throw new Error('adapter npm could not find the output directory from any known config; set output-dir');
        ctx.io.log.info(`output directory ${found.dir}/ from ${found.evidence}`);
        rel = found.dir;
      }
      const outputDir = outputDirWithin(ctx.siteDir, rel);
      await npmInstallAndBuild(ctx.io, ctx.siteDir, opts.buildCommand);
      await assertBuilt(ctx.io, outputDir);
      return { outputDir, notFoundHandling: '404-page' };
    },
    pages: (outputDir, io) => pagesFromOutput(outputDir, io, { siteDir: opts.siteDir, markdownRoot: undefined }),
  };
}
