// Readers for the single sources the generated README/site sections derive from.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseTable } from './md.mjs';

export const ROOT = join(import.meta.dirname, '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** action.yml inputs and outputs, in file order. */
export function actionSpec() {
  const doc = parseYaml(read('action.yml'));
  const inputs = Object.entries(doc.inputs).map(([name, v]) => ({
    name, description: String(v.description).trim(), required: v.required === true,
    ...(v.default === undefined ? {} : { default: String(v.default) }),
  }));
  const outputs = Object.entries(doc.outputs).map(([name, v]) => ({ name, description: String(v.description).trim() }));
  return { inputs, outputs };
}

/** cloudflare-permissions.json features, plus the distinct permission groups by scope. */
export function permissions() {
  const doc = JSON.parse(read('cloudflare-permissions.json'));
  const features = Object.entries(doc.features).map(([id, f]) => ({ id, description: f.description, groups: f.groups }));
  const groups = new Map();
  for (const f of features) {
    for (const g of f.groups) {
      const key = `${g.scope}:${g.name}`;
      const entry = groups.get(key) ?? { name: g.name, scope: g.scope, features: [] };
      entry.features.push(f.id);
      groups.set(key, entry);
    }
  }
  const order = (s) => (s === 'account' ? 0 : 1);
  return { features, groups: [...groups.values()].sort((a, b) => order(a.scope) - order(b.scope) || a.name.localeCompare(b.name)) };
}

/** docs/config.md: the key table and the prose sections after it. */
export function configReference() {
  const lines = read('docs/config.md').split('\n');
  const table = parseTable(lines);
  const intro = lines.slice(2, lines.findIndex((l) => l.trim().startsWith('|'))).join(' ').trim();
  const sections = [];
  let cur;
  for (const line of lines.slice(table.end)) {
    if (line.startsWith('## ')) { cur = { title: line.slice(3).trim(), body: [] }; sections.push(cur); continue; }
    if (cur !== undefined && line.trim() !== '') cur.body.push(line.trim());
  }
  return { intro, head: table.head, rows: table.rows, sections };
}

/** CITATIONS.md: the grade table, each source section with its rows, and the rejected list. */
export function citations() {
  const text = read('CITATIONS.md');
  const lines = text.split('\n');
  const grades = parseTable(lines, lines.findIndex((l) => l.startsWith('**Evidence grades**')));
  const sections = [];
  lines.forEach((line, i) => {
    if (!line.startsWith('## ')) return;
    const t = parseTable(lines, i);
    const note = lines.slice(i + 1, t.end).find((l) => l.trim() !== '' && !l.trim().startsWith('|'));
    sections.push({ title: line.slice(3).trim(), note, head: t.head, rows: t.rows });
  });
  const byId = new Map();
  for (const s of sections) {
    if (s.head[0] !== 'ID') continue;
    for (const r of s.rows) byId.set(r[0], { id: r[0], source: r[1], grade: r[2], supports: r[3] });
  }
  return { text, grades, sections, byId };
}

/** docs/generated/checks.json (cargo run -p xtask -- gen-checks). */
export function checkCatalog() {
  return JSON.parse(read('docs/generated/checks.json'));
}

export const readText = read;
