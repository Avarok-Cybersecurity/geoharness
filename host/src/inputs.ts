import { isAbsolute, resolve } from 'node:path';
import { ADAPTER_IDS, type AdapterId } from './adapters/ids.js';
import type { Env } from './io/types.js';
import { parseOptimizations, type OptimizationId } from './lib/optimizations.js';

/**
 * Action inputs. action.yml forwards each input as INPUT_<NAME> (upper case, '-' → '_') because composite
 * actions do not export inputs and GitHub does not enforce `required` for them: validation lives here.
 */
export interface Inputs {
  apiToken: string;
  accountId: string;
  workspace: string;
  sitePath: string;
  adapter: AdapterId | 'auto';
  buildCommand: string | undefined;
  outputDir: string | undefined;
  target: 'workers' | 'pages';
  projectName: string;
  domains: string[];
  lighthouse: boolean;
  lighthouseMaxUrls: number | undefined;
  geoMinScore: number;
  optimizations: Set<OptimizationId>;
  buildId: string;
  stateDir: string;
}

export class InputError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid GeoHarness inputs:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'InputError';
  }
}

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const PROJECT = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const ACCOUNT = /^[0-9a-f]{32}$/;
const SHA = /^[0-9a-f]{40}$/;

function isAdapterId(s: string): s is AdapterId {
  return (ADAPTER_IDS as readonly string[]).includes(s);
}

export function readInputs(env: Env): Inputs {
  const problems: string[] = [];
  const raw = (name: string): string | undefined => {
    const v = env.get(`INPUT_${name.toUpperCase().replace(/-/g, '_')}`)?.trim();
    return v === undefined || v === '' ? undefined : v;
  };
  const required = (name: string): string => {
    const v = raw(name);
    if (v === undefined) problems.push(`${name} is required`);
    return v ?? '';
  };
  const bool = (name: string): boolean => {
    const v = required(name);
    if (v !== 'true' && v !== 'false' && v !== '') problems.push(`${name} must be "true" or "false", got "${v}"`);
    return v === 'true';
  };
  const integer = (name: string, min: number, max: number): number | undefined => {
    const v = raw(name);
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) problems.push(`${name} must be an integer ${min}–${max}, got "${v}"`);
    return n;
  };

  const apiToken = required('cloudflare-api-token');
  const accountId = required('cloudflare-account-id');
  if (accountId !== '' && !ACCOUNT.test(accountId)) problems.push('cloudflare-account-id must be 32 hex characters');

  const workspace = env.get('GITHUB_WORKSPACE') ?? '';
  if (workspace === '') problems.push('GITHUB_WORKSPACE is not set');
  const sitePathRaw = required('site-path');
  const sitePath = isAbsolute(sitePathRaw) ? sitePathRaw : resolve(workspace, sitePathRaw);

  const adapterRaw = required('adapter');
  if (adapterRaw !== '' && adapterRaw !== 'auto' && !isAdapterId(adapterRaw)) {
    problems.push(`adapter must be "auto" or one of ${ADAPTER_IDS.join(', ')}, got "${adapterRaw}"`);
  }
  const adapter: AdapterId | 'auto' = isAdapterId(adapterRaw) ? adapterRaw : 'auto';

  const targetRaw = required('target');
  if (targetRaw !== '' && targetRaw !== 'workers' && targetRaw !== 'pages') problems.push('target must be "workers" or "pages"');
  const target = targetRaw === 'pages' ? 'pages' : 'workers';

  const projectName = required('project-name');
  if (projectName !== '' && !PROJECT.test(projectName)) problems.push('project-name must be lower-case letters, digits and hyphens (≤63)');

  const domains = (raw('domains') ?? '').split('\n').map((d) => d.trim().toLowerCase()).filter((d) => d !== '');
  if (domains.length === 0) problems.push('domains is required (newline-separated host names)');
  for (const d of domains) if (!HOSTNAME.test(d)) problems.push(`domains: "${d}" is not a host name`);

  const lighthouse = bool('lighthouse');
  const lighthouseMaxUrls = integer('lighthouse-max-urls', 1, 100);
  if (lighthouse && lighthouseMaxUrls === undefined) problems.push('lighthouse-max-urls is required when lighthouse is true');
  const geoMinScore = integer('geo-min-score', 0, 100);
  if (geoMinScore === undefined) problems.push('geo-min-score is required (0–100)');

  const opt = parseOptimizations(required('extra-optimizations'));
  if (!opt.ok) problems.push(opt.error);

  if (bool('rag')) problems.push('rag is coming in v1.1 and is not implemented yet; remove `rag: true`');

  const buildId = env.get('GITHUB_SHA') ?? '';
  if (!SHA.test(buildId)) problems.push('GITHUB_SHA must be a 40-character commit SHA');
  const stateDir = env.get('GEOHARNESS_STATE_DIR') ?? '';
  if (stateDir === '') problems.push('GEOHARNESS_STATE_DIR is not set (action.yml sets it to $RUNNER_TEMP/geoharness)');

  if (problems.length > 0) throw new InputError(problems);
  return {
    apiToken, accountId, workspace, sitePath, adapter,
    buildCommand: raw('build-command'), outputDir: raw('output-dir'),
    target, projectName, domains, lighthouse, lighthouseMaxUrls,
    geoMinScore: geoMinScore ?? 0,
    optimizations: opt.ok ? opt.value : new Set(),
    buildId, stateDir,
  };
}
