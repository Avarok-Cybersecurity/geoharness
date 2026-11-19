import { join } from 'node:path';
import { unwrap, formatCoreError } from '../core/core.js';
import type { SiteInput } from '../core/types-index.js';
import { adapterById } from './build.js';
import { need, type StageContext } from './context.js';
import { writeOutputFile } from './site-files.js';
import { sourceDates } from './source-dates.js';

const EXISTING = { robots: 'robots.txt', headers: '_headers', llms: 'llms.txt', sitemap: 'sitemap.xml' } as const;

export async function processStage(ctx: StageContext): Promise<void> {
  const config = need(ctx.state, 'config', 'process');
  const { outputDir } = need(ctx.state, 'build', 'process');
  const pages = await adapterById(ctx, 'process').pages(outputDir, ctx.io);
  if (pages.length === 0) throw new Error(`no HTML pages found in ${outputDir}`);

  const env: Record<string, string> = {};
  for (const name of config.env) {
    const v = ctx.io.env.get(name);
    if (v === undefined) throw new Error(`env ${name} is declared in geoharness.toml but not set`);
    env[name] = v;
  }
  const existing: SiteInput['existing'] = {};
  for (const [key, file] of Object.entries(EXISTING) as [keyof typeof EXISTING, string][]) {
    const text = await ctx.io.fs.readTextIfExists(join(outputDir, file));
    if (text !== undefined) existing[key] = text;
  }

  const out = unwrap('processSite', ctx.core.processSite({
    config, buildId: ctx.inputs.buildId, hosts: ctx.inputs.domains, env, pages, existing,
    sourceLastmod: await sourceDates(ctx.io, ctx.inputs.sitePath, config),
  }));
  for (const f of out.files) await writeOutputFile(ctx.io.fs, outputDir, f.file, f.contents);
  for (const w of out.warnings) ctx.io.log.warn(`core: ${formatCoreError(w).trim()}`);
  ctx.state.processed = { pages: out.pages, rewriteRules: out.rewriteRules, warnings: out.warnings, files: out.files.map((f) => f.file) };
  ctx.io.log.info(`processed ${pages.length} pages; wrote ${out.files.length} files; ${out.pages.length} markdown twins`);
}
