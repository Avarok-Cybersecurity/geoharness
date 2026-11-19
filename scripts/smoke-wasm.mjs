// Loads dist/core/geoharness_wasm.js (CommonJS) in Node and checks that processSite over the fixture site's
// config yields the golden robots.txt: proves the bindings load and that the
// wasm build behaves like the native one the golden tests ran against.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const core = require(new URL('dist/core/geoharness_wasm.js', root).pathname);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const config = core.parseConfig(read('fixtures/core/site/geoharness.toml'));
if (!config.ok) throw new Error(`parseConfig failed: ${JSON.stringify(config.errors)}`);

const input = {
  config: config.value,
  buildId: '0123abcd',
  env: {},
  pages: [],
  existing: { robots: read('fixtures/core/site/existing/robots.txt'), headers: read('fixtures/core/site/existing/_headers') },
};
const out = core.processSite(input);
if (!out.ok) throw new Error(`processSite failed: ${JSON.stringify(out.errors)}`);
const robots = out.value.files.find((f) => f.file === 'robots.txt')?.contents;
if (robots !== read('fixtures/core/expected/files/robots.txt')) throw new Error('robots.txt differs from golden');

const bad = core.parseConfig('[site]\nnope = 1\n');
if (bad.ok || bad.errors[0].code !== 'config.unknown_key') throw new Error(`unknown key not rejected: ${JSON.stringify(bad)}`);
if (Object.getPrototypeOf(out.value) !== Object.prototype || out.value.files instanceof Map) throw new Error('not a plain object');
const live = core.auditLive({ origin: 'https://example.com', routes: ['/'], live: [] });
if (!live.ok || live.value.findings.some((f) => f.passed)) throw new Error(`auditLive: ${JSON.stringify(live).slice(0, 300)}`);
console.log('smoke-wasm: ok');
