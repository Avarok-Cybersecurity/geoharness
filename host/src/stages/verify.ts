import { unwrap } from '../core/core.js';
import { gateFailures } from '../lib/gate.js';
import { need, type StageContext } from './context.js';
import { observe, waitForBuild } from './live.js';
import { staticAuditInput } from './site-files.js';

export const VERIFY_POLL = { intervalMs: 10_000, timeoutMs: 5 * 60_000 } as const;

export async function verifyStage(ctx: StageContext): Promise<void> {
  const config = need(ctx.state, 'config', 'verify');
  const processed = need(ctx.state, 'processed', 'verify');
  const { outputDir } = need(ctx.state, 'build', 'verify');
  const { url } = need(ctx.state, 'deploy', 'verify');
  await waitForBuild(ctx.io, { url, buildId: ctx.inputs.buildId, ...VERIFY_POLL });

  const plan = unwrap('liveCheckPlan', ctx.core.liveCheckPlan({ config, routes: processed.pages.map((p) => p.route), buildId: ctx.inputs.buildId }));
  const live = [];
  for (const req of plan) live.push(await observe(ctx.io, req));
  const input = await staticAuditInput(ctx.io.fs, { outputDir, config, buildId: ctx.inputs.buildId, pages: processed.pages });
  const report = unwrap('audit', ctx.core.audit({ ...input, live }));
  ctx.state.liveAudit = report;
  ctx.io.log.info(`GEO score (live) ${report.score} from ${live.length} live requests`);
  const failures = gateFailures(report, ctx.inputs.geoMinScore);
  if (failures.length > 0) throw new Error(`live verification failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
}
