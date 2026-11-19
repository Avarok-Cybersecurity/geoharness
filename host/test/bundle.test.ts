import { execFile } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { tempDir } from './helpers/world.js';

const run = promisify(execFile);
const DIST = join(import.meta.dirname, '..', '..', 'dist', 'cli.mjs');

// A CommonJS stand-in with the shape wasm-pack --target nodejs emits (justified: the real wasm comes from the
// core lane). It proves the committed bundle loads a core from dist/core/ and runs `audit <url>` end to end.
const FAKE_WASM = `
exports.parseConfig = () => ({ ok: false, errors: [{ code: 'x', message: 'unused' }] });
exports.processSite = exports.parseConfig;
exports.ragInputs = exports.parseConfig;
exports.liveCheckPlan = (config, routes) => ({ ok: true, value: routes.map((r) => ({ url: config.site.origin + r, userAgent: 'GPTBot', accept: 'text/markdown', expect: { status: 200 } })) });
exports.audit = (input) => ({ ok: true, value: { score: input.live[0].status === 200 ? 77 : 0, categories: [{ id: 'a', title: 'Access', weight: 1, score: 77 }],
  findings: [{ checkId: 'md', title: 'Markdown twin', severity: 'advisory', passed: input.pages[0].markdown.startsWith('# Hi'), evidence: input.robots.trim(), citations: ['llmstxt-spec'] }] } });
`;

describe('bundled CLI', () => {
  it('audits a live URL with a core loaded from dist/core', async () => {
    const dir = await tempDir('gh-bundle-');
    await copyFile(DIST, join(dir, 'cli.mjs'));
    await mkdir(join(dir, 'core'));
    await writeFile(join(dir, 'core', 'geoharness_wasm.js'), FAKE_WASM);
    const server = createServer((req, res) => {
      const md = (req.headers.accept ?? '').includes('text/markdown');
      const body = req.url === '/robots.txt' ? 'User-agent: *' : md ? '# Hi' : '<html><body>Hi</body></html>';
      res.writeHead(200, { 'content-type': md ? 'text/markdown' : 'text/html' });
      res.end(body);
    });
    await new Promise<void>((r) => { server.listen(0, '127.0.0.1', r); });
    try {
      const { port } = server.address() as AddressInfo;
      const { stdout } = await run(process.execPath, [join(dir, 'cli.mjs'), 'audit', `http://127.0.0.1:${port}/`]);
      expect(stdout).toContain('77/100');
      expect(stdout).toContain('[PASS] Markdown twin');
      expect(stdout).toContain('User-agent: *');
    } finally {
      server.close();
    }
  });

  it('fails clearly when the core is missing', async () => {
    const dir = await tempDir('gh-bundle-');
    await copyFile(DIST, join(dir, 'cli.mjs'));
    const err = await run(process.execPath, [join(dir, 'cli.mjs'), 'audit', 'https://example.com/']).catch((e: unknown) => e);
    expect((err as { stdout: string }).stdout).toContain('cannot load the GeoHarness core');
  });
});
