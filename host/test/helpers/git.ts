// Real git repositories for the tests that read commit dates.
import { execFileSync } from 'node:child_process';

export function initRepo(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
}

export function commitAt(dir: string, date: string, message: string): void {
  const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  execFileSync('git', ['add', '.'], { cwd: dir, env, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', message], { cwd: dir, env, stdio: 'ignore' });
}

export function shallowClone(origin: string, into: string): void {
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${origin}`, into], { stdio: 'ignore' });
}
