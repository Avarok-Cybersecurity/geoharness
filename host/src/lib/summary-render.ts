import type { AuditReport } from '../core/types-index.js';
import type { RunState } from '../stages/context.js';

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function auditSection(title: string, r: AuditReport): string[] {
  const lines = [`### ${title}: ${r.score}/100`, '', '| Category | Weight | Score |', '|---|---:|---:|'];
  for (const c of r.categories) lines.push(`| ${cell(c.title)} | ${c.weight} | ${c.score} |`);
  const failed = r.findings.filter((f) => !f.passed);
  if (failed.length > 0) {
    lines.push('', '| Check | Severity | Route | Evidence | Sources |', '|---|---|---|---|---|');
    for (const f of failed) {
      lines.push(`| ${cell(f.title)} | ${f.severity} | ${cell(f.route ?? '')} | ${cell(f.evidence)} | ${f.citations.join(', ')} |`);
    }
  } else lines.push('', 'All checks passed.');
  return [...lines, ''];
}

/** The GITHUB_STEP_SUMMARY body: whatever the run reached, including after a failure. */
export function renderSummary(state: RunState, failure: string | undefined): string {
  const out = ['## GeoHarness', ''];
  if (failure !== undefined) out.push(`**Failed:** ${cell(failure)}`, '');
  if (state.dryRun === true) out.push('Dry run (`deploy: false`): nothing was deployed and the zone was not touched.', '');
  if (state.deploy !== undefined) out.push(`Deployed to ${state.deploy.url} (${state.deploy.target})`, '');
  if (state.liveAudit !== undefined) out.push(...auditSection('GEO score (live)', state.liveAudit));
  if (state.staticAudit !== undefined) out.push(...auditSection('GEO score (build)', state.staticAudit));
  const lh = state.lighthouse;
  if (lh !== undefined) {
    out.push('### Lighthouse', '');
    if (lh.skipped) out.push('Skipped (`lighthouse: false`).', '');
    else {
      for (const u of lh.urls) {
        const link = Object.entries(lh.links).find(([k]) => new URL(k).pathname === new URL(u).pathname)?.[1];
        out.push(`- ${new URL(u).pathname}${link === undefined ? '' : ` — [report](${link})`}`);
      }
      out.push('');
    }
  }
  const pages = state.processed?.pages;
  if (pages !== undefined) {
    out.push(`### Markdown twins (${pages.length})`, '', '| Route | Twin | Tokens |', '|---|---|---:|');
    for (const p of pages) out.push(`| ${cell(p.route)} | ${cell(p.markdownFile)} | ${p.tokens} |`);
    out.push('');
  }
  if (state.zoneChanges !== undefined) {
    out.push('### Zone changes', '');
    out.push(...(state.zoneChanges.length === 0 ? ['None — already configured.'] : state.zoneChanges.map((c) => `- ${c}`)), '');
  }
  if (state.access?.negotiation === 'negotiate-worker') {
    out.push('> [!WARNING]', '> No zone access: markdown negotiation runs in a Worker (100k requests/day on Free, then HTTP 429).', '');
  }
  if (state.indexnow !== undefined) out.push(`IndexNow: ${state.indexnow.submitted.length} URLs submitted.`, '');
  return `${out.join('\n')}\n`;
}

export function actionOutputs(state: RunState): Record<string, string> {
  const score = state.liveAudit?.score ?? state.staticAudit?.score;
  return {
    'geo-score': score === undefined ? '' : String(score),
    url: state.deploy?.url ?? '',
    'markdown-count': state.processed === undefined ? '' : String(state.processed.pages.length),
  };
}
