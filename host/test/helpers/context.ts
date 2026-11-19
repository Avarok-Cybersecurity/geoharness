import type { Core } from '../../src/core/core.js';
import type { Inputs } from '../../src/inputs.js';
import { CfClient } from '../../src/io/cloudflare/client.js';
import type { HostIO } from '../../src/io/types.js';
import { OPTIMIZATION_IDS } from '../../src/lib/optimizations.js';
import type { RunState, StageContext } from '../../src/stages/context.js';

export const SHA = 'abcdef0123456789abcdef0123456789abcdef01';
export const ACCOUNT = '0123456789abcdef0123456789abcdef';

/** Inputs as action.yml would deliver them for the fixture site; every value is stated by the test. */
export function makeInputs(over: Partial<Inputs>): Inputs {
  return {
    apiToken: 'test-token', accountId: ACCOUNT, workspace: '/w', sitePath: '/w/site', adapter: 'auto',
    buildCommand: undefined, outputDir: undefined, target: 'workers', projectName: 'geo-site',
    domains: ['geo.example.com'], lighthouse: false, lighthouseMaxUrls: undefined, geoMinScore: 80,
    optimizations: new Set(OPTIMIZATION_IDS), buildId: SHA, stateDir: '/tmp/unused', ...over,
  };
}

export function makeContext(o: { io: HostIO; core: Core; inputs: Inputs; cfBaseUrl: string; state: RunState }): StageContext {
  const cf = new CfClient({ http: o.io.http, token: o.inputs.apiToken, baseUrl: o.cfBaseUrl, timeoutMs: 5000 });
  return { io: o.io, core: o.core, inputs: o.inputs, cf, state: o.state, negotiateModule: '/action/edge/negotiate.mjs' };
}
