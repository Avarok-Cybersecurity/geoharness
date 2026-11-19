import { currentPagesProduction, rollbackPages } from '../io/cloudflare/pages.js';
import { currentWorkerVersion } from '../io/cloudflare/workers-deployments.js';
import type { PreviousDeployment, StageContext } from './context.js';
import { runTool, wranglerEnv } from './tools.js';

const ROLLBACK_TIMEOUT_MS = 5 * 60 * 1000;

/** Records what serves production now; called by deploy right before it uploads. */
export async function recordPrevious(ctx: StageContext, workerName: string | undefined): Promise<PreviousDeployment> {
  const { accountId, projectName, target } = ctx.inputs;
  if (target === 'pages') return { target: 'pages', deploymentId: await currentPagesProduction(ctx.cf, accountId, projectName) };
  if (workerName === undefined) return { target: 'unknown', reason: 'the repo-owned wrangler config states no Worker name' };
  return { target: 'workers', workerName, versionId: await currentWorkerVersion(ctx.cf, accountId, workerName) };
}

/**
 * Puts production back on the recorded previous version (Workers: `wrangler rollback <version-id>`,
 * `cf-workers-rollbacks`; Pages: the API's rollback, `cf-pages-rollback`). Returns what happened; never throws,
 * so the original verification failure stays the run's error.
 */
export async function rollBack(ctx: StageContext, why: string): Promise<{ performed: boolean; detail: string }> {
  const prev = ctx.state.previousDeployment;
  if (prev === undefined) return { performed: false, detail: 'no previous deployment was recorded' };
  if (prev.target === 'unknown') return { performed: false, detail: `cannot roll back: ${prev.reason}` };
  const message = `geoharness: ${why} (${ctx.inputs.buildId.slice(0, 12)})`.slice(0, 100);
  try {
    if (prev.target === 'workers') {
      if (prev.versionId === undefined) return { performed: false, detail: `first deploy of Worker ${prev.workerName}: no previous version to roll back to` };
      const r = await runTool(ctx, 'wrangler', ['rollback', prev.versionId, '--name', prev.workerName, '--message', message, '--yes'],
        { cwd: ctx.inputs.sitePath, env: wranglerEnv(ctx), timeoutMs: ROLLBACK_TIMEOUT_MS });
      return r.code === 0
        ? { performed: true, detail: `rolled Worker ${prev.workerName} back to version ${prev.versionId}` }
        : { performed: false, detail: `wrangler rollback exited with ${r.code}; roll back by hand to version ${prev.versionId}` };
    }
    if (prev.deploymentId === undefined) return { performed: false, detail: `first production deployment of ${ctx.inputs.projectName}: nothing to roll back to` };
    await rollbackPages(ctx.cf, ctx.inputs.accountId, ctx.inputs.projectName, prev.deploymentId);
    return { performed: true, detail: `rolled Pages project ${ctx.inputs.projectName} back to deployment ${prev.deploymentId}` };
  } catch (e) {
    return { performed: false, detail: `rollback failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
