# Contributing to GeoHarness

Thanks for helping. GeoHarness is split by one rule: the **core** (`crates/`, Rust, compiled to
`wasm32-unknown-unknown`) decides and performs no I/O; the **host** (`host/`, TypeScript) performs all I/O and
asks the core. The boundary is [docs/architecture/contract.md](docs/architecture/contract.md); read it first.

## Setup

- Rust: the toolchain is pinned by `rust-toolchain.toml` (rustup installs it).
- Node 22.12 or newer: `npm ci`.

## Checks (all run in CI)

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo run -p xtask -- gen-types --check    # host/src/core/types.ts
cargo run -p xtask -- gen-checks --check   # docs/generated/checks.json
npm run typecheck && npm run lint && npm test
scripts/build-wasm.sh && npm run bundle    # dist/ must not change (dist/core: Linux x86_64 bytes, see below)
npm run check:docs                         # generated README and site sections
```

## Rules

- **Generated files are never edited by hand.** Change the source and regenerate:
  `host/src/core/types.ts` (Rust types → `gen-types`), `docs/generated/checks.json` (audit catalog →
  `gen-checks`), README/site sections between `<!-- generated:… -->` markers (`npm run docs`), `dist/`
  (`scripts/build-wasm.sh`, `npm run bundle`), `site/src/og.png` (`npm run og`).
- **`dist/core/` holds the Linux x86_64 build.** A macOS build behaves the same but differs in bytes. After
  changing `crates/`, push, then commit `dist/core/` from the failing `dist` job's `dist` artifact
  (`gh run download <run> -n dist -D dist`), or build on Linux.
- **Every claim needs a citation.** Add sources to [CITATIONS.md](CITATIONS.md) with an evidence grade; audit
  findings may only cite ids that exist there (a test checks).
- **No implicit defaults.** A config default needs a documented reason in `docs/config.md`.
- **Tests use the real core** where they can (`host/test/core-contract.test.ts`); a fake needs a comment
  saying why.
- **Files stay under 250 lines**; split by responsibility.
- Golden outputs: `GEOHARNESS_BLESS=1 cargo test` rewrites `fixtures/core/expected`; review the diff.

## Pull requests

Keep them focused, describe the user-visible change, and add a line to `CHANGELOG.md` under *Unreleased*.
The dogfood workflow builds and audits this repository's own site with `deploy: false` on every pull request.

By contributing you agree that your contribution is dual-licensed under Apache-2.0 OR MIT, as described in the
README.
