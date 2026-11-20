import { unwrap } from '../core/core.js';
import { describeError } from '../lib/errors.js';
import { gateFailures } from '../lib/gate.js';
import { servedCertificateFailures } from './certificates-live.js';
import { need, type StageContext } from './context.js';
import { auditedUrls } from './lighthouse.js';
import { describeFailures, runLighthouse } from './lighthouse-run.js';
import { observe, waitForBuild } from './live.js';
import { rollBack } from './rollback.js';
import { staticAuditInput } from './site-files.js';

export const VERIFY_POLL = { intervalMs: 10_000, timeoutMs: 5 * 60_000 } as const;

/** The live GEO audit: the core's plan, fetched, judged by the core. */
async function liveAudit(ctx: StageContext): Promise<string[]> {
  const config = need(ctx.state, 'config', 'verify');
  const processed = need(ctx.state, 'processed', 'verify');
  const { outputDir } = need(ctx.state, 'build', 'verify');
  const plan = unwrap('liveCheckPlan', ctx.core.liveCheckPlan({ config, routes: processed.pages.map((p) => p.route), buildId: ctx.inputs.buildId }));
  const live = [];
  for (const req of plan) live.push(await observe(ctx.io, req));
  const input = await staticAuditInput(ctx.io.fs, { outputDir, config, buildId: ctx.inputs.buildId, pages: processed.pages, excludedRoutes: processed.excludedRoutes });
  const report = unwrap('audit', ctx.core.audit({ ...input, live }));
  ctx.state.liveAudit = report;
  ctx.io.log.info(`GEO score (live) ${report.score} from ${live.length} live requests`);
  return gateFailures(report, ctx.inputs.geoMinScore);
}

/** The post-deploy Lighthouse gate: the same assertions, against production. */
async function liveLighthouse(ctx: StageContext): Promise<string[]> {
  if (!ctx.inputs.lighthouse) {
    ctx.state.liveLighthouse = { skipped: true, urls: [], links: {}, failures: [], medians: [] };
    return [];
  }
  const config = need(ctx.state, 'config', 'verify');
  const result = await runLighthouse(ctx, await auditedUrls(ctx, config.site.origin), 'live');
  ctx.state.liveLighthouse = { skipped: false, urls: result.urls, links: result.links, failures: result.failures, medians: result.medians };
  return result.passed ? [] : [`Lighthouse on the live site is below 100 (median of 3 runs):\n    - ${describeFailures(result).replace(/\n {2}- /g, '\n    - ')}`];
}

/** Every failure of the live checks; a check that cannot complete (it throws) is a failure, not a crash. */
async function liveFailures(ctx: StageContext, url: string): Promise<string[]> {
  try {
    await waitForBuild(ctx.io, { url, buildId: ctx.inputs.buildId, ...VERIFY_POLL });
    return [...await liveAudit(ctx), ...await servedCertificateFailures(ctx), ...await liveLighthouse(ctx)];
  } catch (e) {
    return [`verification could not complete: ${describeError(e)}`];
  }
}

/**
 * Waits for the deployed build, then runs the live GEO audit, `certificates.served` and the production Lighthouse gate. When either
 * fails or cannot complete (the build never goes live, a request keeps failing), production is rolled back to
 * the version recorded before deploy if `rollback-on-failure` is true: an unverified build is not kept live.
 */
export async function verifyStage(ctx: StageContext): Promise<void> {
  const { url } = need(ctx.state, 'deploy', 'verify');
  const failures = await liveFailures(ctx, url);
  if (failures.length === 0) return;
  const reason = `live verification failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`;
  if (!ctx.inputs.rollbackOnFailure) {
    ctx.state.rollback = { performed: false, detail: 'rollback-on-failure is false: the failing build stays live' };
    throw new Error(`${reason}\n${ctx.state.rollback.detail}`);
  }
  const rollback = await rollBack(ctx, 'post-deploy verification failed');
  ctx.state.rollback = rollback;
  ctx.io.log.warn(rollback.detail);
  throw new Error(`${reason}\n${rollback.performed ? 'Rolled back' : 'NOT rolled back'}: ${rollback.detail}`);
}
