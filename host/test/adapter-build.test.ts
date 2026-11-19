import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandAdapter } from '../src/adapters/command.js';
import { detectNpmOutputDir } from '../src/adapters/output-dir.js';
import { routeForFile } from '../src/adapters/pages.js';
import { pythonAdapter } from '../src/adapters/python.js';
import { outputDirWithin } from '../src/adapters/shared.js';
import { splitCommand } from '../src/lib/argv.js';
import { assetsDirectoryFromToml } from '../src/lib/wrangler-config.js';
import { sampleConfig } from './helpers/fake-core.js';
import { FIXTURES, copyFixture, noHttp, testIO } from './helpers/io.js';

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], {
    cwd, stdio: 'ignore', env: { ...process.env, GIT_COMMITTER_DATE: '2026-01-02T03:04:05+00:00' },
  });
};

describe('command adapter, real build', () => {
  it('runs build-command without a shell, maps routes, dates pages from git', async () => {
    const dir = await copyFixture('command-python');
    git(dir, 'init', '-q');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'fixture');
    const io = testIO({ http: noHttp, env: {} });
    const adapter = commandAdapter({ siteDir: dir, buildCommand: 'python3 gen.py', outputDir: 'out' });
    const built = await adapter.build({ siteDir: dir, io, config: sampleConfig('https://a.example.com') });
    expect(built.outputDir).toBe(join(dir, 'out'));
    const pages = await pythonAdapter({ siteDir: dir, buildCommand: undefined, outputDir: 'out' }).pages(built.outputDir, io);
    expect(pages.map((p) => [p.route, p.file])).toEqual([['/guide/', 'guide/index.html'], ['/', 'index.html']]);
    const guide = pages[0];
    expect(guide?.markdown).toBe('# Guide\n\nSteps.\n');
    expect(guide?.lastmod).toBe('2026-01-02T03:04:05Z');
  });

  it('fails when the build leaves no index.html', async () => {
    const dir = await copyFixture('command-python');
    const io = testIO({ http: noHttp, env: {} });
    const adapter = commandAdapter({ siteDir: dir, buildCommand: 'python3 -c pass', outputDir: 'out' });
    await expect(adapter.build({ siteDir: dir, io, config: sampleConfig('https://a.example.com') })).rejects.toThrow(/does not exist/);
  });
});

describe('build-command parsing', () => {
  it('splits words and quotes', () => {
    expect(splitCommand(`python3 tools/build.py --title "My Site" ''`)).toEqual(['python3', 'tools/build.py', '--title', 'My Site', '']);
  });
  it.each(['npm run build && rm -rf /', 'make; curl x', 'echo $HOME', 'a | b', 'a > b', 'echo `id`'])('rejects shell syntax: %s', (c) => {
    expect(() => splitCommand(c)).toThrow(/needs a shell/);
  });
  it('rejects an unterminated quote and an empty command', () => {
    expect(() => splitCommand('a "b')).toThrow(/unterminated/);
    expect(() => splitCommand('   ')).toThrow(/empty/);
  });
});

describe('output directories', () => {
  const io = testIO({ http: noHttp, env: {} });
  it('reads the generator config, else its documented default', async () => {
    expect((await detectNpmOutputDir(io, join(FIXTURES, 'npm')))?.dir).toBe('public_html');
    expect((await detectNpmOutputDir(io, join(FIXTURES, 'vite-spa')))?.dir).toBe('spa-dist');
    expect(await detectNpmOutputDir(io, join(FIXTURES, 'make'))).toBeUndefined();
  });
  it('refuses an output-dir outside site-path', () => {
    expect(() => outputDirWithin('/repo/site', '../secrets')).toThrow(/outside/);
    expect(outputDirWithin('/repo/site', './out')).toBe('/repo/site/out');
  });
  it('reads assets.directory from wrangler.toml', () => {
    expect(assetsDirectoryFromToml('name = "x"\n[assets]\ndirectory = "./dist"\nbinding = "ASSETS"\n')).toBe('./dist');
    expect(assetsDirectoryFromToml('assets = { directory = "public" }\n')).toBe('public');
    expect(assetsDirectoryFromToml('[vars]\ndirectory = "nope"\n')).toBeUndefined();
  });
});

describe('routes', () => {
  it('maps files to routes', () => {
    expect(routeForFile('index.html')).toBe('/');
    expect(routeForFile('docs/index.html')).toBe('/docs/');
    expect(routeForFile('about.html')).toBe('/about');
  });
});
