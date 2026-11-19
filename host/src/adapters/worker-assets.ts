import { join } from 'node:path';
import { readRepoWranglerConfig } from '../lib/wrangler-config.js';
import type { Adapter, AdapterOptions } from './types.js';
import { pagesFromOutput } from './pages.js';
import { assertBuilt, npmInstallAndBuild, outputDirWithin, readPackageJson, runBuildCommand } from './shared.js';

/**
 * The repo already deploys a Worker with static assets. GeoHarness writes into its assets.directory and
 * deploys with the repo's own wrangler config, so the repo's Worker code and bindings stay in charge.
 */
export function workerAssetsAdapter(opts: AdapterOptions): Adapter {
  return {
    id: 'worker-assets',
    async detect(dir, io) {
      const cfg = await readRepoWranglerConfig(io, dir);
      if (cfg === undefined) return { confidence: 0, evidence: [] };
      return cfg.assetsDirectory === undefined
        ? { confidence: 0, evidence: [`${cfg.file} has no assets.directory`] }
        : { confidence: 0.95, evidence: [`${cfg.file} assets.directory = ${cfg.assetsDirectory}`] };
    },
    async build(ctx) {
      const cfg = await readRepoWranglerConfig(ctx.io, ctx.siteDir);
      if (cfg?.assetsDirectory === undefined) throw new Error('adapter worker-assets needs a wrangler config with assets.directory');
      if (opts.outputDir !== undefined && outputDirWithin(ctx.siteDir, opts.outputDir) !== outputDirWithin(ctx.siteDir, cfg.assetsDirectory)) {
        throw new Error(`output-dir ${opts.outputDir} disagrees with ${cfg.file} assets.directory ${cfg.assetsDirectory}`);
      }
      const outputDir = outputDirWithin(ctx.siteDir, cfg.assetsDirectory);
      const pkg = await readPackageJson(ctx.io, ctx.siteDir);
      if (pkg?.scripts.build !== undefined) await npmInstallAndBuild(ctx.io, ctx.siteDir, opts.buildCommand);
      else if (opts.buildCommand !== undefined) await runBuildCommand(ctx.io, ctx.siteDir, opts.buildCommand);
      await assertBuilt(ctx.io, outputDir);
      return { outputDir, notFoundHandling: '404-page', repoWranglerConfig: join(ctx.siteDir, cfg.file) };
    },
    pages: (outputDir, io) => pagesFromOutput(outputDir, io, { siteDir: opts.siteDir, markdownRoot: undefined }),
  };
}
