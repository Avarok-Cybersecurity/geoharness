// Test certificates. Node's crypto parses X.509 but cannot create it, so the openssl CLI (on every runner and
// developer machine) signs a fresh self-signed pair per call; no network, no Let's Encrypt.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TestPair { pem: string; key: string }

export function selfSigned(domain: string, days: number): TestPair {
  const dir = mkdtempSync(join(tmpdir(), 'gh-cert-'));
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
      '-subj', `/CN=${domain}`, '-addext', `subjectAltName=DNS:${domain}`, '-days', String(days),
      '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'),
    ], { stdio: 'ignore' });
    return { pem: readFileSync(join(dir, 'cert.pem'), 'utf8'), key: readFileSync(join(dir, 'key.pem'), 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
