import { asObject, type JsonObject } from '../../lib/json.js';
import type { CfClient } from './client.js';

export interface BotManagementPatch { fight_mode?: boolean; ai_bots_protection?: 'block' | 'disabled' | 'only_on_ad_pages' }

export async function getBotManagement(cf: CfClient, zoneId: string): Promise<JsonObject> {
  return asObject(await cf.call('GET', `/zones/${zoneId}/bot_management`), 'bot_management');
}

export async function putBotManagement(cf: CfClient, zoneId: string, patch: BotManagementPatch): Promise<void> {
  await cf.call('PUT', `/zones/${zoneId}/bot_management`, patch);
}
