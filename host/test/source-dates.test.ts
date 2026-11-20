// content.sources: the host asks git, with the real git, for each source glob's newest commit and hands the core
// UTC dates; the core decides which pages they date. Built output is gitignored, so it never dates anything.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceDates } from '../src/stages/source-dates.js';
import { sampleConfig } from './helpers/fake-core.js';
import { commitAt, initRepo, shallowClone } from './helpers/git.js';
import { noHttp, testIO } from './helpers/io.js';
import { tempDir } from './helpers/world.js';

describe('sourceDates', () => {
  it('dates each configured source glob by its newest commit, in UTC, and leaves out globs git has no commit for', async () => {
    const repo = await tempDir('gh-src-');
    initRepo(repo);
    const site = join(repo, 'site');
    await mkdir(join(site, 'content', 'blog'), { recursive: true });
    await writeFile(join(site, '.gitignore'), 'dist/\n');
    await writeFile(join(site, 'content', 'index.md'), '# Home\n');
    commitAt(repo, '2026-11-10T09:00:00+02:00', 'home');
    await writeFile(join(site, 'content', 'blog', 'post.md'), '# Post\n');
    commitAt(repo, '2026-11-12T10:30:00-05:00', 'post');
    await mkdir(join(site, 'dist'), { recursive: true });
    await writeFile(join(site, 'dist', 'index.html'), '<html></html>');

    const config = sampleConfig('https://geo.example.com');
    config.content.sources = { '/': ['content/index.md'], '/blog/**': ['content/blog/**', 'content/none/**'], '/**': ['dist/**'] };
    const dates = await sourceDates(testIO({ http: noHttp, env: {} }), site, config);
    expect(dates).toEqual({ 'content/index.md': '2026-11-10T07:00:00Z', 'content/blog/**': '2026-11-12T15:30:00Z' });
  });

  it('refuses a shallow clone, whose every source would carry the tip commit\'s date', async () => {
    const origin = await tempDir('gh-src-origin-');
    initRepo(origin);
    await mkdir(join(origin, 'site', 'content'), { recursive: true });
    await writeFile(join(origin, 'site', 'content', 'old.md'), '# Old\n');
    commitAt(origin, '2026-11-01T00:00:00Z', 'old');
    await writeFile(join(origin, 'site', 'other.txt'), 'unrelated\n');
    commitAt(origin, '2026-11-19T00:00:00Z', 'unrelated');
    const clone = join(await tempDir('gh-src-shallow-'), 'repo');
    shallowClone(origin, clone);

    const config = sampleConfig('https://geo.example.com');
    config.content.sources = { '/': ['content/old.md'] };
    const io = testIO({ http: noHttp, env: {} });
    await expect(sourceDates(io, join(clone, 'site'), config)).rejects.toThrow(/shallow.*fetch-depth: 0/s);
    expect(await sourceDates(io, join(origin, 'site'), config)).toEqual({ 'content/old.md': '2026-11-01T00:00:00Z' });
  });

  it('asks nothing when the config maps no sources', async () => {
    const config = sampleConfig('https://geo.example.com');
    expect(await sourceDates(testIO({ http: noHttp, env: {} }), '/nonexistent', config)).toEqual({});
  });
});
