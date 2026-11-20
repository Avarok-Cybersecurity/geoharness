# `geoharness.toml`

Parsed by `parseConfig` (contract §1). Keys are camelCase. **Unknown keys are errors** (`config.unknown_key`). A key is required unless this table lists a default, and every default has a reason. Validation reports every failure with its dotted key path, not just the first.

| Key | Type | Required | Default (reason) | Validation |
|---|---|---|---|---|
| `site.origin` | string | yes | — | `https://host[:port]`, no path, query or trailing slash |
| `site.name` | string | yes | — | non-empty, single line (it is the llms.txt H1) |
| `site.language` | string | yes | — | BCP 47 tag (`en`, `en-US`) |
| `identity.kind` | `"person"` \| `"organization"` | yes | — | |
| `identity.name` | string | yes | — | non-empty, single line |
| `identity.url` | string | yes | — | absolute http(s) URL |
| `identity.sameAs` | string[] | no | `[]` (no profiles is a valid statement, not an assumption) | absolute http(s) URLs; injected as `rel=me` and JSON-LD `sameAs` |
| `identity.organization` | table `{ name, url }` | no | absent (a person need not belong to one) | both keys required when present |
| `identity.logo` | string | no | absent (no logo is declared; GeoHarness never guesses one from the site's files) | absolute `https://` URL; JSON-LD `logo` of the entity node (`google-organization`) |
| `identity.email` | string | no | absent (no contact is declared; an address is never inferred) | one plain address (`name@example.com`); JSON-LD `email` of the entity node, which the advisory `signals.contact` check reads |
| `contentSignal.search` | bool | yes | — (a policy choice; never defaulted) | |
| `contentSignal.aiInput` | bool | yes | — | |
| `contentSignal.aiTrain` | bool | yes | — | |
| `bots` | array of tables | yes | — | at least one; a token may appear in only one policy (case-insensitive) |
| `bots[].tokens` | string[] | yes | — | user-agent tokens, no whitespace or `:`; `*` allowed |
| `bots[].group` | `"search"` \| `"user"` \| `"training"` \| `"other"` | yes | — | `search`/`user` tokens are checked by the audit's blocking robots check |
| `bots[].allow` | string[] | no | `[]` (a group may be disallow-only) | each starts with `/` or `*` |
| `bots[].disallow` | string[] | no | `[]` (a group may be allow-only) | each starts with `/` or `*` |
| `content.mainSelector` | string | yes | — | valid CSS selector; when a page has no match its `<body>` is used with a `page.no_main` warning |
| `content.exclude` | string[] | no | `[]` (excluding nothing changes nothing) | route globs starting with `/` |
| `content.sources` | table of string → string[] | no | `{}` (pages keep the lastmod the adapter finds: the git date of a tracked output file or of its source markdown) | keys: route globs starting with `/`; values: non-empty lists of git path globs relative to the site directory (no leading `/`, `:` or `!`, no `..`). See [lastmod](#lastmod) |
| `llms.summary` | string | yes | — | single line (the llms.txt blockquote) |
| `llms.sections` | array of tables | yes | — | may be empty (`[]`) for an llms.txt with no sections |
| `llms.sections[].title` | string | yes | — | single line (an H2) |
| `llms.sections[].routes` | string[] | yes | — | route globs starting with `/` |
| `env` | string[] | no | `[]` (no template may read the environment unless a name is declared) | `[A-Z_][A-Z0-9_]*`, unique |
| `headers.immutable` | string[] | no | `[]` (no asset is assumed to be content-hashed) | Cloudflare `_headers` URL patterns starting with `/` |
| `prerender` | table | no | absent (only sites built with a prerender adapter need it) | |
| `prerender.routes` | string[] | yes, when `[prerender]` is present | — | literal absolute routes (no globs, query or fragment); read by the host's vite-prerender adapter, validated by the core |
| `analytics` | table | no | absent (most sites state no analytics; absent behaves as `cloudflareWebAnalytics = false`, which never loosens the site's CSP) | |
| `analytics.cloudflareWebAnalytics` | bool | yes, when `[analytics]` is present | — (a policy choice; never defaulted) | true: every `Content-Security-Policy` line of the site's `_headers` admits `https://static.cloudflareinsights.com` in `script-src` (and `script-src-elem` when set) and `'self'` plus `https://cloudflareinsights.com` in `connect-src`; a missing directive is created from its `default-src` fallback, so nothing else changes. Reported as the `headers.csp_extended` warning. false: the live audit fails (`index.live_beacon`) if Cloudflare injects the beacon anyway |
| `certificates` | array of tables | no | `[]` (absent: the site serves no certificate GeoHarness renews) | see [Certificates](#certificates); each `path` at most once |
| `certificates[].domain` | string | yes | — | the certificate's one name: a lower-case host name, two or more labels, no wildcard; its zone must be on the Cloudflare account (DNS-01) |
| `certificates[].path` | string | yes | — | output-relative path without extension, served as `<path>.pem` and `<path>.key`: `/`-separated segments of `[A-Za-z0-9._-]`, no leading or trailing `/`, no `.` or `..` segment |
| `certificates[].renewWithinDays` | integer | yes | — | 1–89: renew when `notAfter − now ≤ renewWithinDays` days (Let's Encrypt certificates last 90) |
| `certificates[].keyType` | `"ec-256"` \| `"ec-384"` \| `"rsa-2048"` \| `"rsa-3072"` \| `"rsa-4096"` | yes | — | |
| `certificates[].acmeDirectory` | `"production"` \| `"staging"` | yes | — | Let's Encrypt production, or staging (untrusted certificates, for tests) |
| `certificates[].acmeEmail` | string | yes | — | one plain address; the ACME account contact |

## Certificates

A site can serve a TLS certificate and its private key as files — for example a certificate for a name that
resolves to `127.0.0.1`, which a local agent downloads to accept `wss://` from an HTTPS page. GeoHarness keeps each
`[[certificates]]` pair renewed:

```toml
[[certificates]]
domain = "local.example.com"
path = "agent/loopback"            # served as /agent/loopback.pem and /agent/loopback.key
renewWithinDays = 30
keyType = "ec-256"
acmeDirectory = "production"
acmeEmail = "security@example.com"
```

The `certificates` stage runs after `build` and before `process`, so the pair is part of the tree that is audited,
Lighthouse-tested and deployed. The stage owns `<path>.pem` and `<path>.key`: a build that produces either is an
error. For each entry it fetches the pair the site serves now (`<origin>/<path>.pem` and `.key`) and:

- **keeps** it, byte for byte, when the certificate is for `domain` (its only SAN), the key matches it, and more than
  `renewWithinDays` days are left;
- **renews** it otherwise — inside the window, expired, missing (404), unparsable, for another name, with a key that
  does not match, or every time with `certificate-renewal: force`. Renewal runs the pinned
  [lego](https://github.com/go-acme/lego) (its sha256 is checked before it runs) with DNS-01 through Cloudflare:
  the API token reaches lego only as the environment variable `CF_DNS_API_TOKEN`, never on its command line, and
  lego's account, binary and the new key live in a directory under `RUNNER_TEMP` that is deleted afterwards. The
  token needs Zone Read and DNS Write on the zone of `domain` (feature `certificates`, probed in preflight).

A renewal that fails while the live certificate is still valid is a **warning**: the live pair ships, so a renewal
failure never takes a working site down; the job summary says "renewal failed, kept old" and the next run tries
again. It fails the run only when the live pair is expired, missing or unusable. Any HTTP status other than 200
or 404 for the live pair stops the run rather than renewing.

A dry run (`deploy: false`) never issues — no token, no Let's Encrypt rate limits — and reports "would renew"; it
still puts the live pair in the tree, so the preview matches production.

The action input `certificate-renewal` (`auto` or `force`) is required when `[[certificates]]` is present and an
error when it is not. After deploy, the live check `certificates.served` confirms that `<path>.pem` serves the
deployed certificate (same SHA-256 fingerprint, key matching) with more than `renewWithinDays` left (a pair kept
after a failed renewal only has to be unexpired); otherwise `rollback-on-failure` applies, as for the other live
checks.

## Globs

`content.exclude` and `llms.sections[].routes` are matched against page routes: `*` matches within one path segment, `**` across segments, everything else is literal (`/blog/**`, `/docs/*/`).

`headers.immutable` entries are written verbatim as `_headers` URL patterns, so `*` there is Cloudflare's splat, which crosses `/`.

## lastmod

`lastmod` in `sitemap.xml`, the twin frontmatter and `{{geo.lastmod}}` is a git commit date, never the current time. Adapters date a page by the last commit of its output file when the output is committed, or of the markdown it was generated from (python adapter). Built output is usually gitignored, so for `npm`, `vite-prerender`, `sveltekit-static` and `command` sites map routes to their sources:

```toml
[content]
mainSelector = "main"
sources = { "/" = ["src/pages/index.astro"], "/blog/**" = ["content/blog/**", "src/layouts/Post.astro"] }
```

GeoHarness asks git for the newest commit touching each source glob (`git log -1 -- ':(glob)<glob>'`, run in the site directory). A page takes the newest date among the globs of every entry whose route glob matches it, which overrides the adapter's date. The dates need full history: in a shallow clone (`actions/checkout`'s default `fetch-depth: 1`) every glob's newest commit is the tip, so with `sources` set GeoHarness checks `git rev-parse --is-shallow-repository` and stops before processing; check out with `fetch-depth: 0`. A page no entry maps keeps the adapter's date; pages left with none are listed in one `page.no_lastmod` warning and their sitemap entries go without `<lastmod>`. There is deliberately no fallback to "the last commit anywhere in the site": that date moves for every edit, which would claim every page changed and teach crawlers to ignore the field.

## Templates

Page HTML and adapter-supplied markdown may contain `{{geo.build_id}}`, `{{geo.lastmod}}` and `{{env.NAME}}` (whitespace inside the braces is allowed). `NAME` must be listed in `env`; reading an undeclared name is an error, never an empty string. Other `{{...}}` text is left untouched.

## Example

See [`fixtures/core/site/geoharness.toml`](../fixtures/core/site/geoharness.toml).
