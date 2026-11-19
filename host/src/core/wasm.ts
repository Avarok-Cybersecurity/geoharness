import { createRequire } from 'node:module';
import type { Core } from './core.js';
import type { Result } from './types-index.js';

/**
 * Typed adapter over the wasm-bindgen (`--target nodejs`) build of geoharness-wasm, shipped at
 * dist/core/geoharness_wasm.js next to dist/cli.mjs. Its generated .d.ts types every export as
 * `(input: any) => any`; this is the one place that untyped surface is crossed. Each export is
 * checked to exist, each return value is checked to be a Result envelope, and the payload type
 * comes from the ts-rs generated types (host/src/core/types.ts), whose Rust source defines it.
 */
export const CORE_EXPORTS = ['parseConfig', 'processSite', 'audit', 'auditLive', 'liveCheckPlan', 'ragInputs'] as const;
type ExportName = (typeof CORE_EXPORTS)[number];
type WasmModule = Record<ExportName, (input: unknown) => unknown>;

function isResult(value: unknown): value is Result<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false;
  const ok: unknown = value.ok;
  if (ok === true) return 'value' in value;
  return ok === false && 'errors' in value && Array.isArray(value.errors);
}

function bind<K extends ExportName>(mod: WasmModule, name: K): Core[K] {
  const fn = mod[name];
  const typed = (input: unknown): Result<unknown> => {
    const raw = fn(input);
    if (!isResult(raw)) throw new Error(`geoharness-wasm ${name}() returned a value that is not a Result`);
    return raw;
  };
  // The Result payload's shape is fixed by the Rust types the ts-rs file is generated from;
  // the contract test (host/test/core-contract.test.ts) runs every export of the real wasm.
  return typed as Core[K];
}

function asWasmModule(loaded: unknown, modulePath: string): WasmModule {
  if (typeof loaded !== 'object' || loaded === null) throw new Error(`cannot load core from ${modulePath}`);
  for (const name of CORE_EXPORTS) {
    if (typeof (loaded as Record<string, unknown>)[name] !== 'function') {
      throw new Error(`core at ${modulePath} lacks export ${name}()`);
    }
  }
  return loaded as WasmModule;
}

export function loadWasmCore(modulePath: string): Core {
  const require = createRequire(import.meta.url);
  let loaded: unknown;
  try {
    loaded = require(modulePath);
  } catch (e) {
    throw new Error(`cannot load the GeoHarness core (geoharness-wasm, wasm-bindgen --target nodejs) from ${modulePath}`, { cause: e });
  }
  const mod = asWasmModule(loaded, modulePath);
  return {
    parseConfig: bind(mod, 'parseConfig'),
    processSite: bind(mod, 'processSite'),
    audit: bind(mod, 'audit'),
    auditLive: bind(mod, 'auditLive'),
    liveCheckPlan: bind(mod, 'liveCheckPlan'),
    ragInputs: bind(mod, 'ragInputs'),
  };
}
