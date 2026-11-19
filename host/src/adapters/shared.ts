import { join, relative, resolve } from 'node:path';
import type { HostIO } from '../io/types.js';
import { splitCommand } from '../lib/argv.js';
import { BUILD_TIMEOUT_MS } from './types.js';

export async function runStep(io: HostIO, cwd: string, argv: readonly string[]): Promise<void> {
  const [cmd, ...args] = argv;
  if (cmd === undefined) throw new Error('empty command');
  io.log.info(`$ ${argv.join(' ')}`);
  const r = await io.proc.run(cmd, args, { cwd, env: {}, timeoutMs: BUILD_TIMEOUT_MS, redact: [], stream: true });
  if (r.code !== 0) throw new Error(`"${argv.join(' ')}" exited with ${r.code}`);
}

export async function runBuildCommand(io: HostIO, cwd: string, command: string): Promise<void> {
  await runStep(io, cwd, splitCommand(command));
}

/** Resolves output-dir against the site and refuses paths that escape it. */
export function outputDirWithin(siteDir: string, rel: string): string {
  const abs = resolve(siteDir, rel);
  const r = relative(siteDir, abs);
  if (r.startsWith('..') || resolve(siteDir, r) !== abs) throw new Error(`output-dir "${rel}" is outside site-path`);
  return abs;
}

export function requireOutputDir(adapter: string, outputDir: string | undefined): string {
  if (outputDir === undefined) throw new Error(`adapter ${adapter} needs the output-dir input`);
  return outputDir;
}

export async function assertBuilt(io: HostIO, outputDir: string): Promise<void> {
  if (!(await io.fs.isDirectory(outputDir))) throw new Error(`build finished but ${outputDir} does not exist`);
  if (!(await io.fs.exists(join(outputDir, 'index.html')))) throw new Error(`${outputDir} has no index.html`);
}

export async function firstExisting(io: HostIO, dir: string, names: readonly string[]): Promise<string | undefined> {
  for (const n of names) if (await io.fs.exists(join(dir, n))) return n;
  return undefined;
}

export interface PackageJson { scripts: Record<string, string>; deps: Set<string> }

export async function readPackageJson(io: HostIO, dir: string): Promise<PackageJson | undefined> {
  const text = await io.fs.readTextIfExists(join(dir, 'package.json'));
  if (text === undefined) return undefined;
  const u: unknown = JSON.parse(text);
  const o = typeof u === 'object' && u !== null ? (u as Record<string, unknown>) : {};
  const strMap = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (typeof v === 'object' && v !== null) {
      for (const [k, x] of Object.entries(v)) if (typeof x === 'string') out[k] = x;
    }
    return out;
  };
  const deps = new Set([...Object.keys(strMap(o.dependencies)), ...Object.keys(strMap(o.devDependencies))]);
  return { scripts: strMap(o.scripts), deps };
}

/** Installs with the package manager the lockfile names, then runs build-command or the build script. */
export async function npmInstallAndBuild(io: HostIO, dir: string, buildCommand: string | undefined): Promise<void> {
  const lock = await firstExisting(io, dir, ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock']);
  const install: Record<string, string[]> = {
    'pnpm-lock.yaml': ['corepack', 'pnpm', 'install', '--frozen-lockfile'],
    'yarn.lock': ['corepack', 'yarn', 'install', '--immutable'],
    'package-lock.json': ['npm', 'ci', '--no-audit', '--no-fund'],
    'npm-shrinkwrap.json': ['npm', 'ci', '--no-audit', '--no-fund'],
  };
  const runner: Record<string, string[]> = {
    'pnpm-lock.yaml': ['corepack', 'pnpm', 'run', 'build'],
    'yarn.lock': ['corepack', 'yarn', 'run', 'build'],
  };
  await runStep(io, dir, (lock === undefined ? undefined : install[lock]) ?? ['npm', 'install', '--no-audit', '--no-fund']);
  if (buildCommand !== undefined) await runBuildCommand(io, dir, buildCommand);
  else await runStep(io, dir, (lock === undefined ? undefined : runner[lock]) ?? ['npm', 'run', 'build']);
}
