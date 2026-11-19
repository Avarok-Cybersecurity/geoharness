import { asObject, asString, isObject } from './json.js';
import { LIGHTHOUSE_CATEGORIES } from './lighthouse-rc.js';

/** A category whose median score is below 100 on one URL, with the audits that cost it points. */
export interface LighthouseFailure { url: string; category: string; score: number; audits: string[] }

/** One audited URL: the median score (0–100) per category and the ids of weighted audits failing in most runs. */
export interface LighthouseMedian { url: string; scores: Record<string, number>; failingAudits: string[] }

interface Run { url: string; scores: Map<string, number>; failing: Map<string, { id: string; label: string }[]> }

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
  const failing = new Map<string, { id: string; label: string }[]>();
  for (const c of LIGHTHOUSE_CATEGORIES) {
    const cat = asObject(categories[c], `lhr[${i}].categories.${c}`);
    scores.set(c, typeof cat.score === 'number' ? cat.score : 0);
    const refs = Array.isArray(cat.auditRefs) ? cat.auditRefs.filter(isObject) : [];
    const ids = refs.filter((r) => typeof r.weight === 'number' && r.weight > 0 && typeof r.id === 'string').map((r) => String(r.id));
    failing.set(c, ids.flatMap((id) => {
      const a = audits[id];
      return isObject(a) && typeof a.score === 'number' && a.score < 1 ? [{ id, label: auditLabel(a, id) }] : [];
    }));
  }
  return { url, scores, failing };
}

function byUrl(lhrs: unknown[]): Map<string, Run[]> {
  const out = new Map<string, Run[]>();
  lhrs.forEach((l, i) => {
    const run = readRun(l, i);
    out.set(run.url, [...(out.get(run.url) ?? []), run]);
  });
  return out;
}

/** Audits (labels) of category `c` that failed in a strict majority of `runs`. */
function majorityFailing(runs: Run[], c: string): { id: string; label: string }[] {
  const counts = new Map<string, { a: { id: string; label: string }; n: number }>();
  for (const r of runs) {
    for (const a of r.failing.get(c) ?? []) counts.set(a.label, { a, n: (counts.get(a.label)?.n ?? 0) + 1 });
  }
  return [...counts.values()].filter(({ n }) => n * 2 > runs.length).map(({ a }) => a);
}

/** Per audited URL, in report order: median category scores and the failing audit ids, for the job summary. */
export function lighthouseMedians(lhrs: unknown[]): LighthouseMedian[] {
  return [...byUrl(lhrs)].map(([url, runs]) => {
    const scores: Record<string, number> = {};
    const ids = new Set<string>();
    for (const c of LIGHTHOUSE_CATEGORIES) {
      scores[c] = Math.round(median(runs.map((r) => r.scores.get(c) ?? 0)) * 100);
      for (const a of majorityFailing(runs, c)) ids.add(a.id);
    }
    return { url, scores, failingAudits: [...ids] };
  });
}

/**
 * Per URL and category: the median score over the runs (what the median-run assertion judges) and, when it
 * is under 100, every weighted audit that failed in a majority of the runs.
 */
export function lighthouseFailures(lhrs: unknown[]): LighthouseFailure[] {
  const out: LighthouseFailure[] = [];
  for (const [url, runs] of byUrl(lhrs)) {
    for (const c of LIGHTHOUSE_CATEGORIES) {
      const score = median(runs.map((r) => r.scores.get(c) ?? 0));
      if (score >= 1) continue;
      out.push({ url, category: c, score: Math.round(score * 100), audits: majorityFailing(runs, c).map((a) => a.label) });
    }
  }
  return out;
}
