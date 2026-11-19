import { asObject, asString } from '../../lib/json.js';
import type { CfClient } from './client.js';

export interface WorkerDomain { hostname: string; service: string; zoneId: string }

export async function listWorkerDomains(cf: CfClient, accountId: string, hostname: string): Promise<WorkerDomain[]> {
  const items = await cf.list(`/accounts/${accountId}/workers/domains?hostname=${encodeURIComponent(hostname)}`, 50);
  return items.map((u, i) => {
    const d = asObject(u, `workers.domains[${i}]`);
    return { hostname: asString(d.hostname, 'hostname'), service: asString(d.service, 'service'), zoneId: asString(d.zone_id, 'zone_id') };
  });
}

/** Binds `hostname` to the Worker as a Custom Domain (PUT /accounts/{account_id}/workers/domains). */
export async function attachWorkerDomain(cf: CfClient, accountId: string, d: { hostname: string; service: string; zoneId: string }): Promise<void> {
  await cf.call('PUT', `/accounts/${accountId}/workers/domains`, { hostname: d.hostname, service: d.service, zone_id: d.zoneId, environment: 'production' });
}
