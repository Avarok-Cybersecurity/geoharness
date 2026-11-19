import { actionOutputs, renderSummary } from '../lib/summary-render.js';
import type { StageContext } from './context.js';

/** Writes the step summary and action outputs; runs after a failure too, so the reason is visible. */
export async function writeSummary(ctx: StageContext, failure: string | undefined): Promise<void> {
  const { summaryFile, outputFile } = ctx.inputs;
  await ctx.io.fs.appendText(summaryFile, renderSummary(ctx.state, failure));
  const lines = Object.entries(actionOutputs(ctx.state)).map(([k, v]) => `${k}=${v}\n`);
  await ctx.io.fs.appendText(outputFile, lines.join(''));
}

export const summaryStage = (ctx: StageContext): Promise<void> => writeSummary(ctx, undefined);
