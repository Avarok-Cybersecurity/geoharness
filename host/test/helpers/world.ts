// The outside world of a run, faked only at the io/ seams:
// - Http: Cloudflare calls go over real fetch to the recording fake API (cf-server.ts); the deployed site is
//   answered from the processed output directory (what wrangler would have uploaded); IndexNow is recorded.
// - Proc: wrangler/lhci are recorded, not run — running them would deploy or download Chromium. git stays real.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeHttp } from '../../src/io/node/http.js';
import type { Http, HttpRequest, Proc, ProcOptions } from '../../src/io/types.js';
import type { FakeCf } from './cf-server.js';

export interface ProcCall { command: string; args: readonly string[]; options: ProcOptions }

export function recordingProc(onCall?: (c: ProcCall) => Promise<void>): Proc & { calls: ProcCall[] } {
  const calls: ProcCall[] = [];
  return {
    calls,
    async run(command, args, options) {
      const call = { command, args, options };
      calls.push(call);
      if (onCall !== undefined) await onCall(call);
      return { code: 0, stdout: '', stderr: '' };
    },
  };
}

export interface SiteWorld {
  http: Http;
  indexnow: HttpRequest[];
  /** Number of initial page loads that still serve the previous build (edge propagation). */
  staleLoads: number;
  outputDir: string | undefined;
  liveStatusFor: (ua: string) => number;
}

export function world(cf: FakeCf, host: string): SiteWorld {
  const w: SiteWorld = {
    indexnow: [], staleLoads: 0, outputDir: undefined, liveStatusFor: () => 200,
    http: {
      async request(req) {
        if (req.url.startsWith(cf.baseUrl)) return nodeHttp.request(req);
        const url = new URL(req.url);
        if (url.host === 'api.indexnow.org') {
          w.indexnow.push(req);
          return { status: 202, headers: {}, body: '' };
        }
        if (url.host !== host || w.outputDir === undefined) return { status: 404, headers: {}, body: '' };
        const status = w.liveStatusFor(req.headers['user-agent'] ?? '');
        const md = (req.headers.accept ?? '').includes('text/markdown');
        const rel = url.pathname.endsWith('/') ? `${url.pathname}index.${md ? 'md' : 'html'}` : url.pathname;
        let body: string;
        try {
          body = await readFile(join(w.outputDir, rel), 'utf8');
        } catch {
          return { status: 404, headers: {}, body: 'not found' };
        }
        if (url.searchParams.has('geoharness-poll') && w.staleLoads > 0) {
          w.staleLoads -= 1;
          body = body.replace(/name="build" content="[^"]+"/, 'name="build" content="previous"');
        }
        return { status, headers: { 'content-type': md ? 'text/markdown' : 'text/html', vary: 'Accept' }, body };
      },
    },
  };
  return w;
}

export async function tempDir(prefix: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}

export function gitCommitAll(dir: string): void {
  const opts = { cwd: dir, stdio: 'ignore' as const };
  execFileSync('git', ['init', '-q'], opts);
  execFileSync('git', ['add', '.'], opts);
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'site'], opts);
}
