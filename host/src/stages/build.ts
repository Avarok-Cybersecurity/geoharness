import { createAdapters, selectAdapter } from '../adapters/registry.js';
import type { Adapter } from '../adapters/types.js';
import { need, type StageContext } from './context.js';

export function adaptersFor(ctx: StageContext): Adapter[] {
  return createAdapters({
    siteDir: ctx.inputs.sitePath,
    buildCommand: ctx.inputs.buildCommand,
    outputDir: ctx.inputs.outputDir,
    tempDir: ctx.inputs.stateDir,
  });
}

export function adapterById(ctx: StageContext, stage: string): Adapter {
  const id = need(ctx.state, 'adapterId', stage);
  const adapter = adaptersFor(ctx).find((a) => a.id === id);
  if (adapter === undefined) throw new Error(`unknown adapter ${id} in state`);
  return adapter;
}

export async function build(ctx: StageContext): Promise<void> {
  const config = need(ctx.state, 'config', 'build');
  const { adapter } = await selectAdapter(adaptersFor(ctx), ctx.inputs.sitePath, ctx.io, ctx.inputs.adapter);
  const result = await adapter.build({ siteDir: ctx.inputs.sitePath, io: ctx.io, config });
  ctx.state.adapterId = adapter.id;
  ctx.state.build = result;
  ctx.io.log.info(`built ${result.outputDir} with adapter ${adapter.id}`);
}
