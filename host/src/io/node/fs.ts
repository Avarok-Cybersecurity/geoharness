import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Fs } from '../types.js';

function isNotFound(e: unknown): boolean {
  return e instanceof Error && 'code' in e && (e.code === 'ENOENT' || e.code === 'ENOTDIR');
}

async function walk(root: string, rel: string, out: string[]): Promise<void> {
  const entries = await readdir(join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) await walk(root, child, out);
    else if (entry.isFile()) out.push(child);
  }
}

export const nodeFs: Fs = {
  readText: (path) => readFile(path, 'utf8'),
  async readTextIfExists(path) {
    try {
      return await readFile(path, 'utf8');
    } catch (e) {
      if (isNotFound(e)) return undefined;
      throw e;
    }
  },
  async writeText(path, contents) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, 'utf8');
  },
  appendText: (path, contents) => appendFile(path, contents, 'utf8'),
  async exists(path) {
    try {
      await stat(path);
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  },
  async isDirectory(path) {
    try {
      return (await stat(path)).isDirectory();
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  },
  async listFiles(dir) {
    const out: string[] = [];
    await walk(dir, '', out);
    return out.sort();
  },
  async makeTempDir(parent, prefix) {
    await mkdir(parent, { recursive: true });
    return mkdtemp(join(parent, prefix));
  },
  remove: (path) => rm(path, { recursive: true, force: true }),
};
