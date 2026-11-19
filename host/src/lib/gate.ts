import type { AuditReport } from '../core/types-index.js';

/** Reasons an audit fails the run: any failed blocking finding, or a score under the minimum. */
export function gateFailures(report: AuditReport, minScore: number): string[] {
  const failures = report.findings
    .filter((f) => f.severity === 'blocking' && !f.passed)
    .map((f) => `blocking ${f.checkId}${f.route === undefined ? '' : ` (${f.route})`}: ${f.title} — ${f.evidence}`);
  if (report.score < minScore) failures.push(`GEO score ${report.score} is below geo-min-score ${minScore}`);
  return failures;
}

export function buildMetaContent(html: string): string | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\bname\s*=\s*["']?build["'\s>]/i.test(tag)) continue;
    return /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
  }
  return undefined;
}
