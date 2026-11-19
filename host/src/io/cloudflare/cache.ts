import { asObject } from '../../lib/json.js';
import type { CfClient } from './client.js';
import type { OnOff } from './settings.js';

const SMART_TIERED = 'tiered_cache_smart_topology_enable';

export async function getSmartTieredCache(cf: CfClient, zoneId: string): Promise<unknown> {
  return asObject(await cf.call('GET', `/zones/${zoneId}/cache/${SMART_TIERED}`), SMART_TIERED).value;
}

export async function setSmartTieredCache(cf: CfClient, zoneId: string, value: OnOff): Promise<void> {
  await cf.call('PATCH', `/zones/${zoneId}/cache/${SMART_TIERED}`, { value });
}
