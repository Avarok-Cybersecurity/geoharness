import { describe, expect, it } from 'vitest';
import { InputError, readInputs } from '../src/inputs.js';
import { parseOptimizations } from '../src/lib/optimizations.js';
import { ACCOUNT, SHA } from './helpers/context.js';

/** Exactly what action.yml forwards, with its declared defaults. */
const BASE: Record<string, string> = {
  INPUT_CLOUDFLARE_API_TOKEN: 't', INPUT_CLOUDFLARE_ACCOUNT_ID: ACCOUNT, INPUT_SITE_PATH: 'site', INPUT_ADAPTER: 'auto',
  INPUT_TARGET: 'workers', INPUT_PROJECT_NAME: 'geo-site', INPUT_DOMAINS: 'geo.example.com\nwww.example.com\n',
  INPUT_LIGHTHOUSE: 'true', INPUT_LIGHTHOUSE_MAX_URLS: '5', INPUT_GEO_MIN_SCORE: '80', INPUT_EXTRA_OPTIMIZATIONS: 'all -rocket_loader',
  INPUT_DEPLOY: 'true', INPUT_ROLLBACK_ON_FAILURE: 'true', INPUT_RAG: 'false', GITHUB_WORKSPACE: '/w', GITHUB_SHA: SHA, GEOHARNESS_STATE_DIR: '/tmp/gh',
  GITHUB_STEP_SUMMARY: '/tmp/gh/summary.md', GITHUB_OUTPUT: '/tmp/gh/output.txt',
};
const read = (over: Record<string, string>) => readInputs({ get: (n) => ({ ...BASE, ...over })[n] });

describe('inputs', () => {
  it('parses a complete set', () => {
    const i = read({});
    expect(i.sitePath).toBe('/w/site');
    expect(i.domains).toEqual(['geo.example.com', 'www.example.com']);
    expect(i.lighthouseMaxUrls).toBe(5);
    expect(i.optimizations.has('rocket_loader')).toBe(false);
    expect(i.optimizations.has('zstd')).toBe(true);
  });

  it('validates required inputs because composite actions do not, listing every problem at once', () => {
    const err = (() => { try { read({ INPUT_CLOUDFLARE_API_TOKEN: '', INPUT_DOMAINS: '', INPUT_PROJECT_NAME: 'Bad_Name' }); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).problems).toEqual(expect.arrayContaining([
      'cloudflare-api-token is required', 'domains is required (newline-separated host names)', expect.stringContaining('project-name'),
    ]));
  });

  it('a dry run (deploy: false) needs no Cloudflare credentials; a deploy does', () => {
    const dry = read({ INPUT_DEPLOY: 'false', INPUT_CLOUDFLARE_API_TOKEN: '', INPUT_CLOUDFLARE_ACCOUNT_ID: '' });
    expect(dry.deploy).toBe(false);
    expect(dry.apiToken).toBe('');
    expect(() => read({ INPUT_CLOUDFLARE_ACCOUNT_ID: '' })).toThrow(/cloudflare-account-id is required/);
    expect(() => read({ INPUT_DEPLOY: 'maybe' })).toThrow(/deploy must be "true" or "false"/);
  });

  it('rollback-on-failure has no default: required when deploying, irrelevant in a dry run', () => {
    expect(read({}).rollbackOnFailure).toBe(true);
    expect(read({ INPUT_ROLLBACK_ON_FAILURE: 'false' }).rollbackOnFailure).toBe(false);
    expect(() => read({ INPUT_ROLLBACK_ON_FAILURE: '' })).toThrow(/rollback-on-failure is required/);
    expect(() => read({ INPUT_ROLLBACK_ON_FAILURE: 'yes' })).toThrow(/rollback-on-failure must be "true" or "false"/);
    expect(read({ INPUT_DEPLOY: 'false', INPUT_ROLLBACK_ON_FAILURE: '' }).rollbackOnFailure).toBe(false);
  });

  it('needs the step summary and output files up front, so a local run fails in preflight rather than at the end', () => {
    const err = (() => { try { read({ GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: '' }); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/^GITHUB_STEP_SUMMARY is not set/), expect.stringMatching(/^GITHUB_OUTPUT is not set/),
    ]));
    const i = read({});
    expect([i.summaryFile, i.outputFile]).toEqual(['/tmp/gh/summary.md', '/tmp/gh/output.txt']);
  });

  it('takeover-dns is optional, strictly boolean, and only for the workers target', () => {
    expect(read({}).takeoverDns).toBeUndefined();
    expect(read({ INPUT_TAKEOVER_DNS: 'true' }).takeoverDns).toBe(true);
    expect(read({ INPUT_TAKEOVER_DNS: 'false' }).takeoverDns).toBe(false);
    expect(() => read({ INPUT_TAKEOVER_DNS: 'yes' })).toThrow(/takeover-dns must be "true" or "false"/);
    expect(() => read({ INPUT_TARGET: 'pages', INPUT_TAKEOVER_DNS: 'false' })).toThrow(/takeover-dns applies only to target workers/);
  });

  it('rejects unimplemented rag instead of ignoring it', () => {
    expect(() => read({ INPUT_RAG: 'true' })).toThrow(/rag is coming in v1.1/);
  });

  it('requires lighthouse-max-urls only when lighthouse runs', () => {
    expect(() => read({ INPUT_LIGHTHOUSE_MAX_URLS: '' })).toThrow(/lighthouse-max-urls is required/);
    expect(read({ INPUT_LIGHTHOUSE: 'false', INPUT_LIGHTHOUSE_MAX_URLS: '' }).lighthouse).toBe(false);
  });

  it('rejects bad values', () => {
    expect(() => read({ INPUT_TARGET: 'vercel' })).toThrow(/target must be/);
    expect(() => read({ INPUT_ADAPTER: 'hugo' })).toThrow(/adapter must be/);
    expect(() => read({ INPUT_DOMAINS: 'https://x.com/' })).toThrow(/not a host name/);
    expect(() => read({ INPUT_GEO_MIN_SCORE: '101' })).toThrow(/geo-min-score must be/);
    expect(() => read({ INPUT_LIGHTHOUSE: 'yes' })).toThrow(/lighthouse must be/);
    expect(() => read({ GITHUB_SHA: 'main' })).toThrow(/GITHUB_SHA/);
  });
});

describe('extra-optimizations', () => {
  it('applies tokens left to right', () => {
    const r = parseOptimizations('none early_hints, http3 -http3');
    expect(r.ok && [...r.value]).toEqual(['early_hints']);
  });
  it('rejects unknown ids and empty values', () => {
    const bad = parseOptimizations('all -turbo');
    expect(!bad.ok && bad.error).toContain('unknown id "turbo"');
    expect(parseOptimizations('  ').ok).toBe(false);
  });
});
