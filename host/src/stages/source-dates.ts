import type { SiteConfig } from '../core/types-index.js';
import type { HostIO } from '../io/types.js';

/** git's ISO 8601 date (any offset) as UTC `YYYY-MM-DDTHH:MM:SSZ`, the one format the core compares. */
function toUtcSeconds(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`git returned an unreadable date "${iso}"`);
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * The newest commit date of each source glob in `content.sources`, relative to the site directory (git's
 * `:(glob)` pathspec). A glob git has no commit for (untracked, ignored or matching nothing) is left out; the
 * core decides which pages each date applies to.
 */
export async function sourceDates(io: HostIO, siteDir: string, config: SiteConfig): Promise<Record<string, string>> {
  const globs = [...new Set(Object.values(config.content.sources).flat())];
  const out: Record<string, string> = {};
  for (const g of globs) {
    const date = await io.git.lastCommitDate(siteDir, `:(glob)${g}`);
    if (date !== undefined) out[g] = toUtcSeconds(date);
  }
  return out;
}
