import { join } from 'node:path';
import type { HostIO } from '../io/types.js';
import { firstExisting } from './shared.js';

const EXT = ['ts', 'mts', 'js', 'mjs', 'cjs'];
const names = (base: string): string[] => EXT.map((e) => `${base}.${e}`);

interface Rule { configs: string[]; option: RegExp | undefined; fallback: string; when?: RegExp }

/** Output directories of common generators: the configured option if present, else the tool's documented output. */
const RULES: Rule[] = [
  { configs: names('vite.config'), option: /outDir\s*:\s*['"]([^'"]+)['"]/, fallback: 'dist' },
  { configs: names('astro.config'), option: /outDir\s*:\s*['"]\.?\/?([^'"]+)['"]/, fallback: 'dist' },
  { configs: names('next.config'), option: /distDir\s*:\s*['"]([^'"]+)['"]/, fallback: 'out', when: /output\s*:\s*['"]export['"]/ },
  { configs: [...names('eleventy.config'), '.eleventy.js'], option: /output\s*:\s*['"]([^'"]+)['"]/, fallback: '_site' },
  { configs: names('docusaurus.config'), option: undefined, fallback: 'build' },
  { configs: names('gatsby-config'), option: undefined, fallback: 'public' },
];

export async function detectNpmOutputDir(io: HostIO, dir: string): Promise<{ dir: string; evidence: string } | undefined> {
  for (const rule of RULES) {
    const config = await firstExisting(io, dir, rule.configs);
    if (config === undefined) continue;
    const text = await io.fs.readText(join(dir, config));
    if (rule.when !== undefined && !rule.when.test(text)) continue;
    const configured = rule.option?.exec(text)?.[1];
    return configured === undefined
      ? { dir: rule.fallback, evidence: `${config} (documented output ${rule.fallback}/)` }
      : { dir: configured, evidence: `${config} sets ${configured}/` };
  }
  return undefined;
}
