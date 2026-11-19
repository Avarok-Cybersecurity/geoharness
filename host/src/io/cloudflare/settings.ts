import { asObject } from '../../lib/json.js';
import type { CfClient } from './client.js';

export type ZoneSettingId = 'email_obfuscation' | 'rocket_loader' | 'early_hints' | 'http3' | 'brotli';
export type OnOff = 'on' | 'off';

export async function getZoneSetting(cf: CfClient, zoneId: string, id: ZoneSettingId): Promise<unknown> {
  return asObject(await cf.call('GET', `/zones/${zoneId}/settings/${id}`), `setting ${id}`).value;
}

export async function setZoneSetting(cf: CfClient, zoneId: string, id: ZoneSettingId, value: OnOff): Promise<void> {
  await cf.call('PATCH', `/zones/${zoneId}/settings/${id}`, { value });
}
