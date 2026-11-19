import { CloudflareApiError, type CfClient } from './client.js';

/** Cloudflare codes meaning "this token may not do that" (10000 authentication error, 9109 unauthorized access). */
const DENIED_CODES = [10000, 9109];

export type ProbeResult = { ok: true } | { ok: false; reason: string };

/** A harmless GET. 2xx and 404 (authorised, nothing there yet) pass; 401/403 or a denial code fail. */
export async function probe(cf: CfClient, path: string): Promise<ProbeResult> {
  try {
    await cf.call('GET', path);
    return { ok: true };
  } catch (e) {
    if (!(e instanceof CloudflareApiError)) throw e;
    if (e.status === 404 && !e.codes.some((c) => DENIED_CODES.includes(c))) return { ok: true };
    if (e.status === 401 || e.status === 403 || e.codes.some((c) => DENIED_CODES.includes(c))) return { ok: false, reason: e.message };
    throw e;
  }
}
