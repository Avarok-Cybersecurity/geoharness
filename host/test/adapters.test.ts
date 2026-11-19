import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AdapterSelectionError, createAdapters, selectAdapter } from '../src/adapters/registry.js';
import type { AdapterOptions } from '../src/adapters/types.js';
import { FIXTURES, noHttp, testIO } from './helpers/io.js';

const io = testIO({ http: noHttp, env: {} });

async function detectAll(fixture: string, extra: Partial<AdapterOptions> = {}): Promise<Record<string, number>> {
  const dir = join(FIXTURES, fixture);
  const opts = { siteDir: dir, buildCommand: undefined, outputDir: undefined, tempDir: '/unused', ...extra };
  const out: Record<string, number> = {};
  for (const a of createAdapters(opts)) out[a.id] = (await a.detect(dir, io)).confidence;
  return out;
}

async function select(fixture: string, extra: Partial<AdapterOptions> = {}): Promise<string> {
  const dir = join(FIXTURES, fixture);
  const adapters = createAdapters({ siteDir: dir, buildCommand: undefined, outputDir: undefined, tempDir: '/unused', ...extra });
  return (await selectAdapter(adapters, dir, io, 'auto')).adapter.id;
}

describe('adapter detection over fixtures', () => {
  it('static: only with output-dir holding index.html and no build-command', async () => {
    expect(await select('static', { outputDir: 'public' })).toBe('static');
    expect((await detectAll('static'))['static']).toBe(0);
    expect((await detectAll('static', { outputDir: 'public', buildCommand: 'x' }))['static']).toBe(0);
  });

  it('command: build-command input wins for a plain python generator', async () => {
    expect(await select('command-python', { buildCommand: 'python3 gen.py', outputDir: 'out' })).toBe('command');
  });

  it('python: tools/build.py', async () => {
    expect(await select('python-tools', { outputDir: 'out' })).toBe('python');
  });

  it('npm: package.json build script', async () => {
    const scores = await detectAll('npm');
    expect(scores['npm']).toBe(0.6);
    expect(await select('npm')).toBe('npm');
  });

  it('sveltekit-static beats npm and suppresses vite-prerender', async () => {
    const scores = await detectAll('sveltekit-ish');
    expect(scores['sveltekit-static']).toBe(0.9);
    expect(scores['vite-prerender']).toBe(0);
    expect(scores['npm']).toBe(0.6);
    expect(await select('sveltekit-ish')).toBe('sveltekit-static');
  });

  it('make: Makefile build target', async () => {
    expect(await select('make', { outputDir: 'out' })).toBe('make');
  });

  it('vite-prerender: vite config plus an empty SPA mount', async () => {
    expect(await select('vite-spa')).toBe('vite-prerender');
  });

  it('worker-assets: wrangler.jsonc with assets.directory (comments, trailing commas)', async () => {
    const scores = await detectAll('worker-assets');
    expect(scores['worker-assets']).toBe(0.95);
    expect(await select('worker-assets')).toBe('worker-assets');
  });

  it('tie: fails naming both adapters', async () => {
    const err = await select('tie').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterSelectionError);
    expect(String(err)).toMatch(/tied between (npm|make) .* and (npm|make) /);
  });

  it('nothing recognised: fails asking for the adapter input', async () => {
    await expect(select('command-python')).rejects.toThrow(/no adapter recognised/);
  });

  it('the adapter input overrides detection, even a tie', async () => {
    const dir = join(FIXTURES, 'tie');
    const adapters = createAdapters({ siteDir: dir, buildCommand: undefined, outputDir: 'out', tempDir: '/unused' });
    expect((await selectAdapter(adapters, dir, io, 'make')).adapter.id).toBe('make');
  });

  it('logs evidence for every candidate', async () => {
    await select('sveltekit-ish');
    expect(io.log.lines.some((l) => l.includes('svelte.config.js uses @sveltejs/adapter-static'))).toBe(true);
  });
});
