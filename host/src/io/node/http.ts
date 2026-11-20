import type { Http } from '../types.js';

export const nodeHttp: Http = {
  async request(req) {
    const init: RequestInit = {
      method: req.method,
      headers: req.headers,
      redirect: req.redirect,
      signal: AbortSignal.timeout(req.timeoutMs),
    };
    if (req.body !== undefined) init.body = req.body;
    const res = await fetch(req.url, init);
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key] = value; });
    const body = req.method === 'HEAD' ? '' : await res.text();
    return { status: res.status, headers, body };
  },
  async download(url, timeoutMs) {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  },
};
