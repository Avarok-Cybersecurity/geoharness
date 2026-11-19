import type { AdapterId } from '../adapters/ids.js';
import type { BuildResult } from '../adapters/types.js';
import type { Core } from '../core/core.js';
import type { AuditReport, CoreError, PageSummary, RewriteRule, SiteConfig } from '../core/types-index.js';
import type { Inputs } from '../inputs.js';
import type { CfClient } from '../io/cloudflare/client.js';
import type { Zone } from '../io/cloudflare/zones.js';
import type { HostIO } from '../io/types.js';
import type { OptimizationId } from '../lib/optimizations.js';

/** Everything a stage produces for later stages; persisted as JSON between `geoharness <stage>` calls. */
export interface RunState {
  config?: SiteConfig;
  /** Set by preflight when `deploy: false`. */
  dryRun?: boolean;
  access?: {
    zone: Zone | undefined;
    /** rules: Accept negotiation via zone Transform Rules; negotiate-worker: fallback Worker (no zone access). */
    negotiation: 'rules' | 'negotiate-worker';
    optimizations: OptimizationId[];
  };
  adapterId?: AdapterId;
  build?: BuildResult;
  processed?: {
    pages: PageSummary[];
    rewriteRules: RewriteRule[];
    warnings: CoreError[];
    files: string[];
  };
  staticAudit?: AuditReport;
  lighthouse?: { skipped: boolean; urls: string[]; links: Record<string, string> };
  previousSitemap?: string;
  deploy?: { url: string; target: 'workers' | 'pages' };
  zoneChanges?: string[];
  liveAudit?: AuditReport;
  indexnow?: { submitted: string[]; status: number | undefined };
}

export interface StageContext {
  io: HostIO;
  core: Core;
  inputs: Inputs;
  cf: CfClient;
  state: RunState;
  /** Absolute path of edge/negotiate.mjs shipped with the action. */
  negotiateModule: string;
}

export type Stage = (ctx: StageContext) => Promise<void>;

export function need<K extends keyof RunState>(state: RunState, key: K, stage: string): NonNullable<RunState[K]> {
  const v = state[key];
  if (v === undefined) throw new Error(`stage ${stage} needs "${key}" from an earlier stage; run the stages in order`);
  return v;
}

/** The host from the config origin: rewrite rules, live checks and IndexNow are keyed on it. */
export function primaryHost(config: SiteConfig): string {
  return new URL(config.site.origin).host;
}
