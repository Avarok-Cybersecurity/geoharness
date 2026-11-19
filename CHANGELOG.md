# Changelog

All notable changes to GeoHarness are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The pre-deploy Lighthouse gate audits the output served by `wrangler dev --local` (or `wrangler pages dev`)
  with the deploy's own config, so `_headers`, `html_handling` and 404 handling apply; lhci's static server
  ignored them and passed a CSP that scored SEO 92 in production.
- `_headers`: a GeoHarness rule whose URL pattern the site already uses is merged into that site rule, so
  `wrangler dev` (last rule per pattern wins) serves the same headers as production.
- Generated Worker `compatibility_date` is 2026-10-30, the newest the pinned wrangler's runtime supports.

### Fixed

- `<meta name="build">` is injected at the top of `<head>` (after a charset declaration) instead of its end. The
  live build check reads the first 8,192 characters, so a page with a large inline `<style>` or JSON-LD failed
  verification after deploying and was rolled back, though it served the right build. Found migrating
  thomaspbraun.com (build meta at offset 15,466).
- Markdown twins: icon-only links keep a label (`aria-label`, then `title`, then an inner image's `alt`)
  instead of converting to `[](url)`, and fragment-only links (`#experience`) become `<canonical>#experience`
  in the twin and in `llms-full.txt` instead of pointing into the markdown.
- robots.txt: the site's own groups now carry the configured `Content-Signal` too. A configured group the
  site's file already had (its `User-agent: *` included) was absorbed without the line, so the crawlers that
  read that group never saw the signal. A site group stating a different signal is a `robots.conflict`.
- Security: child processes no longer inherit the action inputs (`INPUT_*`), so the Cloudflare API token no longer
  reaches the site's build command or the install scripts of its dependencies; wrangler still gets it, passed
  explicitly. Found migrating thomaspbraun.com, GeoHarness's first external consumer.
- Verify: a network error on a live request (a reset, refused connection or timeout) is retried 3 times, 2 s
  apart; one that persists names the request and its cause (`GET <url> (<user-agent>, Accept: …): fetch failed:
  read ECONNRESET`) instead of a bare `fetch failed`. A verification that cannot complete, including a build that
  never goes live, now goes through the rollback like a failed one; before, a thrown error skipped the rollback.

### Added

- Post-deploy Lighthouse gate on the live URLs; on a failed live audit or gate, `rollback-on-failure: true`
  (required when deploying, no default) rolls production back to the version it served before.
- `[analytics] cloudflareWebAnalytics`: extends the site's CSP for the injected Web Analytics beacon; without
  it the live audit fails when the beacon is injected (`index.live_beacon`).
- Blocking static check `index.csp_robots`: the site's CSP must let the page fetch `/robots.txt`.

## [1.0.0] - Unreleased

### Added

- Composite GitHub Action `Avarok-Cybersecurity/geoharness@v1`: preflight, build, process, audit, Lighthouse,
  deploy, zone, verify, IndexNow and summary stages.
- Pure Rust core compiled to WebAssembly, shipped in `dist/core/`: markdown twins, fill-only head injection,
  robots.txt with Content Signals, `llms.txt`, `llms-full.txt`, `sitemap.xml`, `_headers`, IndexNow key,
  tagged URL Rewrite rules for `Accept: text/markdown`, live check plan and RAG inputs.
- Evidence-graded GEO audit with blocking access, indexability and delivery checks; config-less live audit
  (`geoharness audit <url>`).
- Adapters: static, command, npm, sveltekit-static, python, make, vite-prerender and worker-assets, with
  confidence-based detection.
- Lighthouse gate: 100 in all four categories, median of 3 runs.
- `deploy: false` dry run for pull requests: no Cloudflare API call, no credentials needed.
- Negotiate Worker fallback when the token has no zone access.
- `cloudflare-permissions.json`: permission groups per feature, probed in preflight.
- Product site and documentation at https://geo.avarok.net, built and deployed by GeoHarness itself.
- `rag` input reserved for v1.1 (LatticeDB in-browser search); `rag: true` fails clearly.
