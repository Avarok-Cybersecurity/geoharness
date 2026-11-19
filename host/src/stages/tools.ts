import type { ProcResult } from '../io/types.js';
import type { StageContext } from './context.js';

/**
 * Exact pins; tools run through npx so they never enter the action bundle. lhci 0.16 bundles Lighthouse 13,
 * the first whose robots-txt audit accepts the Content-Signal directive GeoHarness writes (12.x scored SEO 92).
 */
export const TOOLS = {
  wrangler: { pkg: 'wrangler@4.156.0', bin: 'wrangler' },
  lhci: { pkg: '@lhci/cli@0.16.1', bin: 'lhci' },
} as const;

export interface ToolRun { cwd: string; env: Record<string, string>; timeoutMs: number }

export async function runTool(ctx: StageContext, tool: keyof typeof TOOLS, args: string[], run: ToolRun): Promise<ProcResult> {
  const { pkg, bin } = TOOLS[tool];
  ctx.io.log.info(`$ ${bin} ${args.join(' ')}`);
  return ctx.io.proc.run('npx', ['--yes', `--package=${pkg}`, '--', bin, ...args], {
    cwd: run.cwd, env: run.env, timeoutMs: run.timeoutMs, redact: [ctx.inputs.apiToken], stream: true,
  });
}

export async function runToolOk(ctx: StageContext, tool: keyof typeof TOOLS, args: string[], run: ToolRun): Promise<ProcResult> {
  const r = await runTool(ctx, tool, args, run);
  if (r.code !== 0) throw new Error(`${TOOLS[tool].bin} ${args[0] ?? ''} exited with ${r.code}`);
  return r;
}

/** Credentials wrangler reads; passed explicitly per call, redacted from logs. */
export function wranglerEnv(ctx: StageContext): Record<string, string> {
  return { CLOUDFLARE_API_TOKEN: ctx.inputs.apiToken, CLOUDFLARE_ACCOUNT_ID: ctx.inputs.accountId, WRANGLER_SEND_METRICS: 'false' };
}
