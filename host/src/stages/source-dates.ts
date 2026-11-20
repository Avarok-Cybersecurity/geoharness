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
 * core decides which pages each date applies to. A shallow clone is refused: its dates would all be the tip's.
 */
export async function sourceDates(io: HostIO, siteDir: string, config: SiteConfig): Promise<Record<string, string>> {
  const globs = [...new Set(Object.values(config.content.sources).flat())];
  if (globs.length > 0 && (await io.git.isShallow(siteDir))) {
    throw new Error(
      'content.sources needs full git history, but the checkout is shallow: every source would be dated by the '
      + 'shallow tip, not its own last commit. Check out with `fetch-depth: 0` (actions/checkout) or run '
      + '`git fetch --unshallow`.',
    );
  }
  const out: Record<string, string> = {};
  for (const g of globs) {
    const date = await io.git.lastCommitDate(siteDir, `:(glob)${g}`);
    if (date !== undefined) out[g] = toUtcSeconds(date);
  }
  return out;
}
