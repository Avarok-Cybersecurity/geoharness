import { join } from 'node:path';
import type { Certificate } from '../core/types-index.js';
import type { PairText } from '../lib/certificates.js';
import { LEGO_TOKEN_ENV, checkSha256, legoArgs, legoOutputFiles } from '../lib/lego.js';
import { redactAll } from '../lib/redact.js';
import type { StageContext } from './context.js';

const DOWNLOAD_TIMEOUT_MS = 120_000;
const TAR_TIMEOUT_MS = 60_000;
/** DNS-01 waits for the TXT record to reach every authoritative server, then for Let's Encrypt to validate. */
const LEGO_TIMEOUT_MS = 10 * 60_000;
const OUTPUT_TAIL_LINES = 12;

function runnerTemp(ctx: StageContext): string {
  const dir = ctx.io.env.get('RUNNER_TEMP') ?? '';
  if (dir === '') throw new Error('RUNNER_TEMP is not set (GitHub Actions sets it); lego\'s account and the new key are kept there and deleted after');
  return dir;
}

/**
 * Issues one certificate with the pinned lego: download, check its sha256, unpack, run DNS-01 through Cloudflare
 * with the token in lego's environment only, read the pair. Everything lego writes — the binary, its ACME
 * account, the key — lives in a temp directory under RUNNER_TEMP that is removed whatever happens.
 */
export async function issueWithLego(ctx: StageContext, cert: Certificate): Promise<PairText> {
  const { io } = ctx;
  if (ctx.lego.kind === 'unsupported') throw new Error(ctx.lego.reason);
  const { url, sha256 } = ctx.lego;
  const dir = await io.fs.makeTempDir(runnerTemp(ctx), 'geoharness-lego-');
  try {
    const archive = join(dir, 'lego.tar.gz');
    const bytes = await io.http.download(url, DOWNLOAD_TIMEOUT_MS);
    checkSha256(bytes, sha256, url);
    await io.fs.writeBytes(archive, bytes);
    const untar = await io.proc.run('tar', ['-xzf', archive, '-C', dir, 'lego'], { cwd: dir, env: {}, timeoutMs: TAR_TIMEOUT_MS, redact: [], stream: false });
    if (untar.code !== 0) throw new Error(`tar could not unpack ${url} (exit ${untar.code}): ${untar.stderr.trim()}`);

    const token = ctx.inputs.apiToken;
    const dataDir = join(dir, 'data');
    const args = legoArgs(cert, dataDir);
    io.log.info(`$ lego ${args.join(' ')}`);
    const r = await io.proc.run(join(dir, 'lego'), args, {
      cwd: dir, env: { [LEGO_TOKEN_ENV]: token }, timeoutMs: LEGO_TIMEOUT_MS, redact: [token], stream: true,
    });
    if (r.code !== 0) {
      const tail = redactAll(`${r.stdout}\n${r.stderr}`, [token]).split('\n').filter((l) => l.trim() !== '').slice(-OUTPUT_TAIL_LINES);
      throw new Error(`lego exited with ${r.code}:\n${tail.map((l) => `  ${l}`).join('\n')}`);
    }
    const files = legoOutputFiles(dataDir, cert.domain);
    return { pem: await io.fs.readText(files.pem), key: await io.fs.readText(files.key) };
  } finally {
    await io.fs.remove(dir);
  }
}
