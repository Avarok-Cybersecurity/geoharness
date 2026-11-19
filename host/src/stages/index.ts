import { auditStage } from './audit.js';
import { build } from './build.js';
import type { Stage, StageContext } from './context.js';
import { deployStage } from './deploy.js';
import { indexnowStage } from './indexnow.js';
import { lighthouseStage } from './lighthouse.js';
import { preflight } from './preflight.js';
import { processStage } from './process.js';
import { saveState } from './state.js';
import { summaryStage, writeSummary } from './summary.js';
import { verifyStage } from './verify.js';
import { zoneStage } from './zone.js';

export const STAGES = {
  preflight, build, process: processStage, audit: auditStage, lighthouse: lighthouseStage,
  deploy: deployStage, zone: zoneStage, verify: verifyStage, indexnow: indexnowStage, summary: summaryStage,
} as const satisfies Record<string, Stage>;
export type StageName = keyof typeof STAGES;
export const STAGE_ORDER = Object.keys(STAGES) as StageName[];

/** Stages that call the Cloudflare API or the deployed site; `deploy: false` skips them. */
export const DEPLOY_STAGES: ReadonlySet<StageName> = new Set(['deploy', 'zone', 'verify', 'indexnow']);

export function isStageName(s: string): s is StageName {
  return Object.hasOwn(STAGES, s);
}

export async function runStage(ctx: StageContext, name: StageName): Promise<void> {
  if (!ctx.inputs.deploy && DEPLOY_STAGES.has(name)) {
    ctx.io.log.info(`geoharness ${name}: skipped (deploy: false)`);
    return;
  }
  try {
    await ctx.io.log.group(`geoharness ${name}`, () => STAGES[name](ctx));
  } finally {
    await saveState(ctx.io.fs, ctx.inputs.stateDir, ctx.state);
  }
}

/** All stages in order. On failure the summary is still written with the reason, then the error propagates. */
export async function runAll(ctx: StageContext): Promise<void> {
  for (const name of STAGE_ORDER) {
    if (name === 'summary') break;
    try {
      await runStage(ctx, name);
    } catch (e) {
      const reason = `${name}: ${e instanceof Error ? e.message : String(e)}`;
      await writeSummary(ctx, reason);
      throw e;
    }
  }
  await runStage(ctx, 'summary');
}
