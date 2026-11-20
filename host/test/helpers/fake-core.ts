// FAKE CORE — justified: the orchestration tests need to dictate the score and a blocking failure to
// prove the gates stop the run, which the real core decides from content. It obeys
// docs/architecture/contract.md (twin paths, tagged rewrite rules, build meta, IndexNow key file) with
// trivial content. The real wasm runs in core-contract.test.ts and real-core-run.test.ts.
import type { Core } from '../../src/core/core.js';
import type { AuditReport, Certificate, LiveObservation, OutFile, SiteConfig } from '../../src/core/types-index.js';

export function sampleConfig(origin: string): SiteConfig {
  return {
    site: { origin, name: 'Fixture', language: 'en' },
    identity: { kind: 'organization', name: 'Fixture', url: origin, sameAs: [] },
    contentSignal: { search: true, aiInput: true, aiTrain: false },
    bots: [{ tokens: ['GPTBot'], allow: ['/'], disallow: [], group: 'training' }],
    content: { mainSelector: 'main', exclude: [], sources: {} },
    llms: { summary: 'Fixture site', sections: [{ title: 'Docs', routes: ['/about/'] }] },
    env: [],
    headers: { immutable: [] },
    certificates: [],
  };
}

export const twinFile = (file: string): string => file.replace(/\.html$/, '.md');
export const FAKE_INDEXNOW_KEY = '0123456789abcdef0123456789abcdef';

/** certificates: what parseConfig returns as [[certificates]] (absent: none, like a config without the table). */
export interface FakeCoreOptions { score: number; blockingFails: boolean; certificates?: Certificate[] }

export function fakeCore(opts: FakeCoreOptions): Core & { calls: string[] } {
  const calls: string[] = [];
  const report = (live: LiveObservation[] | undefined): AuditReport => {
    const botBlocked = (live ?? []).some((o) => o.userAgent !== 'browser' && o.status !== 200);
    return {
      score: opts.score,
      categories: [{ id: 'access', title: 'AI access', weight: 100, score: opts.score }],
      findings: [{
        checkId: 'access.ai-bots-200', title: 'AI crawlers get HTTP 200', severity: 'blocking',
        passed: !opts.blockingFails && !botBlocked, evidence: botBlocked ? 'a bot got non-200' : 'ok', citations: ['cf-bot-fight-mode'],
      }],
    };
  };
  return {
    calls,
    parseConfig(toml) {
      calls.push('parseConfig');
      const origin = /origin\s*=\s*"([^"]+)"/.exec(toml)?.[1];
      return origin === undefined
        ? { ok: false, errors: [{ code: 'config.missing', message: 'site.origin is required', path: 'site.origin' }] }
        : { ok: true, value: { ...sampleConfig(origin), certificates: opts.certificates ?? [] } };
    },
    processSite(input) {
      calls.push('processSite');
      const files: OutFile[] = [];
      const urls: string[] = [];
      for (const p of input.pages) {
        files.push({ file: p.file, contents: p.html.replace('<head>', `<head><meta name="build" content="${input.buildId}">`) });
        files.push({ file: twinFile(p.file), contents: `---\ntitle: ${p.route}\n---\n${p.markdown ?? p.route}\n` });
        urls.push(`<url><loc>${input.config.site.origin}${p.route}</loc>${p.lastmod === undefined ? '' : `<lastmod>${p.lastmod}</lastmod>`}</url>`);
      }
      files.push({ file: 'robots.txt', contents: 'User-agent: *\nAllow: /\n' });
      files.push({ file: 'llms.txt', contents: '# Fixture\n' });
      files.push({ file: 'sitemap.xml', contents: `<urlset>${urls.join('')}</urlset>` });
      files.push({ file: '_headers', contents: `${input.existing.headers ?? ''}/*\n  Vary: Accept\n` });
      files.push({ file: `${FAKE_INDEXNOW_KEY}.txt`, contents: FAKE_INDEXNOW_KEY });
      const guard = (host: string): string => `http.host eq "${host}" and any(http.request.headers["accept"][*] contains "text/markdown")`;
      return {
        ok: true,
        value: {
          files,
          rewriteRules: input.hosts.flatMap((host) => ['dir', 'bare', 'html'].map((kind) => ({
            description: `geoharness:${host} ${kind}`, expression: `(${guard(host)} and ${kind})`, pathExpression: `concat(http.request.uri.path, "${kind}")`,
          }))),
          pages: input.pages.map((p) => ({ route: p.route, markdownFile: twinFile(p.file), title: p.route, description: '', tokens: 7 })),
          excludedRoutes: [],
          warnings: [],
        },
      };
    },
    audit(input) {
      calls.push(input.live === undefined ? 'audit' : 'audit-live');
      return { ok: true, value: report(input.live) };
    },
    liveCheckPlan(input) {
      calls.push('liveCheckPlan');
      const { config, routes } = input;
      if (config === undefined) return { ok: false, errors: [{ code: 'input.invalid', message: 'fake core needs config' }] };
      return {
        ok: true,
        value: [
          ...routes.map((r) => ({ url: `${config.site.origin}${r}`, userAgent: 'browser', accept: 'text/html', expect: { status: 200 } })),
          { url: `${config.site.origin}/`, userAgent: 'GPTBot', accept: 'text/markdown, text/html, */*', expect: { status: 200 } },
        ],
      };
    },
    auditLive(input) {
      calls.push('auditLive');
      return { ok: true, value: report(input.live) };
    },
    ragInputs() {
      return { ok: false, errors: [{ code: 'unimplemented', message: 'not used by the host yet' }] };
    },
  };
}
