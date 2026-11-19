# Changelog

All notable changes to GeoHarness are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
