import type { Running } from '../io/types.js';
import { COMPATIBILITY_DATE } from '../lib/wrangler-generate.js';
import { need, type StageContext } from './context.js';
import { TOOLS } from './tools.js';
import { workerConfig } from './worker-config.js';

export const LOCAL_READY = { intervalMs: 1000, timeoutMs: 180_000, requestTimeoutMs: 5000 } as const;
const LOCAL_IP = '127.0.0.1';
/** How much of the server's output an error message carries. */
const OUTPUT_TAIL_CHARS = 4000;

/**
 * Arguments for a local, account-free server of exactly what will be deployed: `wrangler dev --local` on the
 * deploy's own wrangler config (so `_headers`, html_handling and not_found_handling apply), or
 * `wrangler pages dev` on the output directory for the pages target.
 */
async function serverArgs(ctx: StageContext, port: number, inspectorPort: number, persistTo: string): Promise<string[]> {
  const common = ['--ip', LOCAL_IP, '--port', String(port), '--inspector-port', String(inspectorPort),
    '--persist-to', persistTo, '--show-interactive-dev-session=false'];
  if (ctx.inputs.target === 'pages') {
    const { outputDir } = need(ctx.state, 'build', 'lighthouse');
    return ['pages', 'dev', outputDir, '--compatibility-date', COMPATIBILITY_DATE, ...common];
  }
  const { file } = await workerConfig(ctx, 'lighthouse', { routes: true });
  // The real local origin, not the custom domain, so redirects and robots.txt stay on the audited server.
  return ['dev', '--config', file, '--local', '--infer-origin-from-routes=false', ...common];
}

function tail(running: Running): string {
  return running.output().slice(-OUTPUT_TAIL_CHARS);
}

/** Polls `url` until it answers 200; fails early when the server exits, and after a bounded time. */
async function waitReady(ctx: StageContext, running: Running, url: string): Promise<void> {
  let exit: number | undefined;
  void running.exited.then((r) => { exit = r.code; });
  const deadline = ctx.io.clock.nowMs() + LOCAL_READY.timeoutMs;
  for (;;) {
    let last: string;
    if (exit !== undefined) throw new Error(`wrangler exited with ${exit} before serving ${url}:\n${tail(running)}`);
    try {
      const r = await ctx.io.http.request({ method: 'GET', url, headers: { accept: 'text/html' }, timeoutMs: LOCAL_READY.requestTimeoutMs, redirect: 'manual' });
      if (r.status === 200) return;
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    if (ctx.io.clock.nowMs() + LOCAL_READY.intervalMs > deadline) {
      throw new Error(`local server did not serve ${url} within ${LOCAL_READY.timeoutMs / 1000}s (last: ${last}):\n${tail(running)}`);
    }
    await ctx.io.clock.sleep(LOCAL_READY.intervalMs);
  }
}

/**
 * Serves the processed output locally like Cloudflare will, runs `body` against its origin, and always stops
 * the server's whole process tree afterwards — on success, failure or timeout.
 */
export async function withLocalServer<T>(ctx: StageContext, firstPath: string, body: (origin: string) => Promise<T>): Promise<T> {
  const port = await ctx.io.net.freePort();
  const inspectorPort = await ctx.io.net.freePort();
  const persistTo = await ctx.io.fs.makeTempDir(ctx.inputs.stateDir, 'wrangler-dev-');
  const args = await serverArgs(ctx, port, inspectorPort, persistTo);
  const { pkg, bin } = TOOLS.wrangler;
  ctx.io.log.info(`$ ${bin} ${args.join(' ')}`);
  // No Cloudflare credentials: the local server never needs the account.
  const running = ctx.io.proc.start('npx', ['--yes', `--package=${pkg}`, '--', bin, ...args], {
    // cwd is the temp dir: wrangler writes .wrangler/{tmp,cache} into its working directory, never into the site.
    cwd: persistTo, env: { WRANGLER_SEND_METRICS: 'false' }, redact: [ctx.inputs.apiToken], stream: false,
  });
  try {
    const origin = `http://${LOCAL_IP}:${port}`;
    await waitReady(ctx, running, `${origin}${firstPath}`);
    ctx.io.log.info(`local server ready at ${origin}`);
    return await body(origin);
  } finally {
    await running.stop();
  }
}
