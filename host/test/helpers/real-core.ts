// The shipped core: dist/core/geoharness_wasm.js (committed, rebuilt byte for byte in CI), loaded through
// the same typed adapter the CLI uses. No fake: these helpers only read fixtures/core from disk.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Core } from '../../src/core/core.js';
import { unwrap } from '../../src/core/core.js';
import type { PageInput, SiteConfig, SiteInput } from '../../src/core/types-index.js';
import { loadWasmCore } from '../../src/core/wasm.js';

export const REPO = join(import.meta.dirname, '..', '..', '..');
export const CORE_MODULE = join(REPO, 'dist', 'core', 'geoharness_wasm.js');
const FIXTURE = join(REPO, 'fixtures', 'core');
/** Same build id as crates/geoharness-core/tests/common/mod.rs, so the goldens apply. */
export const FIXTURE_BUILD_ID = '0123abcd';

export const realCore = (): Core => loadWasmCore(CORE_MODULE);
export const fixtureText = (rel: string): string => readFileSync(join(FIXTURE, rel), 'utf8');
export const expectedJson = (rel: string): unknown => JSON.parse(fixtureText(join('expected', rel))) as unknown;

function page(route: string, file: string, extra: Partial<PageInput> = {}): PageInput {
  return { route, file, html: fixtureText(join('site', 'pages', file)), ...extra };
}

/** The fixture site exactly as crates/geoharness-core/tests/common/mod.rs builds it. */
export function fixtureSiteInput(core: Core): SiteInput {
  const config: SiteConfig = unwrap('parseConfig', core.parseConfig(fixtureText('site/geoharness.toml')));
  return {
    config,
    buildId: FIXTURE_BUILD_ID,
    hosts: ['example.com', 'www.example.com'],
    env: { PUBLIC_NAME: 'the docs team' },
    pages: [
      page('/', 'index.html', { lastmod: '2026-11-10T09:00:00Z' }),
      page('/guide/', 'guide/index.html', { lastmod: '2026-11-01T12:00:00Z' }),
      page('/guide/advanced/', 'guide/advanced/index.html'),
      page('/private/', 'private/index.html'),
      page('/pricing/', 'pricing/index.html', { markdown: fixtureText('site/pages/pricing/source.md'), lastmod: '2026-10-05T08:30:00Z' }),
      page('/drafts/wip/', 'drafts/wip/index.html'),
    ],
    existing: { robots: fixtureText('site/existing/robots.txt'), headers: fixtureText('site/existing/_headers') },
  };
}
