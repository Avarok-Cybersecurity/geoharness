import { inspectPair, servedProblem } from '../lib/certificates.js';
import { describeError } from '../lib/errors.js';
import { need, type StageContext } from './context.js';
import { fetchLivePair } from './certificates.js';

/**
 * The live check `certificates.served`: after deploy, each deployed pair is what the site serves (same SHA-256
 * fingerprint, key matching) and outlives its window. A host-side check, beside the live audit: the core audits
 * HTTP observations and has no X.509 parser, while the host already parses the pair with node:crypto.
 */
export async function servedCertificateFailures(ctx: StageContext): Promise<string[]> {
  const deployed = (ctx.state.certificates ?? []).filter((o) => o.fingerprint !== undefined);
  if (deployed.length === 0) return [];
  const { origin } = need(ctx.state, 'config', 'verify').site;
  const failures: string[] = [];
  for (const o of deployed) {
    try {
      const served = inspectPair(await fetchLivePair(ctx.io, origin, o.path), o.domain);
      const problem = servedProblem(o, served, ctx.io.clock.nowMs());
      if (problem !== undefined) failures.push(`certificates.served ${origin}/${o.path}.pem (${o.domain}): ${problem}`);
    } catch (e) {
      failures.push(`certificates.served ${origin}/${o.path}.pem (${o.domain}): ${describeError(e)}`);
    }
  }
  return failures;
}
