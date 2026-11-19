import type { ProcResult } from '../io/types.js';
import { redactAll } from './redact.js';

/** Cloudflare error codes whose fix is a GeoHarness input, named in the error. */
const HINTS: Record<number, string> = {
  100117: 'the host name still has its own DNS records (e.g. a CNAME to Pages); see the takeover-dns input and "Moving from Pages to Workers" in the README',
};

/** The `[ERROR]` block wrangler prints: its first line and the indented lines up to the issue-tracker boilerplate. */
function errorBlock(output: string): string[] {
  const lines = output.split('\n');
  const start = lines.findIndex((l) => l.includes('[ERROR]'));
  if (start < 0) return [];
  const block = [(lines[start] ?? '').replace(/^.*?\[ERROR\]\s*/, '')];
  for (const line of lines.slice(start + 1)) {
    if (line.includes('If you think this is a bug') || line.includes('[ERROR]')) break;
    if (line.trim() !== '') block.push(line.trim());
    if (block.length >= 6) break;
  }
  return block;
}

/** Why a tool failed: the exit code plus its own error block and Cloudflare error codes, secrets redacted. */
export function toolFailure(bin: string, subcommand: string, r: ProcResult, secrets: readonly string[]): string {
  const head = `${bin} ${subcommand} exited with ${r.code}`;
  const output = redactAll(`${r.stderr}\n${r.stdout}`, secrets);
  const block = errorBlock(output);
  if (block.length === 0) return `${head} (no [ERROR] line in its output)`;
  const codes = [...new Set([...block.join('\n').matchAll(/\[code: (\d+)\]/g)].map((m) => Number(m[1])))];
  const notes = codes.map((c) => `Cloudflare error ${c}${HINTS[c] === undefined ? '' : `: ${HINTS[c]}`}`);
  return [`${head}:`, ...block.map((l) => `  ${l}`), ...notes].join('\n');
}

export const wranglerFailure = (subcommand: string, r: ProcResult, secrets: readonly string[]): string =>
  toolFailure('wrangler', subcommand, r, secrets);
