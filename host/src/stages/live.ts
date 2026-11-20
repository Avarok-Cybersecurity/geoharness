import type { LiveObservation, LiveRequest } from '../core/types-index.js';
import type { HostIO, HttpResponse } from '../io/types.js';
import { describeError } from '../lib/errors.js';
import { buildMetaContent } from '../lib/gate.js';
import { BODY_PREFIX_CHARS } from '../core/types.js';

export const LIVE_TIMEOUT_MS = 20_000;
/**
 * How much of each body's start and end the core sees: enough for frontmatter, head metadata and the first
 * window of text, and for scripts the edge injects before </body>. The core owns the number (its static audit
 * checks that every page's build meta falls inside it); this is the generated copy.
 */
export { BODY_PREFIX_CHARS } from '../core/types.js';
/**
 * A live request that throws (a reset or refused connection, a timeout; not an HTTP status) is tried this many
 * times in all, LIVE_RETRY_DELAY_MS apart. A runner's network blips: one reset on one of the plan's requests
 * killed a deploy's verification (run 44603425106) while the same plan, re-run, answered 200 throughout. Three
 * tries ride out a blip; a site that is really unreachable still fails within seconds of its timeouts.
 */
export const LIVE_ATTEMPTS = 3;
export const LIVE_RETRY_DELAY_MS = 2_000;

/** Fetches one planned request without following redirects, so the observed status is the real one. */
export async function observe(io: HostIO, req: LiveRequest): Promise<LiveObservation> {
  const res = await requestWithRetry(io, req);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = v;
  return { url: req.url, userAgent: req.userAgent, accept: req.accept, status: res.status, headers,
    bodyPrefix: res.body.slice(0, BODY_PREFIX_CHARS), bodySuffix: res.body.slice(-BODY_PREFIX_CHARS) };
}

function requestWithRetry(io: HostIO, req: LiveRequest): Promise<HttpResponse> {
  return getWithRetry(io, req.url, { 'user-agent': req.userAgent, accept: req.accept }, `${req.userAgent}, Accept: ${req.accept}`);
}

/** GET without following redirects; a thrown request is retried LIVE_ATTEMPTS times in all. */
export async function getWithRetry(io: HostIO, url: string, headers: Record<string, string>, label: string): Promise<HttpResponse> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await io.http.request({ method: 'GET', url, headers, timeoutMs: LIVE_TIMEOUT_MS, redirect: 'manual' });
    } catch (e) {
      const what = `GET ${url} (${label}): ${describeError(e)}`;
      if (attempt >= LIVE_ATTEMPTS) throw new Error(`${what} (${attempt} attempts)`, { cause: e });
      io.log.warn(`attempt ${attempt} of ${LIVE_ATTEMPTS} failed, retrying in ${LIVE_RETRY_DELAY_MS / 1000}s: ${what}`);
      await io.clock.sleep(LIVE_RETRY_DELAY_MS);
    }
  }
}

export interface PollOptions { url: string; buildId: string; intervalMs: number; timeoutMs: number }

/** Waits until the live page's build meta equals the deployed SHA (edge propagation), within a bounded time. */
export async function waitForBuild(io: HostIO, o: PollOptions): Promise<void> {
  const deadline = io.clock.nowMs() + o.timeoutMs;
  let last: string;
  for (;;) {
    try {
      const sep = o.url.includes('?') ? '&' : '?';
      const r = await io.http.request({
        method: 'GET', url: `${o.url}${sep}geoharness-poll=${o.buildId.slice(0, 12)}`, headers: { accept: 'text/html' },
        timeoutMs: LIVE_TIMEOUT_MS, redirect: 'follow',
      });
      const seen = buildMetaContent(r.body);
      if (r.status === 200 && seen === o.buildId) return;
      last = `HTTP ${r.status}, build meta ${seen ?? 'absent'}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    if (io.clock.nowMs() + o.intervalMs > deadline) {
      throw new Error(`live site never served build ${o.buildId} within ${o.timeoutMs / 1000}s (last: ${last})`);
    }
    io.log.info(`waiting for build ${o.buildId.slice(0, 12)} at ${o.url} (${last})`);
    await io.clock.sleep(o.intervalMs);
  }
}
