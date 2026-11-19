// content.sources: the host asks git, with the real git, for each source glob's newest commit and hands the core
// UTC dates; the core decides which pages they date. Built output is gitignored, so it never dates anything.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceDates } from '../src/stages/source-dates.js';
import { sampleConfig } from './helpers/fake-core.js';
import { noHttp, testIO } from './helpers/io.js';
import { tempDir } from './helpers/world.js';

function commitAt(dir: string, date: string, message: string): void {
  const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  execFileSync('git', ['add', '.'], { cwd: dir, env, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', message], { cwd: dir, env, stdio: 'ignore' });
}

describe('sourceDates', () => {
  it('dates each configured source glob by its newest commit, in UTC, and leaves out globs git has no commit for', async () => {
    const repo = await tempDir('gh-src-');
    execFileSync('git', ['init', '-q'], { cwd: repo });
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

  it('asks nothing when the config maps no sources', async () => {
    const config = sampleConfig('https://geo.example.com');
    expect(await sourceDates(testIO({ http: noHttp, env: {} }), '/nonexistent', config)).toEqual({});
  });
});
