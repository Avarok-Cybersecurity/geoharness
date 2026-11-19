import { asObject, asString, isObject } from './json.js';
import { LIGHTHOUSE_CATEGORIES } from './lighthouse-rc.js';

/** A category whose median score is below 100 on one URL, with the audits that cost it points. */
export interface LighthouseFailure { url: string; category: string; score: number; audits: string[] }

interface Run { url: string; scores: Map<string, number>; failing: Map<string, string[]> }

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

function auditLabel(audit: Record<string, unknown>, id: string): string {
  const title = typeof audit.title === 'string' ? ` (${audit.title})` : '';
  const why = typeof audit.explanation === 'string' && audit.explanation !== '' ? `: ${audit.explanation}` : '';
  return `${id}${title}${why}`;
}

function readRun(lhr: unknown, i: number): Run {
  const o = asObject(lhr, `lhr[${i}]`);
  const url = asString(o.requestedUrl, `lhr[${i}].requestedUrl`);
  const categories = asObject(o.categories, `lhr[${i}].categories`);
  const audits = asObject(o.audits, `lhr[${i}].audits`);
  const scores = new Map<string, number>();
  const failing = new Map<string, string[]>();
  for (const c of LIGHTHOUSE_CATEGORIES) {
    const cat = asObject(categories[c], `lhr[${i}].categories.${c}`);
    scores.set(c, typeof cat.score === 'number' ? cat.score : 0);
    const refs = Array.isArray(cat.auditRefs) ? cat.auditRefs.filter(isObject) : [];
    const ids = refs.filter((r) => typeof r.weight === 'number' && r.weight > 0 && typeof r.id === 'string').map((r) => String(r.id));
    failing.set(c, ids.flatMap((id) => {
      const a = audits[id];
      return isObject(a) && typeof a.score === 'number' && a.score < 1 ? [auditLabel(a, id)] : [];
    }));
  }
  return { url, scores, failing };
}

/**
 * Per URL and category: the median score over the runs (what the median-run assertion judges) and, when it
 * is under 100, every weighted audit that failed in a majority of the runs.
 */
export function lighthouseFailures(lhrs: unknown[]): LighthouseFailure[] {
  const byUrl = new Map<string, Run[]>();
  lhrs.forEach((l, i) => {
    const run = readRun(l, i);
    byUrl.set(run.url, [...(byUrl.get(run.url) ?? []), run]);
  });
  const out: LighthouseFailure[] = [];
  for (const [url, runs] of byUrl) {
    for (const c of LIGHTHOUSE_CATEGORIES) {
      const score = median(runs.map((r) => r.scores.get(c) ?? 0));
      if (score >= 1) continue;
      const counts = new Map<string, number>();
      for (const r of runs) for (const a of r.failing.get(c) ?? []) counts.set(a, (counts.get(a) ?? 0) + 1);
      const audits = [...counts].filter(([, n]) => n * 2 > runs.length).map(([a]) => a);
      out.push({ url, category: c, score: Math.round(score * 100), audits });
    }
  }
  return out;
}
