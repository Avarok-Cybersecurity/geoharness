/** Replaces every occurrence of each non-empty secret with `***`. */
export function redactAll(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) if (s.length > 0) out = out.split(s).join('***');
  return out;
}
