import type { HostIO } from '../io/types.js';

/**
 * Refuses a shallow clone before git commit dates are used: in one, every file's last commit is the shallow tip,
 * so each date would be the tip's rather than the file's own.
 */
export async function requireFullHistory(io: HostIO, repoDir: string, needer: string): Promise<void> {
  if (!(await io.git.isShallow(repoDir))) return;
  throw new Error(
    `${needer} needs full git history, but the checkout is shallow: every date would be the shallow tip's, not `
    + 'the file\'s own last commit. Check out with `fetch-depth: 0` (actions/checkout) or run `git fetch --unshallow`.',
  );
}
