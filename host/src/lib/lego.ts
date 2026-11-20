import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { AcmeDirectory, Certificate, KeyType } from '../core/types-index.js';

/**
 * lego (https://github.com/go-acme/lego), pinned like wrangler and lhci. The sha256 values are copied from the
 * release's lego_4.35.2_checksums.txt and were re-checked against the downloaded archives. Linux only: the action
 * runs on Linux runners. v4.35.2 is the last v4 release.
 */
export const LEGO_VERSION = '4.35.2';
const RELEASE_BASE = `https://github.com/go-acme/lego/releases/download/v${LEGO_VERSION}`;
const LEGO_ASSETS: Readonly<Record<string, { file: string; sha256: string }>> = {
  'linux-x64': { file: `lego_v${LEGO_VERSION}_linux_amd64.tar.gz`, sha256: 'ee5be4bf457de8e3efa86a51651c75c87f0ee0e4e9f3ae14f6034d68365770f3' },
  'linux-arm64': { file: `lego_v${LEGO_VERSION}_linux_arm64.tar.gz`, sha256: 'e1f153179098d27ce044aaaa168c0e323d50ae71b0f1a147aa8ae49ac6b14d89' },
};

/** Where this platform's lego comes from, or why there is none. Resolved once by the CLI from process.platform/arch. */
export type LegoSource = { kind: 'asset'; url: string; sha256: string } | { kind: 'unsupported'; reason: string };

export function legoSourceFor(platform: string, arch: string): LegoSource {
  const asset = LEGO_ASSETS[`${platform}-${arch}`];
  if (asset === undefined) return { kind: 'unsupported', reason: `lego is pinned for Linux x64 and arm64 only, not ${platform}-${arch}` };
  return { kind: 'asset', url: `${RELEASE_BASE}/${asset.file}`, sha256: asset.sha256 };
}

export const ACME_DIRECTORY_URLS: Readonly<Record<AcmeDirectory, string>> = {
  production: 'https://acme-v02.api.letsencrypt.org/directory',
  staging: 'https://acme-staging-v02.api.letsencrypt.org/directory',
};

const LEGO_KEY_TYPES: Readonly<Record<KeyType, string>> = {
  'ec-256': 'ec256', 'ec-384': 'ec384', 'rsa-2048': 'rsa2048', 'rsa-3072': 'rsa3072', 'rsa-4096': 'rsa4096',
};

/** The variable lego's Cloudflare DNS provider reads the token from. Never an argument: argv is visible to every process. */
export const LEGO_TOKEN_ENV = 'CF_DNS_API_TOKEN';

/** `lego … run` for one name, DNS-01 through Cloudflare, data under `dataDir`. No credential appears here. */
export function legoArgs(cert: Certificate, dataDir: string): string[] {
  return [
    '--accept-tos', '--email', cert.acmeEmail, '--server', ACME_DIRECTORY_URLS[cert.acmeDirectory],
    '--key-type', LEGO_KEY_TYPES[cert.keyType], '--dns', 'cloudflare', '--domains', cert.domain,
    '--path', dataDir, 'run',
  ];
}

/** Where `lego run` leaves the certificate (with its issuer chain) and the key. */
export function legoOutputFiles(dataDir: string, domain: string): { pem: string; key: string } {
  return { pem: join(dataDir, 'certificates', `${domain}.crt`), key: join(dataDir, 'certificates', `${domain}.key`) };
}

export function checkSha256(bytes: Uint8Array, expected: string, what: string): void {
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`${what}: sha256 ${actual} does not match the pinned ${expected}; refusing to run it`);
}
