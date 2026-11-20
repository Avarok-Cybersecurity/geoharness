import { join } from 'node:path';
import type { Certificate } from '../core/types-index.js';
import type { HostIO } from '../io/types.js';
import {
  daysLeft, inspectPair, issuedInsideWindow, liveStillServes, renewalDecision,
  type CertificateOutcome, type LivePair, type PairText, type RenewalMode, type RenewReason,
} from '../lib/certificates.js';
import { describeError } from '../lib/errors.js';
import { need, type StageContext } from './context.js';
import { issueWithLego } from './lego.js';
import { getWithRetry } from './live.js';

const pairFiles = (path: string): { pem: string; key: string } => ({ pem: `${path}.pem`, key: `${path}.key` });

/** The pair the site serves now: undefined when either file is 404; any other status or a failed request throws. */
export async function fetchLivePair(io: HostIO, origin: string, path: string): Promise<PairText | undefined> {
  const out: Partial<PairText> = {};
  for (const [kind, file] of Object.entries(pairFiles(path)) as ['pem' | 'key', string][]) {
    const url = `${origin}/${file}`;
    const res = await getWithRetry(io, url, { accept: '*/*' }, 'certificate');
    if (res.status === 404) return undefined;
    if (res.status !== 200) throw new Error(`GET ${url}: HTTP ${res.status} (expected 200, or 404 when the site serves no certificate yet)`);
    out[kind] = res.body;
  }
  return out.pem === undefined || out.key === undefined ? undefined : { pem: out.pem, key: out.key };
}

async function writePair(ctx: StageContext, outputDir: string, path: string, pair: PairText): Promise<void> {
  const files = pairFiles(path);
  await ctx.io.fs.writeText(join(outputDir, files.pem), pair.pem);
  await ctx.io.fs.writeText(join(outputDir, files.key), pair.key);
}

function outcome(cert: Certificate, action: CertificateOutcome['action'], reason: RenewReason | undefined, shipped: LivePair | undefined, nowMs: number, detail: string): CertificateOutcome {
  const ok = shipped?.usable === true ? shipped : undefined;
  return {
    domain: cert.domain, path: cert.path, windowDays: cert.renewWithinDays, action, reason, detail,
    notAfter: ok === undefined ? undefined : new Date(ok.notAfterMs).toISOString(),
    daysLeft: ok === undefined ? undefined : daysLeft(ok.notAfterMs, nowMs),
    fingerprint: ok?.fingerprint,
  };
}

async function renew(ctx: StageContext, cert: Certificate, outputDir: string, live: { pair: PairText | undefined; state: LivePair }, reason: RenewReason): Promise<CertificateOutcome> {
  const nowMs = ctx.io.clock.nowMs();
  let issued: PairText;
  let fresh: Extract<LivePair, { usable: true }>;
  try {
    issued = await issueWithLego(ctx, cert);
    const state = inspectPair(issued, cert.domain);
    if (!state.usable) throw new Error(`lego returned an unusable pair (${state.reason}: ${state.detail})`);
    if (state.notAfterMs <= nowMs) throw new Error('lego returned an expired certificate');
    fresh = state;
  } catch (e) {
    const why = describeError(e);
    if (!liveStillServes(reason) || live.pair === undefined || !live.state.usable) {
      const state = live.state.usable ? `expired ${new Date(live.state.notAfterMs).toISOString()}` : `${live.state.reason}: ${live.state.detail}`;
      throw new Error(`certificate ${cert.domain}: the live pair is unusable (${state}) and renewal failed: ${why}`, { cause: e });
    }
    // Still valid: a failed renewal must not take a working site down. Ship the live pair and say so loudly.
    ctx.io.log.warn(`certificate ${cert.domain}: renewal (${reason}) failed; the live certificate (${daysLeft(live.state.notAfterMs, nowMs)} days left) ships unchanged: ${why}`);
    await writePair(ctx, outputDir, cert.path, live.pair);
    return outcome(cert, 'renewal-failed-kept-old', reason, live.state, nowMs, `renewal failed: ${why}`);
  }
  // Outside the try: a configuration error, not a failed renewal to fall back from.
  const tooShort = issuedInsideWindow(fresh.notAfterMs, nowMs, cert.renewWithinDays);
  if (tooShort !== undefined) throw new Error(`certificate ${cert.domain}: ${tooShort}`);
  await writePair(ctx, outputDir, cert.path, issued);
  ctx.io.log.info(`certificate ${cert.domain}: renewed (${reason}), valid until ${new Date(fresh.notAfterMs).toISOString()}`);
  return outcome(cert, 'renewed', reason, fresh, nowMs, `renewed (${reason})`);
}

async function oneCertificate(ctx: StageContext, cert: Certificate, outputDir: string, mode: RenewalMode, origin: string): Promise<CertificateOutcome> {
  const { io } = ctx;
  for (const file of Object.values(pairFiles(cert.path))) {
    if (await io.fs.exists(join(outputDir, file))) {
      throw new Error(`the build output already has ${file}; [[certificates]] path "${cert.path}" is owned by GeoHarness — remove the file from the build`);
    }
  }
  const pair = await fetchLivePair(io, origin, cert.path);
  const state = inspectPair(pair, cert.domain);
  const nowMs = io.clock.nowMs();
  const decision = renewalDecision({ live: state, nowMs, windowDays: cert.renewWithinDays, mode, dryRun: !ctx.inputs.deploy });
  if (decision.action === 'keep') {
    if (pair === undefined) throw new Error('unreachable: keep without a live pair');
    await writePair(ctx, outputDir, cert.path, pair);
    io.log.info(`certificate ${cert.domain}: kept, ${decision.daysLeft} days left (renews within ${cert.renewWithinDays})`);
    return outcome(cert, 'kept', undefined, state, nowMs, `${decision.daysLeft} days left`);
  }
  if (decision.action === 'blocked-dry-run') {
    // A dry run never issues (no token, no rate limits); the preview tree still carries what production serves.
    if (pair !== undefined) await writePair(ctx, outputDir, cert.path, pair);
    io.log.warn(`certificate ${cert.domain}: would renew (${decision.reason}) on deploy; dry run ships ${pair === undefined ? 'no pair' : 'the live pair'}`);
    return outcome(cert, 'would-renew', decision.reason, state, nowMs, state.usable ? `would renew (${decision.reason})` : `would renew (${decision.reason}: ${state.detail})`);
  }
  return renew(ctx, cert, outputDir, { pair, state }, decision.reason);
}

/**
 * After build, before process: puts each [[certificates]] pair into the output, so it is processed, audited and
 * deployed with the site. Without [[certificates]] it does nothing.
 */
export async function certificatesStage(ctx: StageContext): Promise<void> {
  const config = need(ctx.state, 'config', 'certificates');
  if (config.certificates.length === 0) return;
  const { outputDir } = need(ctx.state, 'build', 'certificates');
  const mode = ctx.inputs.certificateRenewal;
  if (mode === undefined) throw new Error('certificate-renewal is required when geoharness.toml has [[certificates]]');
  const outcomes: CertificateOutcome[] = [];
  ctx.state.certificates = outcomes;
  for (const cert of config.certificates) outcomes.push(await oneCertificate(ctx, cert, outputDir, mode, config.site.origin));
}
