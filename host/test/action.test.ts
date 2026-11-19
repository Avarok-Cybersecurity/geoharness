import { readdirSync, readFileSync } from 'node:fs';
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

const WORKFLOWS = join(import.meta.dirname, '..', '..', '.github', 'workflows');
const workflow = (name: string): string => readFileSync(join(WORKFLOWS, name), 'utf8');

describe('workflows', () => {
  it('pin every remote action by full commit SHA (the local action ./ is this checkout)', () => {
    for (const name of readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'))) {
      for (const m of workflow(name).matchAll(/uses:\s*(\S+)/g)) {
        if (m[1] !== './') expect(m[1], name).toMatch(/@[0-9a-f]{40}$/);
      }
    }
  });

  it('dogfood: pull requests never deploy and never receive Cloudflare secrets', () => {
    const wf = workflow('deploy.yml');
    const dry = wf.slice(wf.indexOf('\n  dry-run:'));
    expect(dry).toContain("if: github.event_name == 'pull_request'");
    expect(dry).toContain('deploy: "false"');
    expect(dry).not.toContain('secrets.');
    const deploy = wf.slice(wf.indexOf('\n  deploy:'), wf.indexOf('\n  dry-run:'));
    expect(deploy).toContain("github.ref == 'refs/heads/main'");
    expect(deploy).toContain('cancel-in-progress: false');
    expect(deploy).toContain('rollback-on-failure: "true"');
  });
});
