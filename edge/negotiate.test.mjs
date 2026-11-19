import { describe, expect, it } from 'vitest';
import { negotiate, twinPaths, varyAccept } from './negotiate.mjs';

/**
 * A real ASSETS-like binding over an in-memory file map, answering like Workers static assets.
 * @param {Record<string, string>} files
 * @param {'spa' | undefined} [notFound]
 */
function assets(files, notFound) {
  /** @type {string[]} */
  const seen = [];
  return {
    seen,
    /** @param {Request} req */
    fetch(req) {
      const path = new URL(req.url).pathname;
      seen.push(path);
      const body = files[path];
      if (body !== undefined) return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } }));
      if (notFound === 'spa') return Promise.resolve(new Response('<html>shell</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
      return Promise.resolve(new Response('missing', { status: 404 }));
    },
  };
}

/** @param {string} path @param {string} accept @param {string} [method] */
const req = (path, accept, method = 'GET') => new Request(`https://geo.example.com${path}`, { method, headers: { accept } });

describe('twinPaths', () => {
  it('maps directory, .html and bare paths like the core', () => {
    expect(twinPaths('/')).toEqual(['/index.md']);
    expect(twinPaths('/docs/')).toEqual(['/docs/index.md']);
    expect(twinPaths('/about.html')).toEqual(['/about.md']);
    expect(twinPaths('/about')).toEqual(['/about.md', '/about/index.md']);
    expect(twinPaths('/logo.svg')).toEqual([]);
  });
});

describe('negotiate', () => {
  it('serves the twin for Accept: text/markdown with Vary and markdown content type', async () => {
    const env = { ASSETS: assets({ '/docs/index.md': '# Docs' }) };
    const res = await negotiate(req('/docs/', 'text/markdown, text/html;q=0.9'), env);
    if (res === null) throw new Error('expected a twin');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(res.headers.get('vary')).toBe('Accept');
    expect(await res.text()).toBe('# Docs');
  });

  it('tries x.md then x/index.md for a bare path', async () => {
    const binding = assets({ '/about/index.md': '# About' });
    const res = await negotiate(req('/about', 'text/markdown'), { ASSETS: binding });
    expect(await res?.text()).toBe('# About');
    expect(binding.seen).toEqual(['/about.md', '/about/index.md']);
  });

  it('returns null for browsers, missing twins, non-GET methods and SPA fallbacks', async () => {
    const env = { ASSETS: assets({ '/index.md': '# Home' }) };
    expect(await negotiate(req('/', 'text/html,*/*'), env)).toBeNull();
    expect(await negotiate(req('/nope/', 'text/markdown'), env)).toBeNull();
    expect(await negotiate(req('/', 'text/markdown', 'POST'), env)).toBeNull();
    expect(await negotiate(req('/nope/', 'text/markdown'), { ASSETS: assets({}, 'spa') })).toBeNull();
  });

  it('matches the Accept media type case-insensitively', async () => {
    const res = await negotiate(req('/', 'Text/Markdown'), { ASSETS: assets({ '/index.md': '# Home' }) });
    expect(res?.status).toBe(200);
  });
});

describe('varyAccept', () => {
  it('adds Accept to an existing Vary once', () => {
    const a = varyAccept(new Response('x', { headers: { vary: 'Accept-Encoding' } }));
    expect(a.headers.get('vary')).toBe('Accept-Encoding, Accept');
    expect(varyAccept(a).headers.get('vary')).toBe('Accept-Encoding, Accept');
  });
});
