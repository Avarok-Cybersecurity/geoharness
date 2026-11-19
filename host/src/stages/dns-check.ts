import type { DnsRecord } from '../io/cloudflare/dns.js';
import { listDnsRecords } from '../io/cloudflare/dns.js';
import { listWorkerDomains } from '../io/cloudflare/workers-domains.js';
import type { Zone } from '../io/cloudflare/zones.js';
import type { StageContext } from './context.js';

/** Record types that stop Cloudflare from binding a Worker Custom Domain to the name (error 100117). */
const BLOCKING_TYPES = new Set(['A', 'AAAA', 'CNAME']);

export const blockingRecords = (records: DnsRecord[]): DnsRecord[] => records.filter((r) => BLOCKING_TYPES.has(r.type));

export const describeRecord = (r: DnsRecord): string => `${r.type} → ${r.content}${r.proxied ? ' (proxied)' : ''}`;

/** The Pages project a record points at (`<project>.pages.dev`), if any. */
export function pagesProjectOf(r: DnsRecord): string | undefined {
  return r.type === 'CNAME' && r.content.endsWith('.pages.dev') ? r.content.slice(0, -'.pages.dev'.length) : undefined;
}

interface Conflict { host: string; records: DnsRecord[] }

function conflictMessage(ctx: StageContext, zone: Zone, conflicts: Conflict[]): string {
  const { accountId, projectName, takeoverDns } = ctx.inputs;
  const lines = [
    'These domains still have their own DNS records, so wrangler would upload the Worker and then fail to bind them ' +
      'as Custom Domains (Cloudflare error 100117, "already has externally managed DNS records"):',
    ...conflicts.flatMap((c) => c.records.map((r) => `  - ${c.host}: ${describeRecord(r)}`)),
    'To move them without downtime, for each host in turn and back to back (the Worker must exist; a run with ' +
      'takeover-dns: true uploads it first):',
    ...conflicts.flatMap((c) => [
      ...c.records.map((r) => `  DELETE /zones/${zone.id}/dns_records/${r.id}`),
      `  PUT /accounts/${accountId}/workers/domains ${JSON.stringify({ hostname: c.host, service: projectName, zone_id: zone.id, environment: 'production' })}`,
    ]),
    'then remove each host from the Pages project (or whatever the records served) so the edge stops mixing the two, and rerun.',
  ];
  lines.push(takeoverDns === false
    ? 'takeover-dns is false: move them by hand as above; GeoHarness will not change these records.'
    : 'Or set takeover-dns: true and GeoHarness does the DELETE + PUT pairs itself, right after uploading the Worker.');
  return lines.join('\n');
}

/**
 * Preflight for the workers target: each domain must be free for a Worker Custom Domain, already be one of this
 * Worker, or (takeover-dns: true) be taken over at deploy. Returns the hosts to take over. Never touches DNS.
 */
export async function checkHostDns(ctx: StageContext, zone: Zone): Promise<string[]> {
  const { accountId, projectName, domains } = ctx.inputs;
  const conflicts: Conflict[] = [];
  for (const host of domains) {
    const bound = (await listWorkerDomains(ctx.cf, accountId, host)).find((d) => d.hostname === host);
    if (bound?.service === projectName) continue;
    if (bound !== undefined) {
      throw new Error(`${host} is a Custom Domain of another Worker, ${bound.service}; GeoHarness never takes a host from ` +
        `another Worker. Detach it there (or deploy with project-name: ${bound.service}) and rerun.`);
    }
    const records = blockingRecords(await listDnsRecords(ctx.cf, zone.id, host));
    if (records.length > 0) conflicts.push({ host, records });
  }
  if (conflicts.length === 0) return [];
  if (ctx.inputs.takeoverDns !== true) throw new Error(conflictMessage(ctx, zone, conflicts));
  const hosts = conflicts.map((c) => c.host);
  ctx.io.log.warn(`takeover-dns: true — after uploading the Worker, ${hosts.join(', ')} move from their DNS records to Worker ${projectName}`);
  return hosts;
}
