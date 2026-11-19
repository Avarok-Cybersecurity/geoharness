import { describe, expect, it } from 'vitest';
import { wranglerFailure } from '../src/lib/wrangler-error.js';
import { runAll } from '../src/stages/index.js';
import { harness, wranglerCalls } from './helpers/harness.js';

/** What wrangler 4 prints to stderr when the custom domain cannot be bound (seen on thomaspbraun.com). */
const DNS_CONFLICT = [
  '',
  '✘ [ERROR] A request to the Cloudflare API (token s3cr3t-token) (/accounts/0123/workers/scripts/geo-site/domains/records) failed.',
  '',
  "  Hostname 'geo.example.com' already has externally managed DNS records (A, CNAME, etc). Either delete them, try a different hostname, or use the option 'override_existing_dns_record' to override. [code: 100117]",
  '  ',
  '  If you think this is a bug, please open an issue at: https://github.com/cloudflare/workers-sdk/issues/new/choose',
  '',
].join('\n');

describe('wranglerFailure', () => {
  it('keeps the error block and Cloudflare\'s code, not just the exit code', () => {
    const msg = wranglerFailure('deploy', { code: 1, stdout: 'Uploaded geo-site (3.1 sec)\n', stderr: DNS_CONFLICT }, ['s3cr3t-token']);
    expect(msg).toContain('wrangler deploy exited with 1');
    expect(msg).toContain('A request to the Cloudflare API (token ***) (/accounts/0123/workers/scripts/geo-site/domains/records) failed.');
    expect(msg).not.toContain('s3cr3t');
    expect(msg).toContain("Hostname 'geo.example.com' already has externally managed DNS records");
    expect(msg).toContain('Cloudflare error 100117');
    expect(msg).toContain('takeover-dns');
    expect(msg).not.toContain('If you think this is a bug');
  });

  it('says so when wrangler printed no error block', () => {
    expect(wranglerFailure('deploy', { code: 2, stdout: 'x', stderr: '' }, [])).toBe('wrangler deploy exited with 2 (no [ERROR] line in its output)');
  });
});

describe('a failed wrangler deploy', () => {
  it('fails the run with wrangler\'s own error, not only its exit code', async () => {
    const h = await harness({ onProc: (c) => Promise.resolve(c.args.includes('deploy') ? { code: 1, stdout: '', stderr: DNS_CONFLICT } : undefined) });
    await expect(runAll(h.ctx)).rejects.toThrow(/wrangler deploy exited with 1:[\s\S]*externally managed DNS records[\s\S]*Cloudflare error 100117/);
    expect(wranglerCalls(h).filter((c) => c.args.includes('deploy'))).toHaveLength(1);
  });
});
