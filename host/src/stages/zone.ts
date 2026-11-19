import { getEntrypointRules, putEntrypointRules, type CfRule } from '../io/cloudflare/rulesets.js';
import { listWorkerDomains } from '../io/cloudflare/workers-domains.js';
import type { RewriteRule } from '../core/types-index.js';
import { planTaggedRules, ruleTag } from '../lib/tagged-rules.js';
import { need, primaryHost, type StageContext } from './context.js';
import { applyOptimizations } from './zone-settings.js';

export function rewriteRuleToCf(r: RewriteRule): CfRule {
  return {
    description: r.description,
    expression: r.expression,
    action: 'rewrite',
    action_parameters: { uri: { path: { expression: r.pathExpression } } },
    enabled: true,
  };
}

async function checkCustomDomains(ctx: StageContext): Promise<void> {
  for (const domain of ctx.inputs.domains) {
    const attached = await listWorkerDomains(ctx.cf, ctx.inputs.accountId, domain);
    if (!attached.some((d) => d.hostname === domain && d.service === ctx.inputs.projectName)) {
      throw new Error(`${domain} is not a Custom Domain of Worker ${ctx.inputs.projectName} after deploy`);
    }
  }
}

export async function zoneStage(ctx: StageContext): Promise<void> {
  const config = need(ctx.state, 'config', 'zone');
  const access = need(ctx.state, 'access', 'zone');
  const processed = need(ctx.state, 'processed', 'zone');
  const built = need(ctx.state, 'build', 'zone');
  const changes: string[] = [];
  ctx.state.zoneChanges = changes;
  if (ctx.inputs.target === 'workers' && built.repoWranglerConfig === undefined) await checkCustomDomains(ctx);
  if (access.zone === undefined) {
    ctx.io.log.warn('zone stage: no zone access; markdown negotiation is served by the negotiate Worker (100k requests/day, then 429)');
    return;
  }
  const host = primaryHost(config);
  const tag = ruleTag(host);
  const desired = processed.rewriteRules.map(rewriteRuleToCf);
  const existing = await getEntrypointRules(ctx.cf, access.zone.id, 'http_request_transform');
  const plan = planTaggedRules(existing, desired, tag);
  if (plan.changed) {
    await putEntrypointRules(ctx.cf, access.zone.id, 'http_request_transform', plan.rules);
    changes.push(`URL Rewrite rules (${tag}): ${plan.removed} replaced, ${plan.added} written` +
      `${existing === undefined ? ' (entrypoint created)' : ''}; ${plan.rules.length - plan.added} other rules kept`);
  }
  changes.push(...await applyOptimizations(ctx, { zoneId: access.zone.id, host, tag }, access.optimizations));
  ctx.io.log.info(changes.length === 0 ? 'zone: already configured, no changes' : `zone changes:\n  ${changes.join('\n  ')}`);
}
