import { unwrap } from './core/core.js';
import type { Core } from './core/core.js';
import type { AuditReport, SiteConfig } from './core/types-index.js';
import type { HostIO } from './io/types.js';
import { probeConfig } from './lib/probe-config.js';
import { LIVE_TIMEOUT_MS, observe } from './stages/live.js';

async function get(io: HostIO, url: string, accept: string): Promise<{ status: number; body: string }> {
  const r = await io.http.request({ method: 'GET', url, headers: { accept }, timeoutMs: LIVE_TIMEOUT_MS, redirect: 'follow' });
  return { status: r.status, body: r.body };
}

/** Live-only audit of any URL: page, robots, llms, sitemap and the Accept/user-agent matrix. */
export async function auditUrl(io: HostIO, core: Core, target: string, configToml: string | undefined): Promise<AuditReport> {
  const url = new URL(target);
  const config: SiteConfig = configToml === undefined ? probeConfig(url) : unwrap('parseConfig', core.parseConfig(configToml));
  const html = await get(io, url.href, 'text/html');
  if (html.status !== 200) throw new Error(`${url.href} answered HTTP ${html.status}`);
  const md = await get(io, url.href, 'text/markdown');
  const robots = await get(io, `${url.origin}/robots.txt`, 'text/plain');
  const llms = await get(io, `${url.origin}/llms.txt`, 'text/plain');
  const sitemap = await get(io, `${url.origin}/sitemap.xml`, 'application/xml');
  const plan = unwrap('liveCheckPlan', core.liveCheckPlan(config, [url.pathname]));
  const live = [];
  for (const req of plan) live.push(await observe(io, req));
  const report = unwrap('audit', core.audit({
    config,
    pages: [{ route: url.pathname, html: html.body, markdown: md.status === 200 ? md.body : '' }],
    robots: robots.status === 200 ? robots.body : '',
    headers: '',
    ...(llms.status === 200 ? { llms: llms.body } : {}),
    sitemap: sitemap.status === 200 ? sitemap.body : '',
    live,
  }));
  return report;
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
