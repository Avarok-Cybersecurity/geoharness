// Every generated README/site section, as { name: text }. README sections are markdown,
// site sections are HTML. Sources: action.yml, cloudflare-permissions.json, docs/config.md,
// docs/generated/checks.json and CITATIONS.md (see sources.mjs).
import { ADAPTER_HEAD, ADAPTERS } from './adapters.mjs';
import { escapeHtml, htmlTable, inline, mdTable } from './md.mjs';
import { actionSpec, checkCatalog, citations, configReference, permissions, readText } from './sources.mjs';

const code = (s) => `\`${s}\``;
const requiredCell = (i) => (i.required ? 'yes' : 'no');
const defaultCell = (i) => (i.default === undefined ? '—' : code(i.default));

function inputRows() {
  return actionSpec().inputs.map((i) => [code(i.name), requiredCell(i), defaultCell(i), i.description.replace(/\s+/g, ' ')]);
}
const outputRows = () => actionSpec().outputs.map((o) => [code(o.name), o.description]);

function permissionRows() {
  return permissions().groups.map((g) => [g.name, g.scope, g.features.map(code).join(', ')]);
}

/** Strongest grade first: "A", "A (spec)", "B (preprint)", "C", "D". */
function gradeOf(ids, byId) {
  const grades = ids.map((id) => byId.get(id)?.grade ?? '?');
  return [...new Set(grades)].sort().join(', ');
}

function checkRows(link) {
  const { checks } = checkCatalog();
  const { byId } = citations();
  for (const c of checks) for (const id of c.citations) if (!byId.has(id)) throw new Error(`check ${c.id} cites unknown ${id}`);
  return checks.map((c) => [code(c.id), c.title, c.category, c.severity, gradeOf(c.citations, byId), c.citations.map(link).join(', ')]);
}
const adapterRows = () => ADAPTERS.map(([id, when, what]) => [code(id), when, what]);
const categoryRows = () => checkCatalog().categories.map((c) => [c.title, code(c.id), String(c.weight)]);

const CHECK_HEAD = ['Check', 'What it verifies', 'Category', 'Severity', 'Evidence grade', 'Citations'];

function readmeCitations() {
  const { text } = citations();
  const body = text.slice(text.indexOf('**Evidence grades**')).trim();
  return body.replace(/^## /gm, '### ');
}

export function readmeSections() {
  return {
    inputs: ['### Inputs', '', mdTable(['Input', 'Required', 'Default', 'Description'], inputRows()), '',
      '### Outputs', '', mdTable(['Output', 'Description'], outputRows())].join('\n'),
    permissions: mdTable(['Permission group', 'Scope', 'Needed for'], permissionRows()),
    'geo-score': ['| Category | Id | Weight |', '|---|---|---:|', ...categoryRows().map((r) => `| ${r.join(' | ')} |`), '',
      mdTable(CHECK_HEAD, checkRows((id) => `[${id}](#citations)`))].join('\n'),
    adapters: mdTable(ADAPTER_HEAD, adapterRows()),
    citations: readmeCitations(),
  };
}

function htmlConfig() {
  const ref = configReference();
  const out = [htmlTable(ref.head, ref.rows, { caption: 'geoharness.toml keys' })];
  for (const s of ref.sections) {
    if (s.title === 'Example') continue;
    out.push(`<h3 id="config-${s.title.toLowerCase()}">${escapeHtml(s.title)}</h3>`, ...s.body.map((p) => `<p>${inline(p)}</p>`));
  }
  return out.join('\n');
}

function htmlCitations() {
  const { grades, sections } = citations();
  const out = [htmlTable(grades.head, grades.rows, { caption: 'Evidence grades' })];
  for (const s of sections) {
    const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
    out.push(`<h2 id="${slug}">${escapeHtml(s.title)}</h2>`);
    if (s.note !== undefined) out.push(`<p>${inline(s.note)}</p>`);
    if (s.head[0] !== 'ID') { out.push(htmlTable(s.head, s.rows)); continue; }
    out.push('<div class="table"><table>', `<thead><tr>${s.head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead>`, '<tbody>');
    for (const r of s.rows) out.push(`<tr id="${escapeHtml(r[0])}"><th scope="row"><code>${escapeHtml(r[0])}</code></th>${r.slice(1).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
    out.push('</tbody></table></div>');
  }
  return out.join('\n');
}

export function siteSections() {
  const cite = (id) => code(id);
  return {
    inputs: htmlTable(['Input', 'Required', 'Default', 'Description'], inputRows(), { caption: 'Action inputs (from action.yml)' }),
    outputs: htmlTable(['Output', 'Description'], outputRows(), { caption: 'Action outputs' }),
    config: htmlConfig(),
    permissions: htmlTable(['Permission group', 'Scope', 'Needed for'], permissionRows(), { caption: 'API token permission groups (from cloudflare-permissions.json)' }),
    'permission-features': htmlTable(['Feature', 'What it does', 'Groups'],
      permissions().features.map((f) => [code(f.id), f.description, f.groups.map((g) => `${g.name} (${g.scope})`).join(', ')])),
    categories: htmlTable(['Category', 'Id', 'Weight'], categoryRows(), { caption: 'GEO score categories', numeric: ['Weight'] }),
    checks: htmlTable(CHECK_HEAD, checkRows(cite), { caption: 'Every check, its severity and the evidence behind it' }),
    adapters: htmlTable(ADAPTER_HEAD, adapterRows()),
    'site-config': `<pre><code>${escapeHtml(readText('site/geoharness.toml').trim())}</code></pre>`,
    citations: htmlCitations(),
  };
}
