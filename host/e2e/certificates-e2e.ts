// End-to-end for the certificates stage (run by .github/workflows/certificates-e2e.yml, never by `npm test`):
// the shipped core parses a [[certificates]] entry, then the real stage — real HTTP, the pinned lego downloaded and
// checked, real Cloudflare DNS-01 — issues a Let's Encrypt STAGING certificate into an output directory. The
// workflow then checks the pair with openssl and that lego removed its _acme-challenge TXT record.
//
// usage: node e2e.mjs <dist/core/geoharness_wasm.js> <output dir>
// env:   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GITHUB_RUN_ID, RUNNER_TEMP
import { unwrap } from '../src/core/core.js';
import { loadWasmCore } from '../src/core/wasm.js';
import type { Inputs } from '../src/inputs.js';
import { CfClient } from '../src/io/cloudflare/client.js';
import { nodeHostIO } from '../src/io/node/index.js';
import { legoSourceFor } from '../src/lib/lego.js';
import { certificatesStage } from '../src/stages/certificates.js';
import type { StageContext } from '../src/stages/context.js';

const DOMAIN = 'local-e2e.geo.avarok.net';
const ORIGIN = 'https://geo.avarok.net';

function required(name: string): string {
  const v = process.env[name] ?? '';
  if (v === '') throw new Error(`${name} is not set`);
  return v;
}

async function main(): Promise<void> {
  const [coreModule, outputDir] = process.argv.slice(2);
  if (coreModule === undefined || outputDir === undefined) throw new Error('usage: e2e.mjs <core module> <output dir>');
  const io = nodeHostIO();
  const core = loadWasmCore(coreModule);
  // A path the site does not serve, so the live pair is missing and the stage must issue.
  const path = `e2e/certificates-${required('GITHUB_RUN_ID')}`;
  const toml = `[site]\norigin = "${ORIGIN}"\nname = "GeoHarness e2e"\nlanguage = "en"\n\n[identity]\nkind = "organization"\nname = "Avarok"\nurl = "${ORIGIN}/"\n\n` +
    '[contentSignal]\nsearch = true\naiInput = true\naiTrain = false\n\n[[bots]]\ngroup = "search"\ntokens = ["OAI-SearchBot"]\nallow = ["/"]\n\n' +
    '[content]\nmainSelector = "main"\n\n[llms]\nsummary = "e2e"\nsections = []\n\n' +
    `[[certificates]]\ndomain = "${DOMAIN}"\npath = "${path}"\nrenewWithinDays = 30\nkeyType = "ec-256"\nacmeDirectory = "staging"\nacmeEmail = "security@avarok.net"\n`;
  const config = unwrap('parseConfig', core.parseConfig(toml));

  const apiToken = required('CLOUDFLARE_API_TOKEN');
  const inputs: Inputs = {
    apiToken, accountId: required('CLOUDFLARE_ACCOUNT_ID'), workspace: outputDir, sitePath: outputDir, adapter: 'static',
    buildCommand: undefined, outputDir, target: 'workers', projectName: 'geoharness-e2e', domains: ['geo.avarok.net'],
    lighthouse: false, lighthouseMaxUrls: undefined, geoMinScore: 0, optimizations: new Set(), deploy: true,
    rollbackOnFailure: false, takeoverDns: undefined, certificateRenewal: 'auto', buildId: '0'.repeat(40),
    stateDir: outputDir, summaryFile: '/dev/null', outputFile: '/dev/null',
  };
  const cf = new CfClient({ http: io.http, token: apiToken, baseUrl: 'https://api.cloudflare.com/client/v4', timeoutMs: 30_000 });
  const ctx: StageContext = {
    io, core, inputs, cf, negotiateModule: '', lego: legoSourceFor(process.platform, process.arch),
    state: { config, build: { outputDir, notFoundHandling: '404-page' } },
  };
  await certificatesStage(ctx);
  const [outcome] = ctx.state.certificates ?? [];
  if (outcome?.action !== 'renewed' || outcome.reason !== 'missing') throw new Error(`expected a renewal of a missing pair, got ${JSON.stringify(outcome)}`);
  io.log.info(`issued ${outcome.domain}: notAfter ${outcome.notAfter ?? '?'}, sha256 ${outcome.fingerprint ?? '?'}`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
