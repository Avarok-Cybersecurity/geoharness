import { describe, expect, it } from 'vitest';
import {
  DAY_MS, certificateRenewalProblem, daysLeft, inspectPair, issuedInsideWindow, liveStillServes, renewalDecision, servedProblem,
  type LivePair, type RenewReason,
} from '../src/lib/certificates.js';
import { selfSigned } from './helpers/certs.js';

const NOW = Date.UTC(2026, 10, 20);
const usable = (daysFromNow: number): LivePair => ({ usable: true, notAfterMs: NOW + daysFromNow * DAY_MS, fingerprint: 'AA' });
const decide = (live: LivePair, over: { mode?: 'auto' | 'force'; dryRun?: boolean } = {}): ReturnType<typeof renewalDecision> =>
  renewalDecision({ live, nowMs: NOW, windowDays: 30, mode: over.mode ?? 'auto', dryRun: over.dryRun ?? false });

describe('renewalDecision', () => {
  it('keeps a certificate with more than the window left', () => {
    expect(decide(usable(31))).toEqual({ action: 'keep', daysLeft: 31 });
    expect(decide({ usable: true, notAfterMs: NOW + 30 * DAY_MS + 1, fingerprint: 'AA' })).toEqual({ action: 'keep', daysLeft: 30 });
  });
  it('renews at exactly the window (notAfter − now ≤ window)', () => {
    expect(decide(usable(30))).toEqual({ action: 'renew', reason: 'window' });
    expect(decide(usable(1))).toEqual({ action: 'renew', reason: 'window' });
  });
  it('renews an expired certificate, and says so', () => {
    expect(decide(usable(0))).toEqual({ action: 'renew', reason: 'expired' });
    expect(decide(usable(-5))).toEqual({ action: 'renew', reason: 'expired' });
    expect(decide(usable(-5), { mode: 'force' })).toEqual({ action: 'renew', reason: 'expired' });
  });
  it('renews a missing or unusable live pair', () => {
    for (const reason of ['missing', 'unparsable', 'wrong-subject', 'key-mismatch'] as const) {
      expect(decide({ usable: false, reason, detail: 'x' })).toEqual({ action: 'renew', reason });
    }
  });
  it('force renews a valid certificate', () => {
    expect(decide(usable(80), { mode: 'force' })).toEqual({ action: 'renew', reason: 'force' });
  });
  it('a dry run never issues: a reason to renew becomes blocked-dry-run', () => {
    expect(decide(usable(10), { dryRun: true })).toEqual({ action: 'blocked-dry-run', reason: 'window' });
    expect(decide({ usable: false, reason: 'missing', detail: 'x' }, { dryRun: true })).toEqual({ action: 'blocked-dry-run', reason: 'missing' });
    expect(decide(usable(80), { dryRun: true, mode: 'force' })).toEqual({ action: 'blocked-dry-run', reason: 'force' });
    expect(decide(usable(80), { dryRun: true })).toEqual({ action: 'keep', daysLeft: 80 });
  });
  it('days left are whole days, rounded down', () => {
    expect(daysLeft(NOW + 30 * DAY_MS - 1, NOW)).toBe(29);
    expect(daysLeft(NOW - 1, NOW)).toBe(-1);
  });
});

describe('liveStillServes', () => {
  it('only a valid live pair may ship after a failed renewal', () => {
    const ok: RenewReason[] = ['window', 'force'];
    const bad: RenewReason[] = ['expired', 'missing', 'unparsable', 'wrong-subject', 'key-mismatch'];
    for (const r of ok) expect(liveStillServes(r)).toBe(true);
    for (const r of bad) expect(liveStillServes(r)).toBe(false);
  });
});

describe('inspectPair', () => {
  it('accepts a matching pair for its one name', () => {
    const pair = selfSigned('local.example.com', 60);
    const got = inspectPair(pair, 'local.example.com');
    expect(got.usable).toBe(true);
    if (got.usable) expect(got.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });
  it('a key that does not belong to the certificate is key-mismatch', () => {
    const pair = { pem: selfSigned('local.example.com', 60).pem, key: selfSigned('local.example.com', 60).key };
    expect(inspectPair(pair, 'local.example.com')).toMatchObject({ usable: false, reason: 'key-mismatch' });
  });
  it('another name is wrong-subject', () => {
    expect(inspectPair(selfSigned('other.example.com', 60), 'local.example.com')).toMatchObject({ usable: false, reason: 'wrong-subject' });
  });
  it('no pair is missing; garbage is unparsable', () => {
    expect(inspectPair(undefined, 'a.example.com')).toMatchObject({ usable: false, reason: 'missing' });
    expect(inspectPair({ pem: '<!doctype html>', key: 'x' }, 'a.example.com')).toMatchObject({ usable: false, reason: 'unparsable' });
    const pair = selfSigned('a.example.com', 60);
    expect(inspectPair({ pem: pair.pem, key: 'not a key' }, 'a.example.com')).toMatchObject({ usable: false, reason: 'unparsable' });
  });
});

describe('servedProblem', () => {
  const outcome = { fingerprint: 'AA', windowDays: 30, action: 'renewed' as const };
  it('passes the deployed certificate with more than the window left', () => {
    expect(servedProblem(outcome, usable(31), NOW)).toBeUndefined();
  });
  it('fails another certificate, an unusable one, or one inside the window', () => {
    expect(servedProblem(outcome, { usable: true, notAfterMs: NOW + 80 * DAY_MS, fingerprint: 'BB' }, NOW)).toMatch(/serves BB, deployed AA/);
    expect(servedProblem(outcome, { usable: false, reason: 'missing', detail: 'HTTP 404' }, NOW)).toMatch(/missing/);
    expect(servedProblem(outcome, usable(30), NOW)).toMatch(/30 days left/);
  });
  it('after a failed renewal the kept pair only has to be unexpired', () => {
    const kept = { ...outcome, action: 'renewal-failed-kept-old' as const };
    expect(servedProblem(kept, usable(5), NOW)).toBeUndefined();
    expect(servedProblem(kept, usable(0), NOW)).toMatch(/0 days left/);
  });
});

describe('certificate-renewal input against the config', () => {
  it('is required with certificates and an error without them', () => {
    expect(certificateRenewalProblem(1, undefined)).toMatch(/certificate-renewal is required/);
    expect(certificateRenewalProblem(0, 'auto')).toMatch(/no \[\[certificates\]\]/);
    expect(certificateRenewalProblem(1, 'force')).toBeUndefined();
    expect(certificateRenewalProblem(0, undefined)).toBeUndefined();
  });
});

describe('issuedInsideWindow', () => {
  it('accepts a fresh certificate with more than the window left, and names one with the window or less', () => {
    const now = 1_800_000_000_000;
    expect(issuedInsideWindow(now + 30 * DAY_MS + 1, now, 30)).toBeUndefined();
    expect(issuedInsideWindow(now + 30 * DAY_MS, now, 30)).toMatch(/valid for 30 days, which is inside renewWithinDays \(30\)/);
  });
});
