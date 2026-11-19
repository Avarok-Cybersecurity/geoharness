// Minimal markdown → HTML for the generated site sections: inline code, bold, links, bare URLs,
// paragraphs and pipe tables. Only the subset the repository's own docs use; everything is escaped.

/** Also breaks `{{`: GeoHarness templates `{{geo.*}}`/`{{env.*}}` in page HTML, and docs show them literally. */
export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\{\{/g, '&#123;{');
}

const SITE_ORIGIN = 'https://geo.avarok.net';
const REPO = 'https://github.com/Avarok-Cybersecurity/geoharness/blob/main/';

/** Repository-relative links (../fixtures/x) become GitHub links; site links become root-relative. */
export function resolveHref(href) {
  if (href.startsWith(SITE_ORIGIN)) return href.slice(SITE_ORIGIN.length) || '/';
  if (/^(https?:|mailto:|#|\/)/.test(href)) return href;
  return REPO + href.replace(/^(\.\.\/)+/, '');
}

/** Inline markdown to HTML. Code spans are cut out first so nothing inside them is interpreted. */
export function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\uE000${codes.length - 1}\uE000`;
  });
  const links = [];
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    links.push(`<a href="${escapeHtml(resolveHref(href))}">${inlineText(label)}</a>`);
    return `\uE001${links.length - 1}\uE001`;
  });
  s = escapeHtml(s);
  s = s.replace(/https?:\/\/[^\s<)]+[^\s<).,;]/g, (url) => `<a href="${url}">${url}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\uE001(\d+)\uE001/g, (_, i) => links[Number(i)]);
  return s.replace(/\uE000(\d+)\uE000/g, (_, i) => codes[Number(i)]);
}

function inlineText(label) {
  return escapeHtml(label).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** Splits a pipe-table row, honouring \| escapes and pipes inside code spans. */
export function splitRow(line) {
  const cells = [];
  let cur = '';
  let code = false;
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '\\' && body[i + 1] === '|') { cur += '|'; i += 1; continue; }
    if (ch === '`') code = !code;
    if (ch === '|' && !code) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/** Parses the first pipe table in `lines` starting at index `start`. */
export function parseTable(lines, start = 0) {
  let i = start;
  while (i < lines.length && !lines[i].trim().startsWith('|')) i += 1;
  const head = splitRow(lines[i] ?? '');
  const rows = [];
  for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i += 1) rows.push(splitRow(lines[i]));
  return { head, rows, end: i };
}

/** A table as HTML. `numeric` names columns to right-align. */
export function htmlTable(head, rows, { caption, numeric = [] } = {}) {
  const align = (h) => (numeric.includes(h) ? ' class="num"' : '');
  const out = ['<div class="table"><table>'];
  if (caption !== undefined) out.push(`<caption>${inline(caption)}</caption>`);
  out.push(`<thead><tr>${head.map((h) => `<th scope="col"${align(h)}>${inline(h)}</th>`).join('')}</tr></thead>`, '<tbody>');
  for (const r of rows) out.push(`<tr>${r.map((c, j) => `<td${align(head[j])}>${inline(c)}</td>`).join('')}</tr>`);
  out.push('</tbody></table></div>');
  return out.join('\n');
}

/** A table as markdown (cells already markdown). */
export function mdTable(head, rows) {
  // `<` outside code spans would be read as an HTML tag by GitHub (e.g. "Page has a <title>").
  const outsideCode = (c) => c.split('`').map((part, i) => (i % 2 === 0 ? part.replace(/</g, '&lt;') : part)).join('`');
  const cell = (c) => outsideCode(String(c)).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}
