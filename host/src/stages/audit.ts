import { unwrap } from '../core/core.js';
import { gateFailures } from '../lib/gate.js';
import { need, type StageContext } from './context.js';
import { staticAuditInput } from './site-files.js';

export async function auditStage(ctx: StageContext): Promise<void> {
  const config = need(ctx.state, 'config', 'audit');
  const { outputDir } = need(ctx.state, 'build', 'audit');
  const processed = need(ctx.state, 'processed', 'audit');
  const input = await staticAuditInput(ctx.io.fs, { outputDir, config, buildId: ctx.inputs.buildId, pages: processed.pages });
  const report = unwrap('audit', ctx.core.audit(input));
  ctx.state.staticAudit = report;
  ctx.io.log.info(`GEO score (static) ${report.score}`);
  const failures = gateFailures(report, ctx.inputs.geoMinScore);
  if (failures.length > 0) throw new Error(`GEO audit failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
}
