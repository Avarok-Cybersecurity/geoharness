import type { PageInput, SiteConfig } from '../core/types-index.js';
import type { HostIO } from '../io/types.js';
import type { AdapterId } from './ids.js';

export interface Detection { confidence: number; evidence: string[] }

/** How the site is served when GeoHarness generates the wrangler config itself. */
export type NotFoundHandling = '404-page' | 'single-page-application';

export interface BuildContext {
  siteDir: string;
  io: HostIO;
  config: SiteConfig;
}

export interface BuildResult {
  outputDir: string;
  notFoundHandling: NotFoundHandling;
  /** Set when the repo owns its wrangler config (worker-assets); deploy then uses it as-is. */
  repoWranglerConfig?: string;
}

export interface Adapter {
  id: AdapterId;
  detect(dir: string, io: HostIO): Promise<Detection>;
  build(ctx: BuildContext): Promise<BuildResult>;
  pages(outputDir: string, io: HostIO): Promise<PageInput[]>;
}

/** Inputs that steer adapters; both come straight from the action and are never invented. */
export interface AdapterOptions {
  siteDir: string;
  buildCommand: string | undefined;
  outputDir: string | undefined;
}

/** Explicit ceiling for any site build step. */
export const BUILD_TIMEOUT_MS = 30 * 60 * 1000;
