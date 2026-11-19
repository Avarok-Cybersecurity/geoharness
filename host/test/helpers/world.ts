// The outside world of a run, faked only at the io/ seams:
// - Http: Cloudflare calls go over real fetch to the recording fake API (cf-server.ts); the deployed site is
//   answered from the processed output directory (what wrangler would have uploaded); IndexNow is recorded.
// - Proc: wrangler/lhci are recorded, not run — running them would deploy or download Chromium. git stays real.
//   A started process (wrangler dev) is recorded too; its stand-in serves the output directory at 127.0.0.1 until
//   stopped, so the readiness poll and teardown run for real.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeHttp } from '../../src/io/node/http.js';
import type { Http, HttpRequest, HttpResponse, Proc, ProcOptions, ProcResult, StartOptions } from '../../src/io/types.js';
import type { FakeCf } from './cf-server.js';

export interface ProcCall { command: string; args: readonly string[]; options: ProcOptions | StartOptions }

export interface RecordingProc extends Proc { calls: ProcCall[]; started: number; stopped: number }

export function recordingProc(onCall?: (c: ProcCall) => Promise<ProcResult | undefined>, onStart?: (c: ProcCall) => void, onStop?: () => void): RecordingProc {
  const p: RecordingProc = {
    calls: [], started: 0, stopped: 0,
    async run(command, args, options) {
      const call = { command, args, options };
      p.calls.push(call);
      const result = onCall === undefined ? undefined : await onCall(call);
      return result ?? { code: 0, stdout: '', stderr: '' };
    },
    start(command, args, options) {
      const call = { command, args, options };
      p.calls.push(call);
      p.started += 1;
      onStart?.(call);
      let exit: (r: ProcResult) => void = () => undefined;
      const exited = new Promise<ProcResult>((r) => { exit = r; });
      return {
        exited,
        output: () => '',
        stop: () => {
          p.stopped += 1;
          onStop?.();
          exit({ code: 143, stdout: '', stderr: '' });
          return exited.then(() => undefined);
        },
      };
    },
  };
  return p;
}

export interface SiteWorld {
  http: Http;
  indexnow: HttpRequest[];
  /** Number of initial page loads that still serve the previous build (edge propagation). */
  staleLoads: number;
  outputDir: string | undefined;
  liveStatusFor: (ua: string) => number;
  /** What the local wrangler stand-in serves at 127.0.0.1 while running. */
  localDir: string | undefined;
  /** Extra HTML appended before </body> by "the edge" (e.g. an injected beacon). */
  injectHtml: string;
}

async function serveDir(dir: string, url: URL, md: boolean, status: number): Promise<HttpResponse> {
  const rel = url.pathname.endsWith('/') ? `${url.pathname}index.${md ? 'md' : 'html'}` : url.pathname;
  try {
    return { status, headers: { 'content-type': md ? 'text/markdown' : 'text/html', vary: 'Accept' }, body: await readFile(join(dir, rel), 'utf8') };
  } catch {
    return { status: 404, headers: {}, body: 'not found' };
  }
}

export function world(cf: FakeCf, host: string): SiteWorld {
  const w: SiteWorld = {
    indexnow: [], staleLoads: 0, outputDir: undefined, liveStatusFor: () => 200, localDir: undefined, injectHtml: '',
    http: {
      async request(req) {
        if (req.url.startsWith(cf.baseUrl)) return nodeHttp.request(req);
        const url = new URL(req.url);
        if (url.host === 'api.indexnow.org') {
          w.indexnow.push(req);
          return { status: 202, headers: {}, body: '' };
        }
        const md = (req.headers.accept ?? '').includes('text/markdown');
        if (url.hostname === '127.0.0.1' && w.localDir !== undefined) return serveDir(w.localDir, url, md, 200);
        if (url.host !== host || w.outputDir === undefined) return { status: 404, headers: {}, body: '' };
        const res = await serveDir(w.outputDir, url, md, w.liveStatusFor(req.headers['user-agent'] ?? ''));
        if (url.searchParams.has('geoharness-poll') && w.staleLoads > 0) {
          w.staleLoads -= 1;
          res.body = res.body.replace(/name="build" content="[^"]+"/, 'name="build" content="previous"');
        }
        if (!md) res.body = res.body.replace('</body>', `${w.injectHtml}</body>`);
        return res;
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
