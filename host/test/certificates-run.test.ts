// The whole run with [[certificates]]: the pair goes into the deployed tree, and verify's certificates.served
// check fails (and rolls back) when the site does not serve the certificate that was deployed.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAll } from '../src/stages/index.js';
import { selfSigned } from './helpers/certs.js';
import { CERT, DOMAIN } from './helpers/cert-world.js';
import { CF_WITH_VERSION, harness, wranglerCalls } from './helpers/harness.js';
import { tempDir } from './helpers/world.js';

const live = selfSigned(DOMAIN, 60);

async function servedBefore(): Promise<string> {
  const dir = await tempDir('gh-live-');
  await mkdir(join(dir, 'agent'), { recursive: true });
  await writeFile(join(dir, 'agent', 'loopback.pem'), live.pem);
  await writeFile(join(dir, 'agent', 'loopback.key'), live.key);
  return dir;
}

describe('geoharness run with [[certificates]]', () => {
  it('deploys the live pair and verifies that it is served', async () => {
    const h = await harness({ cfState: CF_WITH_VERSION, inputs: { certificateRenewal: 'auto' }, core: { score: 90, blockingFails: false, certificates: [CERT] } });
    h.w.outputDir = await servedBefore();
    await runAll(h.ctx);
    expect(await readFile(join(h.ctx.inputs.sitePath, 'public', 'agent', 'loopback.pem'), 'utf8')).toBe(live.pem);
    expect(wranglerCalls(h).filter((c) => c.args.includes('rollback'))).toEqual([]);
    expect(await readFile(h.summary, 'utf8')).toMatch(/### Certificates[\s\S]*\| local\.example\.com \| .* \| kept \|/);
  });

  it('rolls back when the site serves another certificate than the deployed one', async () => {
    const other = selfSigned(DOMAIN, 60);
    const h = await harness({
      cfState: CF_WITH_VERSION, inputs: { certificateRenewal: 'auto' }, core: { score: 90, blockingFails: false, certificates: [CERT] },
      onProc: async (c) => {
        if (c.args.includes('deploy')) await writeFile(join(h.ctx.inputs.sitePath, 'public', 'agent', 'loopback.pem'), other.pem);
        return undefined;
      },
    });
    h.w.outputDir = await servedBefore();
    await expect(runAll(h.ctx)).rejects.toThrow(/certificates\.served https:\/\/geo\.example\.com\/agent\/loopback\.pem \(local\.example\.com\): key-mismatch[\s\S]*Rolled back/);
    expect(wranglerCalls(h).some((c) => c.args.includes('rollback'))).toBe(true);
  });

  it('a config with certificates needs certificate-renewal, and the input without them is an error', async () => {
    const missing = await harness({ core: { score: 90, blockingFails: false, certificates: [CERT] } });
    await expect(runAll(missing.ctx)).rejects.toThrow(/certificate-renewal is required/);
    const stray = await harness({ inputs: { certificateRenewal: 'force' } });
    await expect(runAll(stray.ctx)).rejects.toThrow(/certificate-renewal is set but geoharness.toml has no \[\[certificates\]\]/);
  });
});
