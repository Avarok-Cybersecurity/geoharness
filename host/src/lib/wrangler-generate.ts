import type { NotFoundHandling } from '../adapters/types.js';

/**
 * Fixed so deploys are reproducible; bump deliberately. It must not be newer than the workerd bundled with the
 * pinned wrangler (4.156.0 supports up to 2026-10-30): the pre-deploy Lighthouse gate serves the same config
 * with `wrangler dev`, which refuses a newer date.
 */
export const COMPATIBILITY_DATE = '2026-10-30';

export interface GeneratedWorker {
  name: string;
  outputDir: string;
  domains: string[];
  notFoundHandling: NotFoundHandling;
  /** Present in negotiate-worker mode: the entry that runs edge/negotiate.mjs before assets. */
  main: string | undefined;
}

/** wrangler.json for an assets-only Worker (or the negotiate fallback) on Custom Domains. */
export function generateWranglerConfig(w: GeneratedWorker): Record<string, unknown> {
  const assets: Record<string, unknown> = {
    directory: w.outputDir,
    html_handling: 'auto-trailing-slash',
    not_found_handling: w.notFoundHandling,
  };
  const config: Record<string, unknown> = {
    name: w.name,
    compatibility_date: COMPATIBILITY_DATE,
    workers_dev: false,
    routes: w.domains.map((pattern) => ({ pattern, custom_domain: true })),
    assets,
  };
  if (w.main !== undefined) {
    config.main = w.main;
    assets.binding = 'ASSETS';
    assets.run_worker_first = true;
  }
  return config;
}

export function negotiateEntry(negotiateModule: string): string {
  return [
    `import { negotiate, varyAccept } from ${JSON.stringify(negotiateModule)};`,
    '',
    'export default {',
    '  async fetch(request, env) {',
    '    return (await negotiate(request, env)) ?? varyAccept(await env.ASSETS.fetch(request));',
    '  },',
    '};',
    '',
  ].join('\n');
}
