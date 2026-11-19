import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditUrl, formatReport } from './cli-audit.js';
import { parseAuditArgs } from './lib/audit-args.js';
import { CoreFailure } from './core/core.js';
import { loadWasmCore } from './core/wasm.js';
import { InputError, readInputs } from './inputs.js';
import { CfClient } from './io/cloudflare/client.js';
import { nodeHostIO } from './io/node/index.js';
import type { StageContext } from './stages/context.js';
import { STAGE_ORDER, isStageName, runAll, runStage } from './stages/index.js';
import { loadState } from './stages/state.js';

export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const CLOUDFLARE_TIMEOUT_MS = 30_000;
const USAGE = `usage:
  geoharness run                 all stages in order (${STAGE_ORDER.join(', ')})
  geoharness <stage>             one stage; state carries over in $GEOHARNESS_STATE_DIR
  geoharness audit <url> [--config geoharness.toml --build-id <sha>] [--build-id <sha>]
                                 live audit of any URL (config-less unless --config)`;

/** Layout of the shipped action: dist/cli.mjs, dist/core/geoharness_wasm.js, edge/negotiate.mjs. */
const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_MODULE = join(HERE, 'core', 'geoharness_wasm.js');
const NEGOTIATE_MODULE = join(HERE, '..', 'edge', 'negotiate.mjs');

async function main(argv: string[]): Promise<number> {
  const io = nodeHostIO();
  const [command, ...rest] = argv;
  if (command === undefined || command === '--help' || command === '-h') {
    io.log.info(USAGE);
    return command === undefined ? 2 : 0;
  }
  const core = loadWasmCore(CORE_MODULE);
  if (command === 'audit') {
    const parsed = parseAuditArgs(rest);
    if (parsed === undefined) {
      io.log.error(USAGE);
      return 2;
    }
    const configToml = parsed.config === undefined ? undefined : await io.fs.readText(parsed.config);
    const report = await auditUrl(io, core, {
      target: parsed.target,
      ...(configToml === undefined ? {} : { configToml }),
      ...(parsed.buildId === undefined ? {} : { buildId: parsed.buildId }),
    });
    io.log.info(formatReport(parsed.target, report));
    return 0;
  }
  if (command !== 'run' && !isStageName(command)) {
    io.log.error(`unknown command ${command}\n${USAGE}`);
    return 2;
  }
  const inputs = readInputs(io.env);
  const cf = new CfClient({ http: io.http, token: inputs.apiToken, baseUrl: CLOUDFLARE_API, timeoutMs: CLOUDFLARE_TIMEOUT_MS });
  const state = command === 'run' ? {} : await loadState(io.fs, inputs.stateDir);
  const ctx: StageContext = { io, core, inputs, cf, state, negotiateModule: NEGOTIATE_MODULE };
  if (command === 'run') await runAll(ctx);
  else await runStage(ctx, command);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (e: unknown) => {
    const message = e instanceof InputError || e instanceof CoreFailure || e instanceof Error ? e.message : String(e);
    process.stdout.write(`::error::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}\n`);
    process.exitCode = 1;
  },
);
