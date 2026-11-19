import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const yml = readFileSync(join(import.meta.dirname, '..', '..', 'action.yml'), 'utf8');
const inputsBlock = yml.slice(yml.indexOf('\ninputs:'), yml.indexOf('\noutputs:'));
const names = [...inputsBlock.matchAll(/^ {2}([a-z-]+):$/gm)].map((m) => m[1] ?? '');

describe('action.yml', () => {
  it('forwards every input to the CLI as INPUT_<NAME>, so none is silently ignored', () => {
    expect(names.length).toBeGreaterThan(10);
    for (const n of names) {
      expect(yml).toContain(`INPUT_${n.toUpperCase().replace(/-/g, '_')}: \${{ inputs.${n} }}`);
    }
  });

  it('pins every action by full commit SHA', () => {
    const uses = [...yml.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1] ?? '');
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
  });

  it('never interpolates inputs into the shell script', () => {
    const runs = [...yml.matchAll(/^\s+run:\s*(.+)$/gm)].map((m) => m[1] ?? '');
    for (const r of runs) expect(r).not.toContain('${{');
  });
});

describe('host workflow', () => {
  it('pins every action by full commit SHA', () => {
    const wf = readFileSync(join(import.meta.dirname, '..', '..', '.github', 'workflows', 'host.yml'), 'utf8');
    for (const m of wf.matchAll(/uses:\s*(\S+)/g)) expect(m[1]).toMatch(/@[0-9a-f]{40}$/);
  });
});
