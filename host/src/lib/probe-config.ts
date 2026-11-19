import type { SiteConfig } from '../core/types-index.js';

/**
 * The SiteConfig `geoharness audit <url>` uses for a site that has no geoharness.toml at hand.
 * Every value is derived from the URL or is deliberately empty/false, so the audit judges what the
 * site serves, not a policy GeoHarness invented for it. Pass --config to audit against a real one.
 */
export function probeConfig(url: URL): SiteConfig {
  return {
    site: { origin: url.origin, name: url.host, language: 'und' },
    identity: { kind: 'organization', name: url.host, url: url.origin, sameAs: [] },
    contentSignal: { search: false, aiInput: false, aiTrain: false },
    bots: [],
    content: { mainSelector: 'main', exclude: [] },
    llms: { summary: '', sections: [] },
    env: [],
    headers: { immutable: [] },
  };
}
