import { getEntrypointRules, putEntrypointRules, type CfRule } from '../io/cloudflare/rulesets.js';
import { listWorkerDomains } from '../io/cloudflare/workers-domains.js';
import type { RewriteRule } from '../core/types-index.js';
import { ruleBudgetProblem } from '../lib/rule-budget.js';
import { planTaggedRules, ruleTag, type RulePlan } from '../lib/tagged-rules.js';
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

async function planRewriteRules(ctx: StageContext, zoneId: string, rules: RewriteRule[]): Promise<{ plan: RulePlan; existing: CfRule[] | undefined }> {
  const existing = await getEntrypointRules(ctx.cf, zoneId, 'http_request_transform');
  return { plan: planTaggedRules(existing, rules.map(rewriteRuleToCf), ctx.inputs.domains.map(ruleTag)), existing };
}

/**
 * Before deploy: the zone's rules after the zone stage would run must fit its plan's URL Rewrite limit
 * (`cf-transform-rules`), counting the rules GeoHarness does not own. An unknown plan is left to Cloudflare.
 */
export async function checkRuleBudget(ctx: StageContext): Promise<void> {
  const access = need(ctx.state, 'access', 'deploy');
  const processed = need(ctx.state, 'processed', 'deploy');
  if (access.zone === undefined || access.negotiation !== 'rules') return;
  const { plan } = await planRewriteRules(ctx, access.zone.id, processed.rewriteRules);
  const problem = ruleBudgetProblem(access.zone, plan, ctx.inputs.domains.length);
  if (problem !== undefined) throw new Error(problem);
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
  const tags = ctx.inputs.domains.map(ruleTag);
  const { plan, existing } = await planRewriteRules(ctx, access.zone.id, processed.rewriteRules);
  if (plan.changed) {
    await putEntrypointRules(ctx.cf, access.zone.id, 'http_request_transform', plan.rules);
    changes.push(`URL Rewrite rules (${tags.join(', ')}): ${plan.removed} replaced, ${plan.added} written` +
      `${existing === undefined ? ' (entrypoint created)' : ''}; ${plan.others.length} other rules kept`);
  }
  const target = { zoneId: access.zone.id, hosts: ctx.inputs.domains, tag: ruleTag(primaryHost(config)) };
  changes.push(...await applyOptimizations(ctx, target, access.optimizations));
  ctx.io.log.info(changes.length === 0 ? 'zone: already configured, no changes' : `zone changes:\n  ${changes.join('\n  ')}`);
}
