import { join } from 'node:path';
import { unwrap } from '../core/core.js';
import { findZoneForHost } from '../io/cloudflare/zones.js';
import { CloudflareApiError } from '../io/cloudflare/client.js';
import { probe } from '../io/cloudflare/probe.js';
import type { OptimizationId } from '../lib/optimizations.js';
import { featurePermissions, probePath } from '../lib/permissions.js';
import { primaryHost, type StageContext } from './context.js';
import { checkHostDns } from './dns-check.js';

export const CONFIG_FILE = 'geoharness.toml';

async function findZone(ctx: StageContext, host: string): Promise<Awaited<ReturnType<typeof findZoneForHost>>> {
  try {
    return await findZoneForHost(ctx.cf, host);
  } catch (e) {
    if (e instanceof CloudflareApiError && (e.status === 401 || e.status === 403)) return undefined;
    throw e;
  }
}

export async function preflight(ctx: StageContext): Promise<void> {
  const { io, inputs } = ctx;
  if (!(await io.fs.isDirectory(inputs.sitePath))) throw new Error(`site-path ${inputs.sitePath} is not a directory`);
  const toml = await io.fs.readTextIfExists(join(inputs.sitePath, CONFIG_FILE));
  if (toml === undefined) throw new Error(`${CONFIG_FILE} not found in site-path ${inputs.sitePath}`);
  const config = unwrap('parseConfig', ctx.core.parseConfig(toml));
  ctx.state.config = config;

  const host = primaryHost(config);
  if (!inputs.domains.includes(host)) throw new Error(`site.origin host ${host} is not listed in the domains input`);
  const missingEnv = config.env.filter((name) => io.env.get(name) === undefined);
  if (missingEnv.length > 0) throw new Error(`geoharness.toml env lists names that are not set: ${missingEnv.join(', ')}`);
  if (!inputs.deploy) {
    ctx.state.dryRun = true;
    io.log.info('deploy: false — dry run: no Cloudflare API call, no deploy, no zone change');
    return;
  }

  const zone = await findZone(ctx, host);
  const values: Record<string, string> = { account_id: inputs.accountId, zone_name: zone?.name ?? host };
  if (zone !== undefined) values.zone_id = zone.id;

  const features: string[] = inputs.target === 'workers' ? ['workers-deploy', 'workers-custom-domain'] : ['pages-deploy'];
  let optimizations: OptimizationId[] = [];
  let negotiation: 'rules' | 'negotiate-worker' = 'rules';
  if (zone === undefined) {
    if (inputs.target === 'pages') throw new Error(`no access to the zone of ${host}; the pages target needs it (Zone Read, DNS Write)`);
    negotiation = 'negotiate-worker';
    io.log.warn(`No access to the zone of ${host}. Falling back to the negotiate Worker (edge/negotiate.mjs): every request runs ` +
      'the Worker first, which counts against the Workers Free quota of 100,000 requests/day; past it Cloudflare fails closed ' +
      'with HTTP 429 (error 1027) until the daily reset. Grant Zone Read + Zone Transform Rules Write to serve twins with free rules instead.');
    if (inputs.optimizations.size > 0) io.log.warn(`zone optimizations skipped without zone access: ${[...inputs.optimizations].join(', ')}`);
  } else {
    io.log.info(`zone ${zone.name} (${zone.id}) serves ${host}`);
    if (inputs.target === 'pages') features.push('pages-custom-domain');
    features.push('rewrite-rules', ...inputs.optimizations);
    optimizations = [...inputs.optimizations];
  }

  const missing = new Map<string, string>();
  for (const id of features) {
    const f = featurePermissions(id);
    const result = await probe(ctx.cf, probePath(f.probe, values));
    io.log.info(`permission probe ${id}: ${result.ok ? 'ok' : 'DENIED'}`);
    if (!result.ok) for (const g of f.groups) missing.set(`${g.name} (${g.scope})`, id);
  }
  if (missing.size > 0) {
    const lines = [...missing].map(([group, feature]) => `  - ${group} — needed for ${feature}`);
    throw new Error(`The Cloudflare API token lacks permission groups:\n${lines.join('\n')}\n` +
      'Add them to the token, or opt out of the optional feature via extra-optimizations (e.g. "all -zstd").');
  }
  const takeover = inputs.target === 'workers' && zone !== undefined ? await checkHostDns(ctx, zone) : [];
  if (inputs.target === 'workers' && zone === undefined) {
    io.log.warn('No zone access: the domains\' DNS records cannot be checked; a host that still has its own A/AAAA/CNAME records fails the deploy with Cloudflare error 100117.');
  }
  ctx.state.access = { zone, negotiation, optimizations, takeover };
}
