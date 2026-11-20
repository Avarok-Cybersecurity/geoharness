import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../src/lib/certificates.js';
import { ACME_DIRECTORY_URLS } from '../src/lib/lego.js';
import { certificatesStage } from '../src/stages/certificates.js';
import { selfSigned } from './helpers/certs.js';
import { sampleConfig } from './helpers/fake-core.js';
import { DOMAIN, ORIGIN, certWorld, notAfterMs } from './helpers/cert-world.js';

const live = selfSigned(DOMAIN, 60);
const fresh = selfSigned(DOMAIN, 90);
const end = notAfterMs(live.pem);
const shipped = async (dir: string): Promise<{ pem: string; key: string }> => ({
  pem: await readFile(join(dir, 'agent', 'loopback.pem'), 'utf8'), key: await readFile(join(dir, 'agent', 'loopback.key'), 'utf8'),
});

describe('certificates stage', () => {
  it('keeps a certificate outside the window, copying the exact live bytes, without lego', async () => {
    const w = await certWorld({ live, nowMs: end - 31 * DAY_MS, deploy: true, mode: 'auto', lego: { fail: 'must not run' } });
    await certificatesStage(w.ctx);
    expect(await shipped(w.outputDir)).toEqual(live);
    expect(w.proc.calls).toEqual([]);
    expect(w.ctx.state.certificates).toMatchObject([{ domain: DOMAIN, action: 'kept', daysLeft: 31 }]);
  });

  it('renews inside the window with the pinned lego; the token reaches lego only through its environment', async () => {
    const w = await certWorld({ live, nowMs: end - 30 * DAY_MS, deploy: true, mode: 'auto', lego: { issue: fresh } });
    await certificatesStage(w.ctx);
    expect(await shipped(w.outputDir)).toEqual(fresh);
    expect(w.proc.calls.map((c) => c.command.split('/').pop())).toEqual(['tar', 'lego']);
    const [lego] = w.legoCalls();
    expect(lego?.args).toEqual(expect.arrayContaining(['--accept-tos', '--server', ACME_DIRECTORY_URLS.staging, '--key-type', 'ec256', '--dns', 'cloudflare', '--domains', DOMAIN, '--email', 'ops@example.com', 'run']));
    expect(lego?.args.join(' ')).not.toContain('test-token');
    expect(lego?.options.env).toEqual({ CF_DNS_API_TOKEN: 'test-token' });
    expect(lego?.options.redact).toContain('test-token');
    expect(await readdir(w.runnerTemp)).toEqual([]);
    expect(w.ctx.state.certificates).toMatchObject([{ action: 'renewed', reason: 'window', notAfter: new Date(notAfterMs(fresh.pem)).toISOString() }]);
  });

  it('force renews a certificate with plenty left', async () => {
    const w = await certWorld({ live, nowMs: end - 59 * DAY_MS, deploy: true, mode: 'force', lego: { issue: fresh } });
    await certificatesStage(w.ctx);
    expect(w.ctx.state.certificates).toMatchObject([{ action: 'renewed', reason: 'force' }]);
  });

  it('a live key that does not match is renewed, and fails hard when renewal fails', async () => {
    const mismatched = { pem: live.pem, key: fresh.key };
    const ok = await certWorld({ live: mismatched, nowMs: end - 59 * DAY_MS, deploy: true, mode: 'auto', lego: { issue: fresh } });
    await certificatesStage(ok.ctx);
    expect(ok.ctx.state.certificates).toMatchObject([{ action: 'renewed', reason: 'key-mismatch' }]);
    const bad = await certWorld({ live: mismatched, nowMs: end - 59 * DAY_MS, deploy: true, mode: 'auto', lego: { fail: 'acme: error' } });
    await expect(certificatesStage(bad.ctx)).rejects.toThrow(/live pair is unusable \(key-mismatch: the private key does not belong/);
  });

  it('refuses a build output that already has the pair: the stage owns those files', async () => {
    const w = await certWorld({ live, nowMs: end - 31 * DAY_MS, deploy: true, mode: 'auto', lego: { fail: 'must not run' } });
    await mkdir(join(w.outputDir, 'agent'), { recursive: true });
    await writeFile(join(w.outputDir, 'agent', 'loopback.key'), 'x');
    await expect(certificatesStage(w.ctx)).rejects.toThrow(/already has agent\/loopback\.key/);
  });

  it('a failed renewal while the live certificate is valid warns and ships the live pair', async () => {
    const w = await certWorld({ live, nowMs: end - 10 * DAY_MS, deploy: true, mode: 'auto', lego: { fail: 'acme: rate limited (token test-token)' } });
    await certificatesStage(w.ctx);
    expect(await shipped(w.outputDir)).toEqual(live);
    expect(w.ctx.state.certificates).toMatchObject([{ action: 'renewal-failed-kept-old', reason: 'window', daysLeft: 10 }]);
    const log = w.ctx.io.log as unknown as { lines: string[] };
    expect(log.lines.some((l) => l.startsWith('WARN') && l.includes('renewal (window) failed') && l.includes('rate limited'))).toBe(true);
    expect(log.lines.join('\n')).not.toContain('test-token');
    expect(await readdir(w.runnerTemp)).toEqual([]);
  });

  it('a failed renewal of an expired or missing certificate fails the run', async () => {
    const expired = await certWorld({ live, nowMs: end + DAY_MS, deploy: true, mode: 'auto', lego: { fail: 'acme: error' } });
    await expect(certificatesStage(expired.ctx)).rejects.toThrow(/live pair is unusable \(expired .*\) and renewal failed: lego exited with 1/);
    const missing = await certWorld({ live: undefined, nowMs: end, deploy: true, mode: 'auto', lego: { fail: 'acme: error' } });
    await expect(certificatesStage(missing.ctx)).rejects.toThrow(/missing: no certificate is served/);
  });

  it('a download that does not match the pinned sha256 never runs', async () => {
    const w = await certWorld({ live, nowMs: end - 10 * DAY_MS, deploy: true, mode: 'auto', lego: { issue: fresh } });
    w.ctx.lego = { kind: 'asset', url: 'https://example.test/lego.tar.gz', sha256: '0'.repeat(64) };
    await certificatesStage(w.ctx);
    expect(w.proc.calls).toEqual([]);
    expect(w.ctx.state.certificates?.[0]?.detail).toMatch(/does not match the pinned 0{64}/);
  });

  it('a dry run never issues; it reports "would renew" and still ships the live pair', async () => {
    const w = await certWorld({ live, nowMs: end - 10 * DAY_MS, deploy: false, mode: 'auto', lego: { fail: 'must not run' } });
    await certificatesStage(w.ctx);
    expect(w.proc.calls).toEqual([]);
    expect(await shipped(w.outputDir)).toEqual(live);
    expect(w.ctx.state.certificates).toMatchObject([{ action: 'would-renew', reason: 'window' }]);
  });

  it('without [[certificates]] it does nothing', async () => {
    const w = await certWorld({ live, nowMs: end, deploy: true, mode: 'auto', lego: { fail: 'must not run' } });
    w.ctx.state.config = { ...sampleConfig(ORIGIN), certificates: [] };
    await certificatesStage(w.ctx);
    expect(w.ctx.state.certificates).toBeUndefined();
    expect(await readdir(w.outputDir)).toEqual([]);
  });

  it('a live status other than 200 or 404 stops the run instead of renewing', async () => {
    const w = await certWorld({ live, nowMs: end, deploy: true, mode: 'auto', lego: { issue: fresh }, liveStatus: 503 });
    await expect(certificatesStage(w.ctx)).rejects.toThrow(/HTTP 503/);
    expect(w.proc.calls).toEqual([]);
  });
});
