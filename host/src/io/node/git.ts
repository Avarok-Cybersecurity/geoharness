import type { Git, Proc } from '../types.js';

const GIT_TIMEOUT_MS = 30_000;

export function nodeGit(proc: Proc): Git {
  return {
    async lastCommitDate(repoDir, path) {
      const r = await proc.run('git', ['log', '-1', '--format=%cI', '--', path], {
        cwd: repoDir, env: {}, timeoutMs: GIT_TIMEOUT_MS, redact: [], stream: false,
      });
      if (r.code !== 0) throw new Error(`git log failed for ${path} (exit ${r.code}): ${r.stderr.trim()}`);
      const date = r.stdout.trim();
      return date === '' ? undefined : date;
    },
    async isShallow(repoDir) {
      const r = await proc.run('git', ['rev-parse', '--is-shallow-repository'], {
        cwd: repoDir, env: {}, timeoutMs: GIT_TIMEOUT_MS, redact: [], stream: false,
      });
      if (r.code !== 0) throw new Error(`git rev-parse failed in ${repoDir} (exit ${r.code}): ${r.stderr.trim()}`);
      const answer = r.stdout.trim();
      if (answer !== 'true' && answer !== 'false') throw new Error(`git rev-parse --is-shallow-repository printed "${answer}"`);
      return answer === 'true';
    },
  };
}
