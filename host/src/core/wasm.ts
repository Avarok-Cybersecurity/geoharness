import { createRequire } from 'node:module';
import type { Core } from './core.js';
import type { Result } from './types-index.js';

/**
 * Loads the wasm-bindgen (`--target nodejs`) build of geoharness-wasm.
 * The core lane ships it at dist/core/geoharness_wasm.js next to dist/cli.mjs.
 * Each export takes plain JSON-compatible objects and returns a Result object.
 */
const EXPORTS = ['parseConfig', 'processSite', 'audit', 'liveCheckPlan', 'ragInputs'] as const;
type ExportName = (typeof EXPORTS)[number];

function isResult(value: unknown): value is Result<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false;
  const ok: unknown = value.ok;
  if (ok === true) return 'value' in value;
  return ok === false && 'errors' in value && Array.isArray(value.errors);
}

function call(mod: Record<string, unknown>, name: ExportName, args: unknown[]): Result<unknown> {
  const fn = mod[name];
  if (typeof fn !== 'function') throw new Error(`geoharness-wasm does not export ${name}()`);
  const raw: unknown = Reflect.apply(fn, undefined, args);
  if (!isResult(raw)) throw new Error(`geoharness-wasm ${name}() returned a value that is not a Result`);
  return raw;
}

export function loadWasmCore(modulePath: string): Core {
  const require = createRequire(import.meta.url);
  let loaded: unknown;
  try {
    loaded = require(modulePath);
  } catch (e) {
    throw new Error(`cannot load the GeoHarness core (geoharness-wasm, wasm-pack --target nodejs) from ${modulePath}`, { cause: e });
  }
  if (typeof loaded !== 'object' || loaded === null) throw new Error(`cannot load core from ${modulePath}`);
  const mod = loaded as Record<string, unknown>;
  for (const name of EXPORTS) {
    if (typeof mod[name] !== 'function') throw new Error(`core at ${modulePath} lacks export ${name}()`);
  }
  // The casts below are the one typed boundary to untyped wasm; shapes are fixed by the contract.
  return {
    parseConfig: (toml) => call(mod, 'parseConfig', [toml]) as ReturnType<Core['parseConfig']>,
    processSite: (input) => call(mod, 'processSite', [input]) as ReturnType<Core['processSite']>,
    audit: (input) => call(mod, 'audit', [input]) as ReturnType<Core['audit']>,
    liveCheckPlan: (config, routes) => call(mod, 'liveCheckPlan', [config, routes]) as ReturnType<Core['liveCheckPlan']>,
    ragInputs: (input) => call(mod, 'ragInputs', [input]) as ReturnType<Core['ragInputs']>,
  };
}
