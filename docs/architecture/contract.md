# Core ⇄ host contract

GeoHarness is split by SBIO (separation of business logic and I/O):

- **Core** (`crates/*`, compiled to `geoharness-wasm`, target `wasm32-unknown-unknown`) is pure. It receives bytes and configuration, returns bytes, plans and findings. It never touches the filesystem, network, clock, environment or processes.
- **Host** (`host/`, TypeScript, Node 24) performs every I/O: reading the build output, git dates, HTTP, Cloudflare API, wrangler, Lighthouse. It never decides policy; it asks the core.

This file is the single source of truth for the boundary. Types are written in TypeScript; the Rust side mirrors them with `serde` (`rename_all = "camelCase"`) and generates `host/src/core/types.ts` with `ts-rs` (CI fails if the generated file is stale). All calls take and return plain JSON-compatible objects (no BigInt, no Maps).

Every function returns `Result<T>`:

```ts
type Result<T> = { ok: true; value: T } | { ok: false; errors: CoreError[] };
interface CoreError { code: string; message: string; path?: string } // path: config key or file
```

## 1. `parseConfig(toml: string): Result<SiteConfig>`

Parses and validates `geoharness.toml`. Unknown keys are errors. No implicit defaults except those listed in `docs/config.md` (each documented with a reason).

```ts
interface SiteConfig {
  site: { origin: string /* https://example.com, no trailing slash */; name: string; language: string /* BCP 47 */ };
  identity: {
    kind: 'person' | 'organization';
    name: string; url: string; sameAs: string[];          // rel=me + JSON-LD sameAs
    organization?: { name: string; url: string };
  };
  contentSignal: { search: boolean; aiInput: boolean; aiTrain: boolean }; // required, no default
  bots: BotPolicy[];                                      // required
  content: { mainSelector: string; exclude: string[] /* route globs */ };
  llms: { summary: string; sections: { title: string; routes: string[] }[] };
  env: string[];                                          // names {{env.NAME}} may read
  headers: { immutable: string[] /* path globs of hashed assets */ };
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
  rewriteRules: RewriteRule[];         // zone URL Rewrite rules for this host (Accept negotiation)
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
- Head injection only fills what the page lacks (never overrides an author's tag): canonical, `rel=alternate type=text/markdown`, `rel=describedby` → `/llms.txt`, OG/Twitter, minimal JSON-LD, `<meta name="build">`.
- Templating: `{{geo.build_id}}`, `{{geo.lastmod}}`, `{{env.NAME}}` (declared names only; an undeclared name is an error, not an empty string).
- `_headers`: the site's own block is preserved verbatim first; GeoHarness appends its block. Total rules ≤ 100 or error.
- `rewriteRules`: three rules (directory, bare path, `.html`), each guarded by `http.host eq "<host>"` and `any(http.request.headers["accept"][*] contains "text/markdown")`. Descriptions start with `geoharness:<host>`.
- IndexNow key: deterministic from `buildId`-independent seed = sha256(origin) hex[0..32] so it is stable across deploys.

## 3. `audit(input: AuditInput): Result<AuditReport>`

Runs on the processed output (static) and, separately, on live responses.

```ts
interface AuditInput {
  config: SiteConfig;
  pages: { route: string; html: string; markdown: string }[];
  robots: string; headers: string; llms?: string; sitemap: string;
  live?: LiveObservation[];            // present only for the post-deploy audit
}
interface LiveObservation { url: string; userAgent: string; accept: string; status: number; headers: Record<string, string>; bodyPrefix: string }
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

## 4. `liveCheckPlan(config: SiteConfig, routes: string[]): Result<LiveRequest[]>`

The core decides what to fetch after deploy; the host fetches and returns `LiveObservation[]` to `audit`.

```ts
interface LiveRequest { url: string; userAgent: string; accept: string; expect: { status: number; contentType?: string; varyIncludes?: string; bodyIncludes?: string } }
```

Matrix: agent Accept (`text/markdown, text/html, */*`) and browser Accept per sampled route; the 8 AI user agents (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User) on `/`; `/robots.txt`, `/llms.txt`, `/sitemap.xml`; build meta equals `buildId`.

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
