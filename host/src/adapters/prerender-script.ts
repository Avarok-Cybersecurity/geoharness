/**
 * Source of the child process that renders SPA routes with headless Chromium. It runs as its own
 * `node` process so playwright-core (installed at build time, pinned) never enters the action bundle.
 * argv: <playwright-core dir> <output dir> <routes JSON> <timeout ms>
 */
export const PRERENDER_SCRIPT = String.raw`
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const [pwDir, outDir, routesJson, timeoutRaw] = process.argv.slice(2);
const routes = JSON.parse(routesJson);
const timeout = Number(timeoutRaw);
const { chromium } = await import(pathToFileURL(join(pwDir, 'index.mjs')).href);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain' };
const shell = await readFile(join(outDir, 'index.html'));
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([.][.][/\\])+/, '');
  const file = join(outDir, path);
  try {
    if ((await stat(file)).isFile()) {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(await readFile(file));
      return;
    }
  } catch {}
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(shell);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
let failed = false;
try {
  const ordered = [...routes.filter((r) => r !== '/'), ...routes.filter((r) => r === '/')];
  const rendered = [];
  for (const route of ordered) {
    const page = await browser.newPage();
    const res = await page.goto(origin + route, { waitUntil: 'networkidle', timeout });
    if (!res || res.status() !== 200) { console.error('route ' + route + ' -> ' + (res ? res.status() : 'no response')); failed = true; }
    rendered.push([route, '<!doctype html>\n' + (await page.evaluate(() => document.documentElement.outerHTML))]);
    await page.close();
  }
  for (const [route, html] of rendered) {
    const target = route === '/' ? join(outDir, 'index.html') : join(outDir, route.replace(/^\/|\/$/g, ''), 'index.html');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
    console.log('prerendered ' + route + ' (' + html.length + ' bytes)');
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
`;
