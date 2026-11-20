// The certificates stage's outside world, faked only at the io/ seams: the live site serves (or not) a pair over
// HTTP, the lego release is a stand-in archive whose sha256 the test pins, and `tar`/`lego` are recorded by
// recordingProc — running the real lego would need Cloudflare and Let's Encrypt (certificates-e2e.yml does that).
// fs stays real: the stage writes into a temp output directory and lego's temp directory must really be removed.
import { createHash, X509Certificate } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Certificate } from '../../src/core/types-index.js';
import type { HttpResponse, ProcResult } from '../../src/io/types.js';
import type { PairText } from '../../src/lib/certificates.js';
import type { StageContext } from '../../src/stages/context.js';
import { makeContext, makeInputs } from './context.js';
import { fakeCore, sampleConfig } from './fake-core.js';
import { testIO } from './io.js';
import { recordingProc, tempDir, type ProcCall, type RecordingProc } from './world.js';

export const ORIGIN = 'https://geo.example.com';
export const DOMAIN = 'local.example.com';
export const LEGO_URL = 'https://example.test/lego.tar.gz';
export const ARCHIVE = new TextEncoder().encode('stand-in lego archive');
export const CERT: Certificate = {
  domain: DOMAIN, path: 'agent/loopback', renewWithinDays: 30, keyType: 'ec-256', acmeDirectory: 'staging', acmeEmail: 'ops@example.com',
};

export const notAfterMs = (pem: string): number => new X509Certificate(pem).validToDate.getTime();

/** What the fake lego does: write this pair where lego would, or exit non-zero with this output. */
export type LegoBehaviour = { issue: PairText } | { fail: string };

export interface CertWorld { ctx: StageContext; proc: RecordingProc; outputDir: string; runnerTemp: string; legoCalls: () => ProcCall[] }

export async function certWorld(o: {
  live: PairText | undefined; nowMs: number; deploy: boolean; mode: 'auto' | 'force'; lego: LegoBehaviour; liveStatus?: number;
}): Promise<CertWorld> {
  const outputDir = await tempDir('gh-cert-out-');
  const runnerTemp = await tempDir('gh-runner-');
  const serve = (body: string | undefined): HttpResponse =>
    o.liveStatus !== undefined ? { status: o.liveStatus, headers: {}, body: 'error' }
      : body === undefined ? { status: 404, headers: {}, body: 'not found' } : { status: 200, headers: {}, body };
  const http = {
    request: (req: { url: string }): Promise<HttpResponse> => {
      if (req.url === `${ORIGIN}/${CERT.path}.pem`) return Promise.resolve(serve(o.live?.pem));
      if (req.url === `${ORIGIN}/${CERT.path}.key`) return Promise.resolve(serve(o.live?.key));
      return Promise.reject(new Error(`unexpected HTTP ${req.url}`));
    },
    download: (url: string): Promise<Uint8Array> => (url === LEGO_URL ? Promise.resolve(ARCHIVE) : Promise.reject(new Error(`GET ${url}: HTTP 404`))),
  };
  const proc = recordingProc(async (c): Promise<ProcResult | undefined> => {
    if (!c.command.endsWith('/lego')) return undefined;
    if ('fail' in o.lego) return { code: 1, stdout: '', stderr: o.lego.fail };
    const dataDir = c.args[c.args.indexOf('--path') + 1] ?? '';
    await mkdir(join(dataDir, 'certificates'), { recursive: true });
    await writeFile(join(dataDir, 'certificates', `${DOMAIN}.crt`), o.lego.issue.pem);
    await writeFile(join(dataDir, 'certificates', `${DOMAIN}.key`), o.lego.issue.key);
    return undefined;
  });
  const base = testIO({ http, env: { RUNNER_TEMP: runnerTemp }, proc });
  const io = { ...base, clock: { nowMs: () => o.nowMs, sleep: (ms: number) => base.clock.sleep(ms) } };
  const inputs = makeInputs({ deploy: o.deploy, certificateRenewal: o.mode, apiToken: o.deploy ? 'test-token' : '' });
  const state = { config: { ...sampleConfig(ORIGIN), certificates: [CERT] }, build: { outputDir, notFoundHandling: '404-page' as const } };
  const ctx = makeContext({ io, core: fakeCore({ score: 90, blockingFails: false }), inputs, cfBaseUrl: 'http://127.0.0.1:9', state });
  ctx.lego = { kind: 'asset', url: LEGO_URL, sha256: createHash('sha256').update(ARCHIVE).digest('hex') };
  return { ctx, proc, outputDir, runnerTemp, legoCalls: () => proc.calls.filter((c) => c.command.endsWith('/lego')) };
}
