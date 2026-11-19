// A live request that throws (not an HTTP status) during verify: retried, named, and, when it persists, rolled back.
import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { nodeHttp } from '../src/io/node/http.js';
import { describeError } from '../src/lib/errors.js';
import { LIVE_ATTEMPTS, LIVE_RETRY_DELAY_MS } from '../src/stages/live.js';
import { runAll } from '../src/stages/index.js';
import { CF_WITH_VERSION, harness, HOST, wranglerCalls, type Harness } from './helpers/harness.js';

let server: Server | undefined;
afterEach(async () => { await new Promise((r) => { if (server === undefined) r(undefined); else server.close(r); }); server = undefined; });

/** A TCP server that accepts and immediately resets every connection: a real network failure for real fetch. */
async function resettingServer(): Promise<string> {
  server = createServer((socket) => { socket.resetAndDestroy(); });
  await new Promise<void>((r) => { server?.listen(0, '127.0.0.1', r); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no TCP address');
  return `http://127.0.0.1:${addr.port}/`;
}

/** What Node's fetch throws on a reset; the test below checks real fetch has this shape. */
function fetchFailed(): TypeError {
  return new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) });
}

describe('describeError', () => {
  it('names the reason real fetch keeps only in its cause', async () => {
    const url = await resettingServer();
    const e: unknown = await nodeHttp.request({ method: 'GET', url, headers: {}, timeoutMs: 5000, redirect: 'manual' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(TypeError);
    expect((e as Error).message).toBe('fetch failed');
    expect(describeError(e)).toMatch(/^fetch failed: \S/);
  });

  it('adds a cause code the message lacks and does not repeat a quoted cause', () => {
    expect(describeError(fetchFailed())).toBe('fetch failed: read ECONNRESET');
    expect(describeError(new Error('x', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })))
      .toBe('x: other side closed (UND_ERR_SOCKET)');
    expect(describeError(new Error('a: fetch failed', { cause: new Error('fetch failed') }))).toBe('a: fetch failed');
    expect(describeError('plain')).toBe('plain');
  });
});

/** The deployed site, except that GPTBot's request to it throws `failures` times before it is answered. */
function flakyFor(h: Harness, failures: number): { attempts: () => number } {
  const site = h.w.http.request.bind(h.w.http);
  let attempts = 0;
  h.ctx.io.http.request = (req) => {
    if (new URL(req.url).host === HOST && req.headers['user-agent'] === 'GPTBot') {
      attempts += 1;
      if (attempts <= failures) return Promise.reject(fetchFailed());
    }
    return site(req);
  };
  return { attempts: () => attempts };
}

const rollbackCalls = (h: Harness): number => wranglerCalls(h).filter((c) => c.args.includes('rollback')).length;
const retryWarnings = (h: Harness): string[] => h.log.filter((l) => l.startsWith('WARN attempt '));

describe('verify on a network error', () => {
  it('a transient failure is retried after the stated delay and the run passes without a rollback', async () => {
    const h = await harness({ cfState: CF_WITH_VERSION });
    const flaky = flakyFor(h, LIVE_ATTEMPTS - 1);
    await runAll(h.ctx);
    expect(flaky.attempts()).toBe(LIVE_ATTEMPTS);
    expect(retryWarnings(h)).toHaveLength(LIVE_ATTEMPTS - 1);
    expect(retryWarnings(h)[0]).toContain(`retrying in ${LIVE_RETRY_DELAY_MS / 1000}s: GET https://${HOST}/ (GPTBot`);
    expect(rollbackCalls(h)).toBe(0);
    expect(h.ctx.state.rollback).toBeUndefined();
  });

  it('a persistent failure names the request and its cause, and rolls back', async () => {
    const h = await harness({ cfState: CF_WITH_VERSION });
    const flaky = flakyFor(h, Number.POSITIVE_INFINITY);
    const err: unknown = await runAll(h.ctx).catch((x: unknown) => x);
    const message = err instanceof Error ? err.message : String(err);
    expect(message).toContain(`verification could not complete: GET https://${HOST}/ (GPTBot, Accept: text/markdown, text/html, */*): fetch failed: read ECONNRESET (${LIVE_ATTEMPTS} attempts)`);
    expect(message).toContain('Rolled back: rolled Worker geo-site back to version v-prev');
    expect(flaky.attempts()).toBe(LIVE_ATTEMPTS);
    expect(rollbackCalls(h)).toBe(1);
    expect(h.ctx.state.rollback?.performed).toBe(true);
  });

  it('a build that never goes live is not kept live either', async () => {
    const h = await harness({ cfState: CF_WITH_VERSION });
    h.w.staleLoads = 1000;
    await expect(runAll(h.ctx)).rejects.toThrow(/never served build abcdef012345[\s\S]*Rolled back: rolled Worker geo-site back to version v-prev/);
    expect(rollbackCalls(h)).toBe(1);
  });
});
