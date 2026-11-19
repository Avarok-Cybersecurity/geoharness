/**
 * A thrown value as one line: its message, then each `cause` that adds something. Node's fetch throws "fetch
 * failed" and keeps the reason (ECONNRESET, a timeout) only in `cause`; a message that already quotes its cause
 * does not repeat it.
 */
export function describeError(e: unknown): string {
  let out = '';
  let cur: unknown = e;
  for (let depth = 0; cur !== undefined && cur !== null && depth < MAX_CAUSE_DEPTH; depth += 1) {
    const part = oneError(cur);
    if (part !== '' && !out.includes(part)) out = out === '' ? part : `${out}: ${part}`;
    cur = cur instanceof Error ? cur.cause : undefined;
  }
  return out;
}

/** undici nests two levels (TypeError, then the socket or system error); the bound stops a cyclic chain. */
const MAX_CAUSE_DEPTH = 4;

function oneError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const code = (e as NodeJS.ErrnoException).code;
  if (typeof code !== 'string' || code === '' || e.message.includes(code)) return e.message;
  return e.message === '' ? code : `${e.message} (${code})`;
}
