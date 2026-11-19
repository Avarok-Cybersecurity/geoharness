import { join } from 'node:path';
import { asObject, asString, parseJson } from '../lib/json.js';
import { lighthouseRc } from '../lib/lighthouse-rc.js';
import { lighthouseFailures, type LighthouseFailure } from '../lib/lighthouse-report.js';
import type { StageContext } from './context.js';
import { runTool, runToolOk } from './tools.js';

const LHCI_TIMEOUT_MS = 45 * 60 * 1000;

export interface LighthouseResult {
  passed: boolean;
  urls: string[];
  /** Report links by audited URL (temporary public storage). */
  links: Record<string, string>;
  failures: LighthouseFailure[];
}

async function readLinks(ctx: StageContext, dir: string): Promise<Record<string, string>> {
  const text = await ctx.io.fs.readTextIfExists(join(dir, '.lighthouseci', 'links.json'));
  const links: Record<string, string> = {};
  if (text === undefined) return links;
  for (const [k, v] of Object.entries(asObject(parseJson(text, 'links.json'), 'links.json'))) links[k] = asString(v, k);
  return links;
}

async function readLhrs(ctx: StageContext, dir: string): Promise<unknown[]> {
  const base = join(dir, '.lighthouseci');
  if (!(await ctx.io.fs.isDirectory(base))) return [];
  const files = (await ctx.io.fs.listFiles(base)).filter((f) => /^lhr-[^/]*\.json$/.test(f));
  const out: unknown[] = [];
  for (const f of files) out.push(parseJson(await ctx.io.fs.readText(join(base, f)), f));
  return out;
}

/** collect (3 runs per URL) → upload → assert (median, 100 in all four categories) against `urls`. */
export async function runLighthouse(ctx: StageContext, urls: string[], label: string): Promise<LighthouseResult> {
  const dir = await ctx.io.fs.makeTempDir(ctx.inputs.stateDir, `lhci-${label}-`);
  const rc = join(dir, 'lighthouserc.json');
  await ctx.io.fs.writeText(rc, JSON.stringify(lighthouseRc(urls), null, 2));
  // lhci runs in a temp dir that is not a git checkout; upload needs the commit, so it is given explicitly.
  const run = { cwd: dir, env: { LHCI_BUILD_CONTEXT__CURRENT_HASH: ctx.inputs.buildId }, timeoutMs: LHCI_TIMEOUT_MS };
  await runToolOk(ctx, 'lhci', ['collect', `--config=${rc}`], run);
  await runToolOk(ctx, 'lhci', ['upload', `--config=${rc}`], run);
  const links = await readLinks(ctx, dir);
  const failures = lighthouseFailures(await readLhrs(ctx, dir));
  const assert = await runTool(ctx, 'lhci', ['assert', `--config=${rc}`], run);
  return { passed: assert.code === 0, urls, links, failures };
}

/** One line per failing category, with the audits behind it, for error messages. */
export function describeFailures(r: LighthouseResult): string {
  if (r.failures.length === 0) return 'see the report links';
  return r.failures
    .map((f) => `${f.url} ${f.category} ${f.score}${f.audits.length === 0 ? '' : ` — ${f.audits.join('; ')}`}`)
    .join('\n  - ');
}
