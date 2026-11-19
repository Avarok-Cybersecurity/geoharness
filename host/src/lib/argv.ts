/**
 * Splits a build-command input into argv without a shell. Quotes ('…', "…") group words; anything a shell
 * would interpret (pipes, redirects, ;, &, $, backticks, globs) is rejected so it can never be injected.
 */
const SHELL_META = /[|&;<>$`*?(){}\\]/;

export function splitCommand(command: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let started = false;
  for (const ch of command) {
    if (quote !== undefined) {
      if (ch === quote) quote = undefined;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (/\s/.test(ch)) {
      if (started) { out.push(current); current = ''; started = false; }
      continue;
    }
    if (SHELL_META.test(ch)) {
      throw new Error(`build-command contains "${ch}", which needs a shell; put the steps in a script and call it instead`);
    }
    current += ch;
    started = true;
  }
  if (quote !== undefined) throw new Error('build-command has an unterminated quote');
  if (started) out.push(current);
  if (out.length === 0) throw new Error('build-command is empty');
  return out;
}
