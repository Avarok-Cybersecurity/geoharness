import { unwrap } from './core/core.js';
import type { Core } from './core/core.js';
import type { AuditReport, LiveCheckInput, LiveObservation, LiveRequest } from './core/types-index.js';
import type { HostIO } from './io/types.js';
import { LIVE_TIMEOUT_MS, observe } from './stages/live.js';

export interface AuditUrlOptions {
  target: string;
  /** geoharness.toml text: audits against the site's own policy (then buildId is required). */
  configToml?: string;
  /** The deployed commit, matched against `<meta name="build">`. */
  buildId?: string;
}

async function get(io: HostIO, url: string, accept: string): Promise<{ status: number; body: string }> {
  const r = await io.http.request({ method: 'GET', url, headers: { accept }, timeoutMs: LIVE_TIMEOUT_MS, redirect: 'follow' });
  return { status: r.status, body: r.body };
}

async function observeAll(io: HostIO, plan: LiveRequest[]): Promise<LiveObservation[]> {
  const live: LiveObservation[] = [];
  for (const req of plan) live.push(await observe(io, req));
  return live;
}

/**
 * Live audit of any URL. Without a config the core's config-less `auditLive` judges only what the
 * site serves (no policy is invented for it); with --config the full audit runs against that policy.
 */
export async function auditUrl(io: HostIO, core: Core, o: AuditUrlOptions): Promise<AuditReport> {
  const url = new URL(o.target);
  const routes = [url.pathname];
  const build = o.buildId === undefined ? {} : { buildId: o.buildId };
  if (o.configToml === undefined) {
    const plan = unwrap('liveCheckPlan', core.liveCheckPlan({ origin: url.origin, routes, ...build }));
    const live = await observeAll(io, plan);
    return unwrap('auditLive', core.auditLive({ origin: url.origin, routes, ...build, live }));
  }
  if (o.buildId === undefined) throw new Error('audit with --config also needs --build-id <deployed commit SHA>');
  const config = unwrap('parseConfig', core.parseConfig(o.configToml));
  const planInput: LiveCheckInput = { config, routes, buildId: o.buildId };
  const live = await observeAll(io, unwrap('liveCheckPlan', core.liveCheckPlan(planInput)));
  const html = await get(io, url.href, 'text/html');
  if (html.status !== 200) throw new Error(`${url.href} answered HTTP ${html.status}`);
  const md = await get(io, url.href, 'text/markdown');
  const robots = await get(io, `${url.origin}/robots.txt`, 'text/plain');
  const llms = await get(io, `${url.origin}/llms.txt`, 'text/plain');
  const sitemap = await get(io, `${url.origin}/sitemap.xml`, 'application/xml');
  return unwrap('audit', core.audit({
    config,
    buildId: o.buildId,
    pages: [{ route: url.pathname, html: html.body, markdown: md.status === 200 ? md.body : '' }],
    // Nothing was processed here, so no route is known to have been passed through by content.exclude.
    excludedRoutes: [],
    robots: robots.status === 200 ? robots.body : '',
    headers: '',
    ...(llms.status === 200 ? { llms: llms.body } : {}),
    sitemap: sitemap.status === 200 ? sitemap.body : '',
    live,
  }));
}

export function formatReport(target: string, r: AuditReport): string {
  const lines = [`GEO audit of ${target}: ${r.score}/100`, ''];
  for (const c of r.categories) lines.push(`  ${c.title.padEnd(32)} ${String(c.score).padStart(3)}  (weight ${c.weight})`);
  lines.push('');
  for (const f of r.findings) {
    const mark = f.passed ? 'PASS' : f.severity === 'blocking' ? 'FAIL' : 'WARN';
    lines.push(`  [${mark}] ${f.title}${f.route === undefined ? '' : ` ${f.route}`} — ${f.evidence} (${f.citations.join(', ')})`);
  }
  return `${lines.join('\n')}\n`;
}
