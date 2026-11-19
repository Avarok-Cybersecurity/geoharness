// The whole action run against the static fixture, with the outside world faked only at the io/ seams (world.ts).
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import type { Inputs } from '../../src/inputs.js';
import type { StageContext } from '../../src/stages/context.js';
import { startFakeCf, type FakeCf } from './cf-server.js';
import { makeContext, makeInputs } from './context.js';
import { fakeCore, type FakeCoreOptions } from './fake-core.js';
import { copyFixture, testIO } from './io.js';
import type { ProcResult } from '../../src/io/types.js';
import { gitCommitAll, recordingProc, tempDir, world, type ProcCall, type RecordingProc, type SiteWorld } from './world.js';

export const HOST = 'geo.example.com';
export const ZONE = { id: 'zone1', name: 'example.com' };
/** A Worker that already serves version v-prev, so a rollback has somewhere to go. */
export const CF_WITH_VERSION = {
  zones: [ZONE], workerDomains: [{ hostname: HOST, service: 'geo-site', zone_id: 'zone1' }],
  workerDeployments: { 'geo-site': [{ id: 'd2', created_on: '2026-11-18T00:00:00Z', versions: [{ version_id: 'v-prev', percentage: 100 }] }] },
};
let cf: FakeCf | undefined;
/** The fake Cloudflare API of the current test. */
export function currentCf(): FakeCf {
  if (cf === undefined) throw new Error('no fake Cloudflare API: call harness() first');
  return cf;
}
afterEach(async () => { await cf?.close(); cf = undefined; });

export interface Harness { ctx: StageContext; w: SiteWorld; proc: RecordingProc; summary: string; output: string; log: string[] }

export async function harness(o: { cfState?: Parameters<typeof startFakeCf>[0]; inputs?: Partial<Inputs>; core?: FakeCoreOptions; onProc?: (c: ProcCall) => Promise<ProcResult | undefined> }): Promise<Harness> {
  const site = await copyFixture('static');
  await writeFile(join(site, 'geoharness.toml'), `[site]\norigin = "https://${HOST}"\n`);
  gitCommitAll(site);
  const stateDir = await tempDir('gh-state-');
  const summary = join(stateDir, 'summary.md');
  const output = join(stateDir, 'output.txt');
  await writeFile(summary, '');
  await writeFile(output, '');
  cf = await startFakeCf(o.cfState ?? { zones: [ZONE], workerDomains: [{ hostname: HOST, service: 'geo-site', zone_id: 'zone1' }] });
  const w = world(cf, HOST);
  const proc = recordingProc(async (c) => {
    if (c.args.includes('deploy')) w.outputDir = join(site, 'public');
    return o.onProc === undefined ? undefined : o.onProc(c);
  }, (c) => {
    if (c.args.includes('dev')) w.localDir = join(site, 'public');
  }, () => { w.localDir = undefined; });
  const io = testIO({ http: w.http, env: { GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output }, proc });
  const inputs = makeInputs({ sitePath: site, outputDir: 'public', stateDir, ...o.inputs });
  const ctx = makeContext({ io, core: fakeCore(o.core ?? { score: 90, blockingFails: false }), inputs, cfBaseUrl: cf.baseUrl, state: {} });
  return { ctx, w, proc, summary, output, log: io.log.lines };
}

export const wranglerCalls = (h: Harness): ProcCall[] => h.proc.calls.filter((c) => c.args.includes('--package=wrangler@4.156.0'));

