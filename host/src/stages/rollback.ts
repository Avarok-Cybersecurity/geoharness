import { currentPagesProduction, rollbackPages } from '../io/cloudflare/pages.js';
import { currentWorkerVersion } from '../io/cloudflare/workers-deployments.js';
import { listWorkerDomains } from '../io/cloudflare/workers-domains.js';
import type { PreviousDeployment, StageContext } from './context.js';
import { runTool, wranglerEnv } from './tools.js';

const ROLLBACK_TIMEOUT_MS = 5 * 60 * 1000;

/** Records what serves production now; called by deploy right before it uploads. */
export async function recordPrevious(ctx: StageContext, workerName: string | undefined): Promise<PreviousDeployment> {
  const { accountId, projectName, target } = ctx.inputs;
  if (target === 'pages') return { target: 'pages', deploymentId: await currentPagesProduction(ctx.cf, accountId, projectName) };
  if (workerName === undefined) return { target: 'unknown', reason: 'the repo-owned wrangler config states no Worker name' };
  const versionId = await currentWorkerVersion(ctx.cf, accountId, workerName);
  if (versionId === undefined) return { target: 'workers', workerName, versionId };
  // A version is "production" only if it served one of the site's hosts. On a migration's first run the hosts are
  // still elsewhere (Pages, another origin), and the newest version is an earlier upload that never served them.
  if (!(await servedAnyHost(ctx, workerName))) {
    const hosts = ctx.inputs.domains.join(', ');
    return { target: 'none', reason: `no prior production version on Worker ${workerName}: none of ${hosts} was a Custom Domain of it ` +
      'before this run. GeoHarness rolls back only to earlier versions of this Worker; whatever served them before ' +
      '(a Pages project, another origin) is not something GeoHarness can roll back to — restore it by hand if needed' };
  }
  return { target: 'workers', workerName, versionId };
}

async function servedAnyHost(ctx: StageContext, workerName: string): Promise<boolean> {
  for (const host of ctx.inputs.domains) {
    const bound = await listWorkerDomains(ctx.cf, ctx.inputs.accountId, host);
    if (bound.some((d) => d.hostname === host && d.service === workerName)) return true;
  }
  return false;
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
  if (prev.target === 'none') return { performed: false, detail: prev.reason };
  const message = `geoharness: ${why} (${ctx.inputs.buildId.slice(0, 12)})`.slice(0, 100);
  try {
    if (prev.target === 'workers') {
      if (prev.versionId === undefined) return { performed: false, detail: `first deploy of Worker ${prev.workerName}: no previous version to roll back to` };
      const now = await currentWorkerVersion(ctx.cf, ctx.inputs.accountId, prev.workerName);
      if (now === prev.versionId) {
        return { performed: false, detail: `Worker ${prev.workerName} still serves version ${now}, the one recorded before this deploy: there is nothing earlier to roll back to` };
      }
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
