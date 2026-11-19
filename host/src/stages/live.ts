import type { LiveObservation, LiveRequest } from '../core/types-index.js';
import type { HostIO } from '../io/types.js';
import { buildMetaContent } from '../lib/gate.js';

export const LIVE_TIMEOUT_MS = 20_000;
/**
 * How much of each body's start and end the core sees: enough for frontmatter, head metadata and the first
 * window of text, and for scripts the edge injects before </body>.
 */
export const BODY_PREFIX_CHARS = 8192;

/** Fetches one planned request without following redirects, so the observed status is the real one. */
export async function observe(io: HostIO, req: LiveRequest): Promise<LiveObservation> {
  const res = await io.http.request({
    method: 'GET', url: req.url, headers: { 'user-agent': req.userAgent, accept: req.accept },
    timeoutMs: LIVE_TIMEOUT_MS, redirect: 'manual',
  });
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = v;
  return { url: req.url, userAgent: req.userAgent, accept: req.accept, status: res.status, headers,
    bodyPrefix: res.body.slice(0, BODY_PREFIX_CHARS), bodySuffix: res.body.slice(-BODY_PREFIX_CHARS) };
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
