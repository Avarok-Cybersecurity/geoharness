import { asObject, asString } from '../../lib/json.js';
import type { CfClient } from './client.js';

export interface DnsRecord { id: string; type: string; name: string; content: string; proxied: boolean; ttl: number }

export async function listDnsRecords(cf: CfClient, zoneId: string, name: string): Promise<DnsRecord[]> {
  const items = await cf.list(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}`, 100);
  return items.map((u, i) => {
    const r = asObject(u, `dns_records[${i}]`);
    return {
      id: asString(r.id, 'dns.id'), type: asString(r.type, 'dns.type'), name: asString(r.name, 'dns.name'),
      content: asString(r.content, 'dns.content'), proxied: r.proxied === true,
      ttl: typeof r.ttl === 'number' ? r.ttl : 1,
    };
  });
}

export async function createProxiedCname(cf: CfClient, zoneId: string, name: string, target: string): Promise<void> {
  await cf.call('POST', `/zones/${zoneId}/dns_records`, { type: 'CNAME', name, content: target, proxied: true, ttl: 1 });
}

export async function deleteDnsRecord(cf: CfClient, zoneId: string, id: string): Promise<void> {
  await cf.call('DELETE', `/zones/${zoneId}/dns_records/${encodeURIComponent(id)}`);
}

/** Re-creates a record as it was read (used to undo a takeover whose Custom Domain could not be bound). */
export async function recreateDnsRecord(cf: CfClient, zoneId: string, r: DnsRecord): Promise<void> {
  await cf.call('POST', `/zones/${zoneId}/dns_records`, { type: r.type, name: r.name, content: r.content, proxied: r.proxied, ttl: r.ttl });
}
