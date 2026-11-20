import { cp, mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeFs } from '../../src/io/node/fs.js';
import { nodeGit } from '../../src/io/node/git.js';
import { nodeNet } from '../../src/io/node/net.js';
import { nodeProc } from '../../src/io/node/proc.js';
import type { Http, HttpRequest, HttpResponse, HostIO, Log, Proc } from '../../src/io/types.js';

export const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'fixtures');

export interface RecordingLog extends Log { lines: string[] }

export function recordingLog(): RecordingLog {
  const lines: string[] = [];
  return {
    lines,
    info: (m) => { lines.push(m); },
    warn: (m) => { lines.push(`WARN ${m}`); },
    error: (m) => { lines.push(`ERROR ${m}`); },
    group: (_t, body) => body(),
  };
}

/** Real fs/git/proc; http, env and clock are supplied per test (they are the seams under test). */
export function testIO(opts: { http: Http; env: Record<string, string>; proc?: Proc }): HostIO & { log: RecordingLog; slept: number[] } {
  const log = recordingLog();
  const realProc = nodeProc(log);
  let now = 0;
  const slept: number[] = [];
  return {
    fs: nodeFs,
    git: nodeGit(realProc),
    http: opts.http,
    proc: opts.proc ?? realProc,
    net: nodeNet,
    log,
    env: { get: (n) => opts.env[n] },
    clock: { nowMs: () => now, sleep: (ms) => { slept.push(ms); now += ms; return Promise.resolve(); } },
    slept,
  };
}

export async function copyFixture(name: string): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), `gh-${name}-`)));
  await cp(join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

export const noHttp: Http = {
  request: (req: HttpRequest): Promise<HttpResponse> => Promise.reject(new Error(`unexpected HTTP ${req.method} ${req.url}`)),
  download: (url: string): Promise<Uint8Array> => Promise.reject(new Error(`unexpected download ${url}`)),
};
