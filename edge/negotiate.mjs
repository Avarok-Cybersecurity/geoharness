// GeoHarness Accept negotiation for Cloudflare Workers with static assets.
// Used as the fallback Worker when GeoHarness cannot manage zone Transform Rules, and importable by sites
// that already run their own Worker:
//
//   import { negotiate, varyAccept } from './negotiate.mjs';
//   export default { async fetch(req, env) { return (await negotiate(req, env)) ?? varyAccept(await env.ASSETS.fetch(req)); } };
//
// Negotiation keys on the Accept header only, never on user agents (citation google-spam-policies).

const MARKDOWN = 'text/markdown';

/** @param {Request} request */
export function wantsMarkdown(request) {
  const accept = request.headers.get('accept');
  return accept !== null && accept.toLowerCase().includes(MARKDOWN);
}

/**
 * Twin paths for a request path, mirroring the core's rules: x/ → x/index.md, x.html → x.md, x → x.md or x/index.md.
 * @param {string} pathname
 * @returns {string[]}
 */
export function twinPaths(pathname) {
  if (pathname.endsWith('/')) return [`${pathname}index.md`];
  if (pathname.endsWith('.html')) return [`${pathname.slice(0, -5)}.md`];
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (last.includes('.')) return [];
  return [`${pathname}.md`, `${pathname}/index.md`];
}

/** @param {Response} response */
export function varyAccept(response) {
  const out = new Response(response.body, response);
  const vary = out.headers.get('vary');
  if (vary === null) out.headers.set('vary', 'Accept');
  else if (!vary.toLowerCase().split(',').map((v) => v.trim()).includes('accept')) out.headers.set('vary', `${vary}, Accept`);
  return out;
}

/**
 * @param {Request} request
 * @param {{ ASSETS: { fetch(input: Request): Promise<Response> } }} env
 * @returns {Promise<Response | null>} the markdown twin, or null to let the caller serve the request as usual
 */
export async function negotiate(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  if (!wantsMarkdown(request)) return null;
  const url = new URL(request.url);
  for (const path of twinPaths(url.pathname)) {
    const twinUrl = new URL(url);
    twinUrl.pathname = path;
    const res = await env.ASSETS.fetch(new Request(twinUrl, { method: request.method, headers: request.headers }));
    // An SPA fallback answers 200 with HTML for any path; only a real twin counts.
    const type = res.headers.get('content-type') ?? '';
    if (res.status !== 200 || type.toLowerCase().includes('text/html')) continue;
    const out = varyAccept(res);
    out.headers.set('content-type', 'text/markdown; charset=utf-8');
    return out;
  }
  return null;
}
