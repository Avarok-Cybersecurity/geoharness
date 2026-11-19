import { join } from 'node:path';
import { createProxiedCname, listDnsRecords } from '../io/cloudflare/dns.js';
import { addPagesDomain, listPagesDomains, pagesProjectExists } from '../io/cloudflare/pages.js';
import { findZoneForHost } from '../io/cloudflare/zones.js';
import { generateWranglerConfig, negotiateEntry } from '../lib/wrangler-generate.js';
import { need, primaryHost, type StageContext } from './context.js';
import { runToolOk, wranglerEnv } from './tools.js';

const DEPLOY_TIMEOUT_MS = 20 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

async function previousSitemap(ctx: StageContext, host: string): Promise<string | undefined> {
  try {
    const r = await ctx.io.http.request({ method: 'GET', url: `https://${host}/sitemap.xml`, headers: {}, timeoutMs: FETCH_TIMEOUT_MS, redirect: 'follow' });
    return r.status === 200 ? r.body : undefined;
  } catch (e) {
    ctx.io.log.info(`no previous sitemap (${e instanceof Error ? e.message : String(e)}); IndexNow will submit every URL`);
    return undefined;
  }
}

async function deployWorkers(ctx: StageContext): Promise<void> {
  const built = need(ctx.state, 'build', 'deploy');
  const access = need(ctx.state, 'access', 'deploy');
  const run = { cwd: ctx.inputs.sitePath, env: wranglerEnv(ctx), timeoutMs: DEPLOY_TIMEOUT_MS };
  if (built.repoWranglerConfig !== undefined) {
    if (access.negotiation === 'negotiate-worker') {
      ctx.io.log.warn('The repo owns its Worker: import { negotiate } from edge/negotiate.mjs in it so agents get markdown twins.');
    }
    await runToolOk(ctx, 'wrangler', ['deploy', '--config', built.repoWranglerConfig], run);
    return;
  }
  let main: string | undefined;
  if (access.negotiation === 'negotiate-worker') {
    main = join(ctx.inputs.stateDir, 'negotiate-worker.mjs');
    await ctx.io.fs.writeText(main, negotiateEntry(ctx.negotiateModule));
  }
  const config = generateWranglerConfig({
    name: ctx.inputs.projectName, outputDir: built.outputDir, domains: ctx.inputs.domains, notFoundHandling: built.notFoundHandling, main,
  });
  const file = join(ctx.inputs.stateDir, 'wrangler.json');
  await ctx.io.fs.writeText(file, `${JSON.stringify(config, null, 2)}\n`);
  await runToolOk(ctx, 'wrangler', ['deploy', '--config', file], run);
}

async function ensurePagesDomains(ctx: StageContext): Promise<void> {
  const { accountId, projectName, domains } = ctx.inputs;
  const attached = new Set(await listPagesDomains(ctx.cf, accountId, projectName));
  const target = `${projectName}.pages.dev`;
  for (const domain of domains) {
    if (!attached.has(domain)) await addPagesDomain(ctx.cf, accountId, projectName, domain);
    const zone = await findZoneForHost(ctx.cf, domain);
    if (zone === undefined) throw new Error(`no access to the zone of ${domain}`);
    const records = await listDnsRecords(ctx.cf, zone.id, domain);
    if (records.length === 0) {
      await createProxiedCname(ctx.cf, zone.id, domain, target);
      ctx.io.log.info(`DNS: CNAME ${domain} → ${target} (proxied)`);
    } else if (!records.some((r) => r.type === 'CNAME' && r.content === target)) {
      throw new Error(`DNS for ${domain} already points elsewhere (${records.map((r) => `${r.type} ${r.content}`).join(', ')}); not overwriting`);
    }
  }
}

async function deployPages(ctx: StageContext): Promise<void> {
  const built = need(ctx.state, 'build', 'deploy');
  const branch = ctx.io.env.get('GITHUB_REF_NAME');
  if (branch === undefined || branch === '') throw new Error('GITHUB_REF_NAME is not set; the pages target deploys to that branch');
  const run = { cwd: ctx.inputs.sitePath, env: wranglerEnv(ctx), timeoutMs: DEPLOY_TIMEOUT_MS };
  if (!(await pagesProjectExists(ctx.cf, ctx.inputs.accountId, ctx.inputs.projectName))) {
    await runToolOk(ctx, 'wrangler', ['pages', 'project', 'create', ctx.inputs.projectName, '--production-branch', branch], run);
  }
  await runToolOk(ctx, 'wrangler', ['pages', 'deploy', built.outputDir, '--project-name', ctx.inputs.projectName,
    '--branch', branch, '--commit-hash', ctx.inputs.buildId], run);
  await ensurePagesDomains(ctx);
}

export async function deployStage(ctx: StageContext): Promise<void> {
  const host = primaryHost(need(ctx.state, 'config', 'deploy'));
  const prev = await previousSitemap(ctx, host);
  if (prev !== undefined) ctx.state.previousSitemap = prev;
  if (ctx.inputs.target === 'workers') await deployWorkers(ctx);
  else await deployPages(ctx);
  ctx.state.deploy = { url: `https://${host}/`, target: ctx.inputs.target };
}
