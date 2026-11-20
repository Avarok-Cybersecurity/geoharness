import type { AuditReport } from '../core/types-index.js';
import type { CertificateOutcome } from './certificates.js';
import { LIGHTHOUSE_CATEGORIES } from './lighthouse-rc.js';
import type { LighthouseState, RunState } from '../stages/context.js';

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

const CATEGORY_TITLES: Record<(typeof LIGHTHOUSE_CATEGORIES)[number], string> = {
  performance: 'Performance', accessibility: 'Accessibility', 'best-practices': 'Best practices', seo: 'SEO',
};

function lighthouseSection(title: string, lh: LighthouseState): string[] {
  const out = [`### ${title}`, ''];
  if (lh.skipped) return [...out, 'Skipped (`lighthouse: false`).', ''];
  for (const u of lh.urls) {
    const link = Object.entries(lh.links).find(([k]) => new URL(k).pathname === new URL(u).pathname)?.[1];
    out.push(`- ${new URL(u).pathname}${link === undefined ? '' : ` — [report](${link})`}`);
  }
  out.push('');
  if (lh.medians.length > 0) {
    out.push(`| Page | ${LIGHTHOUSE_CATEGORIES.map((c) => CATEGORY_TITLES[c]).join(' | ')} | Failing audits |`,
      `|---|${LIGHTHOUSE_CATEGORIES.map(() => '---:').join('|')}|---|`);
    for (const m of lh.medians) {
      const audits = m.failingAudits.length === 0 ? '—' : m.failingAudits.map((id) => `\`${cell(id)}\``).join(', ');
      out.push(`| ${cell(new URL(m.url).pathname)} | ${LIGHTHOUSE_CATEGORIES.map((c) => String(m.scores[c] ?? '')).join(' | ')} | ${audits} |`);
    }
    out.push('', 'Median of the runs per URL; 100 in every category passes.', '');
  }
  if (lh.failures.length > 0) {
    out.push('| URL | Category | Median | Failing audits |', '|---|---|---:|---|');
    for (const f of lh.failures) out.push(`| ${cell(f.url)} | ${f.category} | ${f.score} | ${cell(f.audits.join('; '))} |`);
    out.push('');
  }
  return out;
}

const CERTIFICATE_ACTIONS: Record<CertificateOutcome['action'], string> = {
  kept: 'kept', renewed: 'renewed', 'would-renew': 'would renew (dry run)', 'renewal-failed-kept-old': '**renewal failed, kept old**',
};

function certificatesSection(outcomes: CertificateOutcome[]): string[] {
  const out = ['### Certificates', '', '| Domain | notAfter | Days left | Action | Detail |', '|---|---|---:|---|---|'];
  for (const o of outcomes) {
    out.push(`| ${cell(o.domain)} | ${o.notAfter ?? '—'} | ${o.daysLeft ?? '—'} | ${CERTIFICATE_ACTIONS[o.action]} | ${cell(o.detail)} |`);
  }
  return [...out, ''];
}

/** The GITHUB_STEP_SUMMARY body: whatever the run reached, including after a failure. */
export function renderSummary(state: RunState, failure: string | undefined): string {
  const out = ['## GeoHarness', ''];
  if (failure !== undefined) out.push(`**Failed:** ${cell(failure)}`, '');
  if (state.dryRun === true) out.push('Dry run (`deploy: false`): nothing was deployed and the zone was not touched.', '');
  if (state.deploy !== undefined) out.push(`Deployed to ${state.deploy.url} (${state.deploy.target})`, '');
  if (state.liveAudit !== undefined) out.push(...auditSection('GEO score (live)', state.liveAudit));
  if (state.staticAudit !== undefined) out.push(...auditSection('GEO score (build)', state.staticAudit));
  if (state.rollback !== undefined) out.push(`**Rollback:** ${cell(state.rollback.detail)}`, '');
  if (state.liveLighthouse !== undefined) out.push(...lighthouseSection('Lighthouse (live)', state.liveLighthouse));
  if (state.lighthouse !== undefined) out.push(...lighthouseSection('Lighthouse (before deploy, local wrangler)', state.lighthouse));
  if (state.certificates !== undefined && state.certificates.length > 0) out.push(...certificatesSection(state.certificates));
  const pages = state.processed?.pages;
  if (pages !== undefined) {
    out.push(`### Markdown twins (${pages.length})`, '', '| Route | Twin | Tokens |', '|---|---|---:|');
    for (const p of pages) out.push(`| ${cell(p.route)} | ${cell(p.markdownFile)} | ${p.tokens} |`);
    out.push('');
  }
  if (state.dnsTakeover !== undefined) out.push('### DNS takeover', '', ...state.dnsTakeover.map((c) => `- ${cell(c)}`), '');
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
