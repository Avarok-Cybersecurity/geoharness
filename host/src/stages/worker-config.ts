import { isAbsolute, join } from 'node:path';
import { readRepoWranglerConfig } from '../lib/wrangler-config.js';
import { generateWranglerConfig, negotiateEntry } from '../lib/wrangler-generate.js';
import { need, type StageContext } from './context.js';

/** The wrangler config a workers deploy uses — and, unchanged, the pre-deploy local server. */
export interface WorkerConfig {
  /** Absolute path of the config file. */
  file: string;
  /** The Worker's name; undefined only when a repo-owned config does not state one. */
  workerName: string | undefined;
  repoOwned: boolean;
}

/**
 * The repo's own wrangler config when it has one, else the generated assets-only Worker (or the negotiate
 * fallback Worker in front of the assets when preflight found no zone access).
 */
export async function workerConfig(ctx: StageContext, stage: string): Promise<WorkerConfig> {
  const built = need(ctx.state, 'build', stage);
  const { sitePath, stateDir, projectName, domains } = ctx.inputs;
  if (built.repoWranglerConfig !== undefined) {
    const repo = await readRepoWranglerConfig(ctx.io, sitePath);
    const file = isAbsolute(built.repoWranglerConfig) ? built.repoWranglerConfig : join(sitePath, built.repoWranglerConfig);
    return { file, workerName: repo?.name, repoOwned: true };
  }
  let main: string | undefined;
  if (ctx.state.access?.negotiation === 'negotiate-worker') {
    main = join(stateDir, 'negotiate-worker.mjs');
    await ctx.io.fs.writeText(main, negotiateEntry(ctx.negotiateModule));
  }
  const config = generateWranglerConfig({ name: projectName, outputDir: built.outputDir, domains, notFoundHandling: built.notFoundHandling, main });
  const file = join(stateDir, 'wrangler.json');
  await ctx.io.fs.writeText(file, `${JSON.stringify(config, null, 2)}\n`);
  return { file, workerName: projectName, repoOwned: false };
}
