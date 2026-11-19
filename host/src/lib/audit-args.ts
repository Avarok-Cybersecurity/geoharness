export interface AuditArgs { target: string; config?: string; buildId?: string }

/** `audit <url> [--config <file>] [--build-id <sha>]`; undefined on any malformed or repeated flag. */
export function parseAuditArgs(args: string[]): AuditArgs | undefined {
  const [target, ...flags] = args;
  if (target === undefined || target.startsWith('--')) return undefined;
  const out: AuditArgs = { target };
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i];
    const value = flags[i + 1];
    if (value === undefined || value.startsWith('--')) return undefined;
    if (flag === '--config' && out.config === undefined) out.config = value;
    else if (flag === '--build-id' && out.buildId === undefined) out.buildId = value;
    else return undefined;
  }
  return out;
}
