// Adapters date pages by the last commit of their tracked output or source markdown; in a shallow clone every
// such date would be the tip's, so the adapters' page mapping refuses one whenever git dated a page.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pagesFromOutput } from '../src/adapters/pages.js';
import { commitAt, initRepo, shallowClone } from './helpers/git.js';
import { noHttp, testIO } from './helpers/io.js';
import { tempDir } from './helpers/world.js';

async function originWithTrackedOutput(gitignoreOutput: boolean): Promise<string> {
  const origin = await tempDir('gh-pages-origin-');
  initRepo(origin);
  await mkdir(join(origin, 'out'), { recursive: true });
  if (gitignoreOutput) await writeFile(join(origin, '.gitignore'), 'out/\n');
  await writeFile(join(origin, 'out', 'index.html'), '<html><title>Home</title></html>');
  commitAt(origin, '2026-11-01T00:00:00Z', 'page');
  await writeFile(join(origin, 'other.txt'), 'unrelated\n');
  commitAt(origin, '2026-11-19T00:00:00Z', 'unrelated');
  return origin;
}

const io = testIO({ http: noHttp, env: {} });
const map = (siteDir: string) => pagesFromOutput(join(siteDir, 'out'), io, { siteDir, markdownRoot: undefined });

describe('pagesFromOutput lastmod', () => {
  it('dates a tracked page by its own last commit in a full clone', async () => {
    const origin = await originWithTrackedOutput(false);
    const [page] = await map(origin);
    expect(Date.parse(page?.lastmod ?? '')).toBe(Date.parse('2026-11-01T00:00:00Z'));
  });

  it('refuses a shallow clone once git dates a page', async () => {
    const clone = join(await tempDir('gh-pages-shallow-'), 'repo');
    shallowClone(await originWithTrackedOutput(false), clone);
    await expect(map(clone)).rejects.toThrow(/Page lastmod needs full git history.*fetch-depth: 0/s);
  });

  it('accepts a shallow clone when no page is dated by git (untracked output)', async () => {
    const origin = await originWithTrackedOutput(true);
    await mkdir(join(origin, 'out'), { recursive: true });
    await writeFile(join(origin, 'out', 'index.html'), '<html><title>Home</title></html>');
    const clone = join(await tempDir('gh-pages-shallow-'), 'repo');
    shallowClone(origin, clone);
    await mkdir(join(clone, 'out'), { recursive: true });
    await writeFile(join(clone, 'out', 'index.html'), '<html><title>Home</title></html>');
    const pages = await map(clone);
    expect(pages.map((p) => [p.route, p.lastmod])).toEqual([['/', undefined]]);
  });
});
