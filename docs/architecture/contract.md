# Core ⇄ host contract

GeoHarness is split by SBIO (separation of business logic and I/O):

- **Core** (`crates/*`, compiled to `geoharness-wasm`, target `wasm32-unknown-unknown`) is pure. It receives bytes and configuration, returns bytes, plans and findings. It never touches the filesystem, network, clock, environment or processes.
- **Host** (`host/`, TypeScript, Node 24) performs every I/O: reading the build output, git dates, HTTP, Cloudflare API, wrangler, Lighthouse. It never decides policy; it asks the core.

This file is the single source of truth for the boundary. Types are written in TypeScript; the Rust side mirrors them with `serde` (`rename_all = "camelCase"`) and generates `host/src/core/types.ts` with `ts-rs` (CI fails if the generated file is stale). All calls take and return plain JSON-compatible objects (no BigInt, no Maps).

### Calling convention (wasm)

`geoharness-wasm` is built for `wasm32-unknown-unknown` (never WASI) and bound with `wasm-bindgen --target nodejs` (CLI pinned to the crate version in `Cargo.lock`) into `dist/core/geoharness_wasm.js` by `scripts/build-wasm.sh`. It is CommonJS with synchronous instantiation; no `package.json` is written into `dist/core/`. The repository root is `"type": "module"`, so the committed `dist/package.json` declares `"type": "commonjs"` for everything under `dist/` (`dist/cli.mjs` is ESM by extension). `dist/core/` is committed with the action and rebuilt byte for byte in CI on Linux x86_64 (the toolchain is pinned by `rust-toolchain.toml` and `scripts/build-wasm.sh` remaps every source path prefix); a macOS build behaves identically but lays out data differently, so the committed copy is the Linux build (the dist job uploads it as an artifact when it differs). The host crosses the untyped exports only in `host/src/core/wasm.ts` (the typed `Core` adapter); `host/test/core-contract.test.ts` runs every export of the real wasm against the native goldens. Exports: `parseConfig`, `processSite`, `audit`, `auditLive`, `liveCheckPlan`, `ragInputs`.

Every export takes **one plain JS object** (`parseConfig` takes the TOML text) and returns the `Result<T>` envelope below **as a plain object**. Objects cross with `serde-wasm-bindgen` in JSON-compatible mode: records are plain objects (never `Map`), numbers are `number` (never `BigInt`), absent optionals are omitted. Input that does not match the type is an `input.invalid` error whose `path` is the path of the first bad field. The TypeScript types are generated into `host/src/core/types.ts` (`cargo run -p xtask -- gen-types`; `--check` in CI).

Every function returns `Result<T>`:

```ts
type Result<T> = { ok: true; value: T } | { ok: false; errors: CoreError[] };
interface CoreError { code: string; message: string; path?: string } // path: config key or file
```

Error codes (stable; `SiteOutput.warnings` reuse the shape):

| Code | Meaning |
|---|---|
| `config.syntax` | Not valid TOML |
| `config.unknown_key` | A key the schema does not define (`path` = the key) |
| `config.missing_key` | A required key is absent |
| `config.invalid` | A value fails validation (origin, BCP 47, selector, globs, env names, duplicate bot tokens…) |
| `input.invalid` | Malformed call input: bad JSON, duplicate routes, unsafe file paths, bad `buildId` |
| `env.undeclared` | `SiteInput.env` holds a name not listed in `config.env` |
| `template.unknown` | `{{geo.x}}` with an unknown `x` |
| `template.undeclared_env` | `{{env.NAME}}` where `NAME` is not in `config.env` |
| `template.missing_value` | Declared but not supplied (`env`), or `{{geo.lastmod}}` on a page without `lastmod` |
| `html.rewrite` | The HTML rewriter or converter failed |
| `robots.conflict` | The site's robots.txt has different rules for a configured token |
| `headers.conflict` | A site `_headers` rule sets a `Content-Signal` different from the configured one |
| `headers.too_many_rules` | `_headers` would exceed 100 rules |

Warning codes: `page.no_main` (selector matched nothing; `<body>` used), `page.jsonld_invalid`, `output.existing_kept` (site ships its own llms.txt or sitemap.xml; kept, not generated), `llms.section_empty`, `rewrite.mixed_layout`, `headers.csp_extended` (`analytics.cloudflareWebAnalytics = true` extended the site's CSP; `path` = `_headers`), `headers.link_skipped` (the per-page `Link` rules would exceed 100 `_headers` rules, so none were written; `path` = `_headers`), `page.no_lastmod` (one warning naming the pages left without a lastmod; `path` = `content.sources`).

## 1. `parseConfig(toml: string): Result<SiteConfig>`

Parses and validates `geoharness.toml`. Unknown keys are errors. No implicit defaults except those listed in `docs/config.md` (each documented with a reason).

```ts
interface SiteConfig {
  site: { origin: string /* https://example.com, no trailing slash */; name: string; language: string /* BCP 47 */ };
  identity: {
    kind: 'person' | 'organization';
    name: string; url: string; sameAs: string[];          // rel=me + JSON-LD sameAs
    logo?: string; email?: string;                        // JSON-LD logo / email of the entity node; absent = not declared
    organization?: { name: string; url: string };
  };
  contentSignal: { search: boolean; aiInput: boolean; aiTrain: boolean }; // required, no default
  bots: BotPolicy[];                                      // required
  content: { mainSelector: string; exclude: string[] /* route globs */ };
  llms: { summary: string; sections: { title: string; routes: string[] }[] };
  env: string[];                                          // names {{env.NAME}} may read
  headers: { immutable: string[] /* path globs of hashed assets */ };
  prerender?: { routes: string[] };                       // literal routes the host's prerender adapter renders; core only validates
  analytics?: { cloudflareWebAnalytics: boolean };        // explicit opt-in; extends the site's CSP for the beacon
}
interface BotPolicy { tokens: string[]; allow: string[]; disallow: string[]; group: 'search' | 'user' | 'training' | 'other' }
```

## 2. `processSite(input: SiteInput): Result<SiteOutput>`

```ts
interface SiteInput {
  config: SiteConfig;
  buildId: string;                     // commit SHA
  env: Record<string, string>;         // ONLY the names in config.env; host enforces, core re-checks
  pages: PageInput[];
  existing: { robots?: string; headers?: string; llms?: string; sitemap?: string };
  hosts: string[];                     // the action's domains (lower case, no port); includes the origin's host
  sourceLastmod: Record<string, string>; // per source glob of content.sources: newest commit, UTC "YYYY-MM-DDTHH:MM:SSZ";
                                       // globs git has no commit for are left out
}
interface PageInput {
  route: string;                       // "/", "/about/"
  file: string;                        // output-relative path: "index.html", "about/index.html"
  html: string;
  markdown?: string;                   // adapter-supplied source markdown (preferred over conversion)
  lastmod?: string;                    // ISO 8601 from git (source file's last commit), never "now"
}
interface SiteOutput {
  files: OutFile[];                    // rewritten HTML, md twins, robots.txt, llms.txt, llms-full.txt,
                                       // sitemap.xml, _headers, <indexnow-key>.txt
  rewriteRules: RewriteRule[];         // zone URL Rewrite rules for every host in `hosts` (Accept negotiation)
  pages: PageSummary[];
  warnings: CoreError[];
}
interface OutFile { file: string; contents: string }
interface RewriteRule { description: string; expression: string; pathExpression: string }
interface PageSummary { route: string; markdownFile: string; title: string; description: string; tokens: number; lastmod?: string }
```

Rules the core enforces:

- Markdown twin path: `x/index.html` → `x/index.md`; `x.html` → `x.md`.
- Twin = main content (`content.mainSelector`) converted with tables and fenced code preserved, YAML frontmatter `title, description, canonical, lastmod, tokens`, JSON-LD appended as a fenced `json` block.
- Head injection only fills what the page lacks (never overrides an author's tag): canonical, `rel=alternate type=text/markdown`, `rel=describedby` → `/llms.txt`, OG/Twitter, JSON-LD, `<meta name="build">`.
- Generated JSON-LD (only when the page has none) is one `@graph`: the identity node (`@type` Organization or Person, `@id` = `identity.url` with a `/` path when bare, plus `#organization` or `#person`; `name`, `url`, `sameAs`, `logo`, `email`, `worksFor`/`parentOrganization`), on `/` only a `WebSite` node (`@id` `<origin>/#website`, `name`, `url`, `inLanguage`, `publisher` → the identity), and the `WebPage` (`@id` = canonical; `isPartOf` → the WebSite, by `@id` on `/` and inline elsewhere; `author` → the identity; `about` → the identity on `/`).
- Templating: `{{geo.build_id}}`, `{{geo.lastmod}}`, `{{env.NAME}}` (declared names only; an undeclared name is an error, not an empty string).
- `_headers`: the site's own block comes first, then GeoHarness's block. Each URL pattern appears once: a GeoHarness rule whose pattern the site already uses is written inside that site rule between indented `# BEGIN GeoHarness`/`# END GeoHarness` lines (Cloudflare combines matching rules, so production sees the same headers, and `wrangler dev`, which keeps only the last rule per pattern, serves what production serves). The site's own lines are otherwise verbatim, except that `analytics.cloudflareWebAnalytics = true` extends its `Content-Security-Policy` values for the Web Analytics beacon (warning `headers.csp_extended`). Per-page `Link` headers (RFC 8288): a page declares `<twin>; rel="alternate"; type="text/markdown", <origin/llms.txt>; rel="describedby"` and its twin `<canonical>; rel="canonical"`. Directory-style pages other than `/` share the generic rules `/*/` and `/*/index.md` (Cloudflare's `:splat` placeholder), each used only where it is exact for every page: `/*/` only when no excluded directory route lies under it, `/*/index.md` only when every directory page's canonical is its own URL; otherwise, and for `/` and file-style pages, each page and twin gets an exact rule. No rule detaches a header (`! Link`): `wrangler dev` ignores detaching, so the pre-deploy gate would not serve what production does. A directory URL that 404s also matches `/*/`. A site rule with a `Content-Signal` other than the configured one is a `headers.conflict` (Cloudflare would send both); the same value on the site's `/*` rule is not written again. Required rules over 100 are an error; the optional `Link` rules are written all or none (`headers.link_skipped`).
- `rewriteRules`: for each host in `hosts`, in order, three rules (directory, bare path, `.html`), each guarded by `http.host eq "<host>"` and `any(http.request.headers["accept"][*] contains "text/markdown")`. Descriptions start with `geoharness:<host>`. Directory: `ends_with(path, "/")` → `concat(path, "index.md")`. `.html`: `http.request.uri.path.extension eq "html"` → `wildcard_replace(path, "*.html", "${1}.md")`. Bare path: `not ends_with(path, "/") and http.request.uri.path.extension eq ""` → `concat(path, "/index.md")` when most pages are `x/index.html`, else `concat(path, ".md")` (a mixed site gets `rewrite.mixed_layout`). Requests with any other extension (assets, `.md` itself) never match.
- lastmod: a page whose route matches a `content.sources` route glob takes the newest `sourceLastmod` date among the source globs of every matching entry; otherwise the adapter's `lastmod`. Never the current time. Pages left without one get the `page.no_lastmod` warning.
- `content.exclude` routes are passed through (templated only): no twin, no injection, not in llms/sitemap. Pages that are `noindex` or disallowed for `*` by the merged robots.txt get a twin but are left out of `llms.txt`, `llms-full.txt` and `sitemap.xml`.
- `existing.llms` / `existing.sitemap`, when present, are kept as the site's own and not regenerated (`output.existing_kept` warning); `llms-full.txt` is always generated. robots.txt and `_headers` are merged.
- robots.txt: the site's lines are kept in order and GeoHarness's block follows them. `Content-Signal` is site-wide policy and a crawler reads only the most specific group naming it (RFC 9309), so every group carries exactly one signal line: generated groups always, and each site group without one gets the configured line right after its `User-agent` lines (the only line GeoHarness adds to the site's part). A site group that states a different signal is a `robots.conflict`; a configured token the site already names with the same rules is not repeated, with different rules it is a `robots.conflict`.
- Twin links and images are made absolute (`origin` + resolved path) so twins work inside `llms-full.txt`. A fragment-only link (`#experience`) becomes `<canonical>#experience`, in the per-page twin as in `llms-full.txt` (which embeds the twins verbatim): the fragment names an element of the HTML page, and a bare `#experience` would point into the markdown, which has no such anchor. Adapter-supplied markdown is used as written.
- A link with no visible text (an icon-only link) gets its accessible name as link text: `aria-label`, else `title`, else the `alt` of an image inside it; a link with none of them is converted as is. The `delivery.twin` equivalence check compares the twin with the page's main-content text named the same way.
- IndexNow key file: named `<key>.txt` where `key` is 32 lowercase hex characters (the host finds it by that pattern among `files`), contents = key. Key deterministic from `buildId`-independent seed = sha256(origin) hex[0..32] so it is stable across deploys.

## 3. `audit(input: AuditInput): Result<AuditReport>`

Runs on the processed output (static) and, separately, on live responses.

```ts
interface AuditInput {
  config: SiteConfig;
  buildId: string;                     // the deployed commit, for the live build-meta check
  pages: { route: string; html: string; markdown: string }[];
  robots: string; headers: string; llms?: string; sitemap: string;
  live?: LiveObservation[];            // present only for the post-deploy audit
}
interface LiveObservation { url: string; userAgent: string; accept: string; status: number; headers: Record<string, string>; bodyPrefix: string; bodySuffix: string } // first / last BODY_PREFIX_CHARS (8192) UTF-16 code units
interface AuditReport {
  score: number;                       // 0–100, weighted
  categories: { id: string; title: string; weight: number; score: number }[];
  findings: Finding[];
}
interface Finding {
  checkId: string; title: string;
  severity: 'blocking' | 'advisory';   // blocking ⇔ evidence grade A/B "access/indexability" checks
  passed: boolean; route?: string; evidence: string;
  citations: string[];                 // ids from CITATIONS.md; CI checks every id exists
}
```

## 4. `liveCheckPlan(input: LiveCheckInput): Result<LiveRequest[]>`

```ts
// Exactly one of config and origin. origin (https://host) serves the config-less
// live audit; then the llms.txt expectation is only "# " (any H1). Without
// buildId the build-meta request is planned without a body expectation and
// produces no build finding.
interface LiveCheckInput { config?: SiteConfig; origin?: string; routes: string[]; buildId?: string }
```

The core decides what to fetch after deploy; the host fetches and returns `LiveObservation[]` to `audit`.

```ts
interface LiveRequest { url: string; userAgent: string; accept: string; expect: { status: number; contentType?: string; varyIncludes?: string; bodyIncludes?: string } }
```

`expect.contentType` is a case-insensitive substring of `Content-Type`; `expect.varyIncludes` is a case-insensitive token of `Vary`; `expect.bodyIncludes` must occur in `bodyPrefix`. The window is the core's `live::BODY_PREFIX_CHARS`, exported to the host as `BODY_PREFIX_CHARS` in the generated `types.ts`; the static audit's blocking `index.build_meta_early` checks every page's build meta ends inside it, so a page that would fail the live build check fails before deploy. `audit` re-derives this plan and matches each `LiveObservation` to its request by `(url, userAgent, accept)`; a planned request with no observation fails.

The audit also reads the `Link` header of the sampled routes' observations: the browser-Accept page must declare `rel=alternate; type=text/markdown`, the agent-Accept twin `rel=canonical` (advisory `signals.live_link_header`; no extra request).

Matrix: agent Accept (`text/markdown, text/html, */*`) and browser Accept per sampled route (`/` plus up to 4 others evenly spaced over the sorted routes); the 8 AI user agents (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User) on `/`; `/robots.txt`, `/llms.txt`, `/sitemap.xml`; build meta equals `buildId`.

### `auditLive(input: LiveAuditInput): Result<AuditReport>`

Config-less live audit for `geoharness audit <url>` with no `geoharness.toml`: the host calls `liveCheckPlan({ origin, routes, buildId? })`, fetches, then calls `auditLive`. Only the live checks run (no fabricated `SiteConfig`); categories without findings are left out of the score.

```ts
interface LiveAuditInput { origin: string; routes: string[]; buildId?: string; live: LiveObservation[] }
```

## 5. `ragInputs(input: RagInput): Result<RagOutput>`

```ts
interface RagInput { config: SiteConfig; pages: PageSummary[]; html: { route: string; html: string }[] }
interface RagOutput {
  sidecar: Record<string, { url: string; title: string; lastmod?: string }>; // key: markdown file path
  edges: { from: { path: string }; to: { path: string }; relation: 'child_of' | 'links_to'; weight: number }[];
}
```

`child_of` follows the URL hierarchy (`/a/b/` → `/a/`, top-level pages → `/`). `links_to` comes from internal `<a href>` in main content. Chunk-order `next` edges are produced by AutoRepoRAG (`chunk-strategy: markdown`).

## Adapters (host only)

```ts
interface Adapter {
  id: string;
  detect(dir: string, io: HostIO): Promise<{ confidence: number; evidence: string[] }>; // 0..1
  build(ctx: BuildContext): Promise<{ outputDir: string }>;
  pages(outputDir: string, io: HostIO): Promise<PageInput[]>; // may attach source markdown
}
```

The registry runs every `detect`, chooses the highest confidence, logs its evidence, and fails listing both when the top two tie. `adapter:` in the action input overrides detection.
