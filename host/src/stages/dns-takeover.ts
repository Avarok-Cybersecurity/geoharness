import { deleteDnsRecord, listDnsRecords, recreateDnsRecord, type DnsRecord } from '../io/cloudflare/dns.js';
import { attachWorkerDomain } from '../io/cloudflare/workers-domains.js';
import { describeError } from '../lib/errors.js';
import type { StageContext } from './context.js';
import { blockingRecords, describeRecord, pagesProjectOf } from './dns-check.js';

/**
 * Moves each host from its own DNS records to the Worker: delete the records, then at once bind the Custom
 * Domain, host by host, so a host is unserved only between the two calls. The Worker must already exist. When the
 * bind fails the deleted records are put back before the error propagates. Returns lines for the summary.
 */
export async function takeOverHosts(ctx: StageContext, zoneId: string, worker: string, hosts: string[]): Promise<string[]> {
  const done: string[] = [];
  const pages = new Set<string>();
  for (const host of hosts) {
    const records = blockingRecords(await listDnsRecords(ctx.cf, zoneId, host));
    const deleted: DnsRecord[] = [];
    try {
      for (const r of records) {
        await deleteDnsRecord(ctx.cf, zoneId, r.id);
        deleted.push(r);
      }
      await attachWorkerDomain(ctx.cf, ctx.inputs.accountId, { hostname: host, service: worker, zoneId });
    } catch (e) {
      const restored = await restore(ctx, zoneId, deleted);
      throw new Error(`DNS takeover: binding ${host} to Worker ${worker} failed (${describeError(e)}); ${restored}`, { cause: e });
    }
    for (const r of records) {
      const p = pagesProjectOf(r);
      if (p !== undefined) pages.add(p);
    }
    const line = `${host}: deleted ${records.map(describeRecord).join(', ')}, now a Custom Domain of Worker ${worker}`;
    ctx.io.log.info(`DNS takeover: ${line}`);
    done.push(line);
  }
  for (const p of pages) {
    const msg = `remove these hosts from Pages project ${p} (Custom domains) now: until then the edge can still route some requests to Pages`;
    ctx.io.log.warn(msg);
    done.push(msg);
  }
  return done;
}

async function restore(ctx: StageContext, zoneId: string, deleted: DnsRecord[]): Promise<string> {
  try {
    for (const r of deleted) await recreateDnsRecord(ctx.cf, zoneId, r);
    return deleted.length === 0 ? 'no record had been deleted' : 'restored its DNS records';
  } catch (e) {
    return `restoring its DNS records ALSO failed (${describeError(e)}); recreate by hand: ${deleted.map((r) => `${r.name} ${describeRecord(r)}`).join('; ')}`;
  }
}
