import { asArray, asNumber, asObject, isObject, parseJson } from '../../lib/json.js';
import type { Http } from '../types.js';

export interface CfApiErrorItem { code: number; message: string }

/** A failed Cloudflare API call. `codes` carries Cloudflare's own error codes (e.g. 10000 = authentication). */
export class CloudflareApiError extends Error {
  readonly codes: number[];
  constructor(readonly method: string, readonly path: string, readonly status: number, readonly errors: CfApiErrorItem[]) {
    const detail = errors.length === 0 ? 'no error detail' : errors.map((e) => `${e.code}: ${e.message}`).join('; ');
    super(`Cloudflare ${method} ${path} -> HTTP ${status} [${detail}]`);
    this.name = 'CloudflareApiError';
    this.codes = errors.map((e) => e.code);
  }
}

export interface CfClientOptions {
  http: Http;
  token: string;
  /** https://api.cloudflare.com/client/v4 in production; a local recorder in tests. */
  baseUrl: string;
  timeoutMs: number;
}

export type CfMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function parseErrors(u: unknown): CfApiErrorItem[] {
  if (!Array.isArray(u)) return [];
  return u.filter(isObject).map((e) => ({
    code: typeof e.code === 'number' ? e.code : -1,
    message: typeof e.message === 'string' ? e.message : JSON.stringify(e),
  }));
}

export class CfClient {
  constructor(private readonly opts: CfClientOptions) {}

  /** Returns the envelope's `result`. Any non-success throws CloudflareApiError. */
  async call(method: CfMethod, path: string, body?: unknown): Promise<unknown> {
    const req = {
      method,
      url: `${this.opts.baseUrl}${path}`,
      headers: { authorization: `Bearer ${this.opts.token}`, 'content-type': 'application/json' },
      timeoutMs: this.opts.timeoutMs,
      redirect: 'manual' as const,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    const res = await this.opts.http.request(req);
    let envelope: unknown;
    try {
      envelope = parseJson(res.body, `Cloudflare ${method} ${path}`);
    } catch {
      throw new CloudflareApiError(method, path, res.status, [{ code: -1, message: res.body.slice(0, 200) }]);
    }
    const env = isObject(envelope) ? envelope : {};
    if (res.status >= 400 || env.success !== true) {
      throw new CloudflareApiError(method, path, res.status, parseErrors(env.errors));
    }
    return env.result;
  }

  /** Walks a paginated list endpoint (page/per_page) and concatenates results. */
  async list(path: string, perPage: number): Promise<unknown[]> {
    const out: unknown[] = [];
    const sep = path.includes('?') ? '&' : '?';
    for (let page = 1; ; page += 1) {
      const res = await this.opts.http.request({
        method: 'GET',
        url: `${this.opts.baseUrl}${path}${sep}page=${page}&per_page=${perPage}`,
        headers: { authorization: `Bearer ${this.opts.token}` },
        timeoutMs: this.opts.timeoutMs,
        redirect: 'manual',
      });
      const env = asObject(parseJson(res.body, `Cloudflare GET ${path}`), `Cloudflare GET ${path}`);
      if (res.status >= 400 || env.success !== true) {
        throw new CloudflareApiError('GET', path, res.status, parseErrors(env.errors));
      }
      const items = asArray(env.result, `Cloudflare GET ${path} result`);
      out.push(...items);
      const info = isObject(env.result_info) ? env.result_info : undefined;
      const totalPages = info === undefined ? 1 : asNumber(info.total_pages ?? 1, 'result_info.total_pages');
      if (page >= totalPages || items.length === 0) return out;
    }
  }
}

export function hasCode(e: unknown, code: number): boolean {
  return e instanceof CloudflareApiError && e.codes.includes(code);
}
