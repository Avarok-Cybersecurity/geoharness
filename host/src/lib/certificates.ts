import { X509Certificate, createPrivateKey, type KeyObject } from 'node:crypto';

/** Pure certificate policy: what the live pair is, whether to renew it, and what a failed renewal may ship. */

export const DAY_MS = 86_400_000;

export type RenewalMode = 'auto' | 'force';
export type Unusable = 'missing' | 'unparsable' | 'wrong-subject' | 'key-mismatch';
export type RenewReason = Unusable | 'expired' | 'force' | 'window';

export interface PairText { pem: string; key: string }

export type LivePair =
  | { usable: true; notAfterMs: number; fingerprint: string }
  | { usable: false; reason: Unusable; detail: string };

export type Decision =
  | { action: 'keep'; daysLeft: number }
  | { action: 'renew'; reason: RenewReason }
  | { action: 'blocked-dry-run'; reason: RenewReason };

export type CertificateAction = 'kept' | 'renewed' | 'would-renew' | 'renewal-failed-kept-old';

/** One certificate's result, kept in the run state for verify and the summary. */
export interface CertificateOutcome {
  domain: string;
  path: string;
  windowDays: number;
  action: CertificateAction;
  reason: RenewReason | undefined;
  /** Of the pair written into the output; undefined when none was (a dry run with no live pair). */
  notAfter: string | undefined;
  daysLeft: number | undefined;
  fingerprint: string | undefined;
  detail: string;
}

export function daysLeft(notAfterMs: number, nowMs: number): number {
  return Math.floor((notAfterMs - nowMs) / DAY_MS);
}

const PEM_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/;

/** The leaf (first certificate of the chain), its one name, and whether the key is its key. */
export function inspectPair(pair: PairText | undefined, domain: string): LivePair {
  if (pair === undefined) return { usable: false, reason: 'missing', detail: 'no certificate is served' };
  const leafPem = PEM_BLOCK.exec(pair.pem)?.[0];
  let leaf: X509Certificate;
  let key: KeyObject;
  try {
    if (leafPem === undefined) throw new Error('no PEM certificate block');
    leaf = new X509Certificate(leafPem);
  } catch (e) {
    return { usable: false, reason: 'unparsable', detail: `certificate: ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    key = createPrivateKey(pair.key);
  } catch (e) {
    return { usable: false, reason: 'unparsable', detail: `private key: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (leaf.subjectAltName !== `DNS:${domain}`) {
    return { usable: false, reason: 'wrong-subject', detail: `subjectAltName is ${leaf.subjectAltName ?? 'absent'}, not DNS:${domain}` };
  }
  if (!leaf.checkPrivateKey(key)) return { usable: false, reason: 'key-mismatch', detail: 'the private key does not belong to the certificate' };
  return { usable: true, notAfterMs: leaf.validToDate.getTime(), fingerprint: leaf.fingerprint256 };
}

function reasonToRenew(live: LivePair, nowMs: number, windowDays: number, mode: RenewalMode): RenewReason | undefined {
  if (!live.usable) return live.reason;
  const left = live.notAfterMs - nowMs;
  if (left <= 0) return 'expired';
  if (mode === 'force') return 'force';
  if (left <= windowDays * DAY_MS) return 'window';
  return undefined;
}

export function renewalDecision(o: { live: LivePair; nowMs: number; windowDays: number; mode: RenewalMode; dryRun: boolean }): Decision {
  const reason = reasonToRenew(o.live, o.nowMs, o.windowDays, o.mode);
  if (reason === undefined) {
    if (!o.live.usable) throw new Error('unreachable: an unusable pair always has a reason to renew');
    return { action: 'keep', daysLeft: daysLeft(o.live.notAfterMs, o.nowMs) };
  }
  return o.dryRun ? { action: 'blocked-dry-run', reason } : { action: 'renew', reason };
}

/** After a failed renewal, the live pair may ship only when it is still valid: the site keeps working. */
export function liveStillServes(reason: RenewReason): boolean {
  return reason === 'window' || reason === 'force';
}

/**
 * The live check after deploy: the served pair is the one deployed and outlives the window. A pair kept after a
 * failed renewal is inside the window by construction (that already warned), so it only has to be unexpired.
 */
export function servedProblem(o: Pick<CertificateOutcome, 'fingerprint' | 'windowDays' | 'action'>, served: LivePair, nowMs: number): string | undefined {
  if (!served.usable) return `${served.reason}: ${served.detail}`;
  if (served.fingerprint !== o.fingerprint) return `serves ${served.fingerprint}, deployed ${o.fingerprint ?? 'nothing'}`;
  const minDays = o.action === 'renewal-failed-kept-old' ? 0 : o.windowDays;
  const left = served.notAfterMs - nowMs;
  if (left <= minDays * DAY_MS) return `${daysLeft(served.notAfterMs, nowMs)} days left, needs more than ${minDays}`;
  return undefined;
}

/** certificate-renewal is required exactly when the config has certificates (no default either way). */
export function certificateRenewalProblem(certificates: number, mode: RenewalMode | undefined): string | undefined {
  if (certificates > 0 && mode === undefined) return 'certificate-renewal is required when geoharness.toml has [[certificates]] ("auto" or "force")';
  if (certificates === 0 && mode !== undefined) return 'certificate-renewal is set but geoharness.toml has no [[certificates]]; remove the input';
  return undefined;
}
