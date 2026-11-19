import { join } from 'node:path';
import type { HostIO } from '../io/types.js';
import { isObject } from './json.js';
import { parseJsonc } from './jsonc.js';

export const WRANGLER_CONFIGS = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'] as const;

export interface RepoWranglerConfig { file: string; assetsDirectory: string | undefined }

/**
 * wrangler.toml is read for `[assets] directory = "…"` only: a full TOML parser is not worth bundling for one key.
 * Inline tables (`assets = { directory = "…" }`) are recognised too.
 */
export function assetsDirectoryFromToml(text: string): string | undefined {
  const inline = /^\s*assets\s*=\s*\{[^}]*directory\s*=\s*"([^"]+)"/m.exec(text);
  if (inline?.[1] !== undefined) return inline[1];
  const section = /^\s*\[assets\]\s*$([\s\S]*?)(?=^\s*\[|(?![\s\S]))/m.exec(text);
  return section?.[1] === undefined ? undefined : /^\s*directory\s*=\s*"([^"]+)"/m.exec(section[1])?.[1];
}

export async function readRepoWranglerConfig(io: HostIO, dir: string): Promise<RepoWranglerConfig | undefined> {
  for (const file of WRANGLER_CONFIGS) {
    const text = await io.fs.readTextIfExists(join(dir, file));
    if (text === undefined) continue;
    if (file === 'wrangler.toml') return { file, assetsDirectory: assetsDirectoryFromToml(text) };
    const parsed = parseJsonc(text);
    const assets = isObject(parsed) && isObject(parsed.assets) ? parsed.assets : undefined;
    const directory = assets !== undefined && typeof assets.directory === 'string' ? assets.directory : undefined;
    return { file, assetsDirectory: directory };
  }
  return undefined;
}
