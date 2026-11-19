import { getBotManagement, putBotManagement, type BotManagementPatch } from '../io/cloudflare/bot-management.js';
import { getSmartTieredCache, setSmartTieredCache } from '../io/cloudflare/cache.js';
import { zstdCompressionRule } from '../io/cloudflare/compression.js';
import { getEntrypointRules, putEntrypointRules } from '../io/cloudflare/rulesets.js';
import { getZoneSetting, setZoneSetting, type OnOff, type ZoneSettingId } from '../io/cloudflare/settings.js';
import type { OptimizationId } from '../lib/optimizations.js';
import { planTaggedRules } from '../lib/tagged-rules.js';
import type { StageContext } from './context.js';

/** Desired value of each plain on/off zone setting GeoHarness manages (citation cf-speed). */
const SETTINGS: Partial<Record<OptimizationId, { id: ZoneSettingId; value: OnOff }>> = {
  email_obfuscation: { id: 'email_obfuscation', value: 'off' },
  rocket_loader: { id: 'rocket_loader', value: 'off' },
  early_hints: { id: 'early_hints', value: 'on' },
  http3: { id: 'http3', value: 'on' },
  brotli: { id: 'brotli', value: 'on' },
};

export interface ZoneTarget { zoneId: string; hosts: string[]; tag: string }

/** Applies each enabled optimization only when it differs; returns human-readable changes. */
export async function applyOptimizations(ctx: StageContext, t: ZoneTarget, enabled: OptimizationId[]): Promise<string[]> {
  const changes: string[] = [];
  const on = new Set(enabled);
  for (const [opt, s] of Object.entries(SETTINGS) as [OptimizationId, { id: ZoneSettingId; value: OnOff }][]) {
    if (!on.has(opt)) continue;
    const current = await getZoneSetting(ctx.cf, t.zoneId, s.id);
    if (current === s.value) continue;
    await setZoneSetting(ctx.cf, t.zoneId, s.id, s.value);
    changes.push(`${s.id}: ${String(current)} → ${s.value}`);
  }
  if (on.has('smart_tiered_cache')) {
    const current = await getSmartTieredCache(ctx.cf, t.zoneId);
    if (current !== 'on') {
      await setSmartTieredCache(ctx.cf, t.zoneId, 'on');
      changes.push(`smart tiered cache: ${String(current)} → on`);
    }
  }
  if (on.has('zstd')) {
    const existing = await getEntrypointRules(ctx.cf, t.zoneId, 'http_response_compression');
    const plan = planTaggedRules(existing, [zstdCompressionRule(t.hosts, t.tag)], [t.tag]);
    if (plan.changed) {
      await putEntrypointRules(ctx.cf, t.zoneId, 'http_response_compression', plan.rules);
      changes.push(`compression rule (zstd): ${plan.removed} replaced, ${plan.added} written`);
    }
  }
  if (on.has('bot_fight_mode') || on.has('ai_bots_protection')) {
    const current = await getBotManagement(ctx.cf, t.zoneId);
    const patch: BotManagementPatch = {};
    if (on.has('bot_fight_mode') && current.fight_mode !== false) patch.fight_mode = false;
    if (on.has('ai_bots_protection') && current.ai_bots_protection !== 'disabled') patch.ai_bots_protection = 'disabled';
    if (Object.keys(patch).length > 0) {
      await putBotManagement(ctx.cf, t.zoneId, patch);
      changes.push(`bot management: ${JSON.stringify(patch)}`);
    }
  }
  return changes;
}
