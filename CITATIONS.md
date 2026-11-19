# Citations

Every claim GeoHarness relies on — in its design, its GEO score, and its documentation — is listed here.
The README's **Citations** section and the site's /citations/ page are generated from this file (`npm run docs`), and CI fails if they differ.

**Evidence grades**

| Grade | Meaning |
|---|---|
| A | Peer-reviewed, or a primary platform specification/documentation |
| B | Large-sample industry study with published method |
| C | Vendor log analysis or small-sample measurement |
| D | Commentary or single observation; used for context only |

Accessed dates are when the source was read for GeoHarness.

## Research papers

| ID | Source | Grade | Supports |
|---|---|---|---|
| aggarwal-2024 | Aggarwal et al., "GEO: Generative Engine Optimization", KDD 2024. https://arxiv.org/abs/2311.09735 (accessed 2026-11-19) | A | Original GEO lab result: quotations, statistics and citations raise visibility inside a fixed retrieved context; keyword stuffing hurts. Scored as advisory only. |
| cseo-bench-2025 | "C-SEO Bench: Does Conversational SEO Work?", NeurIPS 2025 Datasets & Benchmarks. https://arxiv.org/abs/2506.11097 (accessed 2026-11-19) | A | Most content-rewrite methods are ineffective; classic SEO is more reliable. Why GeoHarness never rewrites prose. |
| sageo-2026 | "SAGEO Arena", KDD 2026. https://arxiv.org/abs/2602.12187 (accessed 2026-11-19) | A | Structural information helps retrieval and reranking; several GEO methods hurt it. |
| martinez-2026 | Martinez, survey of 45 GEO studies, arXiv 2607.14035 (2026). https://arxiv.org/abs/2607.14035 (accessed 2026-11-19) | B (preprint) | No technique shows a stable cross-platform causal effect; relevance and position are the reproducible levers. Basis for weighting access and extractability above content heuristics. |
| what-gets-cited-2026 | "What Gets Cited", arXiv 2605.25517 (2026). https://arxiv.org/abs/2605.25517 (accessed 2026-11-19) | B (preprint) | Relevance and list position dominate; explicit price and a recent timestamp help; formatting-only edits barely matter. Basis for the visible-date check. |
| htmlrag-2025 | Tan et al., "HtmlRAG", WWW 2025. https://arxiv.org/abs/2411.02959 (accessed 2026-11-19) | A | Keeping structure (headings, tables) beats flattening to plain text. Why markdown twins keep tables and headings. |
| cormack-2009 | Cormack, Clarke and Büttcher, "Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods", SIGIR 2009. https://doi.org/10.1145/1571941.1572114 (accessed 2026-11-19) | A | RRF with k = 60, used for LatticeDB hybrid search. |
| robertson-2009 | Robertson and Zaragoza, "The Probabilistic Relevance Framework: BM25 and Beyond", Foundations and Trends in IR, 2009. https://doi.org/10.1561/1500000019 (accessed 2026-11-19) | A | BM25 scoring and the k1/b constants used by LatticeDB's lexical index. |

## Industry studies

| ID | Source | Grade | Supports |
|---|---|---|---|
| ahrefs-schema-2026 | Ahrefs, "We Tracked 1,885 Pages Adding Schema. AI Citations Barely Moved", May 2026. https://ahrefs.com/blog/schema-ai-citations/ (accessed 2026-11-19) | B | JSON-LD gave no significant AI-citation lift. GeoHarness emits minimal JSON-LD for classic search only. |
| ahrefs-llmstxt-2026 | Ahrefs, "We Analyzed 137K Sites: 97% of llms.txt Files Never Get Read", June 2026. https://ahrefs.com/blog/llmstxt-study/ (accessed 2026-11-19) | B | llms.txt is rarely fetched, mostly by coding agents. Generated because it is free, scored as speculative. |
| seranking-llmstxt-2026 | SE Ranking, "LLMs.txt: Why Brands Rely On It and Why It Doesn't Work", 2026. https://seranking.com/blog/llms-txt/ (accessed 2026-11-19) | B | No correlation between llms.txt and AI citations across ~300K domains. |
| peec-reading-budget-2026 | Peec AI, "Deep Research reading budget", June 2026. https://docs.peec.ai/research/deep-research-reading-budget.md (accessed 2026-11-19) | C | First read covers ~78% of content on pages with fewer than 20 links and ~33% with 60 or more; ~5.7K-character first window. Basis for the link-density and front-loading checks (advisory). |
| peec-how-deep-research-reads-2026 | Peec AI, "How Deep Research reads your site", 2026. https://docs.peec.ai/research/how-deep-research-reads-your-site.md (accessed 2026-11-19) | C | Agents read text only and re-read after an in-page match. Basis for the empty-SPA-shell check. |
| indig-2026 | Kevin Indig, "The science of how AI picks its sources", Growth Memo, Feb 2026. https://www.growth-memo.com/p/the-science-of-how-ai-picks-its-sources (accessed 2026-11-19, paywalled) | C | 44.2% of ChatGPT citations come from the first 30% of a page. Sometimes misattributed to SparkToro. |
| checkly-2026 | Checkly, "State of AI agent content negotiation", Feb 2026. https://www.checklyhq.com/blog/state-of-ai-agent-content-negotation/ (accessed 2026-11-19) | C | Which agents send `Accept: text/markdown` (Claude Code, Cursor, OpenCode) and which do not. |
| evilmartians-2026 | Evil Martians, "Which AI actually reads your site: two months of LLM traffic measured", 2026. https://evilmartians.com/chronicles/which-ai-actually-reads-your-site-two-months-of-llm-traffic-measured (accessed 2026-11-19) | C | Claude Code received markdown 88% of the time; ChatGPT-User 0.7%. |

## Platform documentation and specifications

| ID | Source | Grade | Supports |
|---|---|---|---|
| google-ai-guide-2026 | Google Search Central, "AI features and your website" optimization guide, May 2026. https://developers.google.com/search/docs/fundamentals/ai-optimization-guide (accessed 2026-11-19) | A | Generative features rest on core Search eligibility; markdown/AI text files are neither required nor used by Google Search. |
| google-spam-policies | Google Search Central, "Spam policies: cloaking". https://developers.google.com/search/docs/essentials/spam-policies (accessed 2026-11-19) | A | Why GeoHarness negotiates on `Accept`, never on search-crawler user agents, and checks markdown/HTML equivalence. |
| llmstxt-spec | llms.txt proposal. https://llmstxt.org/ (accessed 2026-11-19) | A (spec) | llms.txt format; per-page `.md` convention; `rel="alternate" type="text/markdown"`. |
| cf-content-signals | Cloudflare, "Content Signals Policy". https://blog.cloudflare.com/content-signals-policy/ (accessed 2026-11-19) | A (spec) | `Content-Signal: search, ai-input, ai-train` in robots.txt and headers. |
| cf-markdown-for-agents | Cloudflare docs, "Markdown for Agents". https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/ (accessed 2026-11-19) | A | Plan availability (Pro+), headers (`Vary: Accept`, Content-Signal), 6 MiB limit; GeoHarness reproduces this for free. |
| cf-transform-rules | Cloudflare docs, Transform Rules availability and URL Rewrite parameters. https://developers.cloudflare.com/rules/transform/ and https://developers.cloudflare.com/rules/transform/url-rewrite/reference/parameters/ (accessed 2026-11-19) | A | 10 free rules, `concat` and `wildcard_replace` on all plans, no regex on Free. |
| cf-rules-functions | Cloudflare docs, Rules language functions and header fields. https://developers.cloudflare.com/ruleset-engine/rules-language/functions/ (accessed 2026-11-19) | A | Matching `http.request.headers["accept"]`. |
| cf-phases | Cloudflare docs, Ruleset Engine phases list. https://developers.cloudflare.com/ruleset-engine/reference/phases-list/ (accessed 2026-11-19) | A | Transform runs before cache. |
| cf-workers-static-assets | Cloudflare docs, Workers static assets billing, routing, headers. https://developers.cloudflare.com/workers/static-assets/ (accessed 2026-11-19) | A | Free unlimited asset requests, `run_worker_first`, `_headers` (100 rules). |
| cf-workers-limits | Cloudflare docs, Workers platform limits. https://developers.cloudflare.com/workers/platform/limits/ (accessed 2026-11-19) | A | 100k requests/day, 10 ms CPU, 128 MB memory on Free. |
| cf-pages-limits | Cloudflare docs, Pages limits and Functions pricing. https://developers.cloudflare.com/pages/platform/limits/ (accessed 2026-11-19) | A | Pages Functions share the Workers quota; fail-open option. |
| cf-workers-ai | Cloudflare docs, Workers AI pricing and OpenAI-compatible embeddings. https://developers.cloudflare.com/workers-ai/ (accessed 2026-11-19) | A | 10k free neurons/day; embedding models and dimensions. |
| cf-bot-fight-mode | Cloudflare docs, Bot Fight Mode and verified bots. https://developers.cloudflare.com/bots/get-started/bot-fight-mode/ (accessed 2026-11-19) | A | Why GeoHarness turns it off and verifies AI bots get HTTP 200. |
| cf-managed-robots | Cloudflare docs, managed robots.txt and AI crawler policies. https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/ (accessed 2026-11-19) | A | AI crawler policy defaults. |
| cf-speed | Cloudflare docs, Early Hints, Speed Brain, Tiered Cache, Compression Rules. https://developers.cloudflare.com/speed/ (accessed 2026-11-19) | A | Free speed settings GeoHarness enables. |
| cf-api-permissions | Cloudflare docs, API token permissions. https://developers.cloudflare.com/fundamentals/api/reference/permissions/ (accessed 2026-11-19) | A | `cloudflare-permissions.json`. |
| indexnow | IndexNow documentation. https://www.indexnow.org/documentation (accessed 2026-11-19) | A (spec) | Key file and submission endpoint. |
| openai-bots | OpenAI, "Overview of OpenAI crawlers". https://developers.openai.com/api/docs/bots (accessed 2026-11-19) | A | GPTBot, OAI-SearchBot, ChatGPT-User tokens. |
| anthropic-bots | Anthropic, "Does Anthropic crawl data from the web". https://support.claude.com/en/articles/8896518-what-is-claudebot (accessed 2026-11-19) | A | ClaudeBot, Claude-SearchBot, Claude-User tokens. |
| perplexity-bots | Perplexity, "Perplexity crawlers". https://docs.perplexity.ai/guides/bots (accessed 2026-11-19) | A | PerplexityBot, Perplexity-User tokens. |
| qdrant-query-api | Qdrant docs, hybrid queries, sparse vectors, inference. https://qdrant.tech/documentation/concepts/hybrid-queries/ (accessed 2026-11-19) | A | Request shapes LatticeDB's text, sparse and fusion queries follow. |

## Tools and prior art

| ID | Source | Grade | Supports |
|---|---|---|---|
| markdown-new | markdown.new. https://markdown.new/ (accessed 2026-11-19) | D | Prior art: three-tier HTML-to-markdown conversion, `x-markdown-tokens`, `vary: accept`. |
| geo-new | GEO.new. https://geo.new/ (accessed 2026-11-19) | D | Prior art: category weights for a GEO audit (AI Citability 22%, Content/E-E-A-T 22%, Brand/Entity 20%, AI Access 15%, Schema 13%, Platform 8%). |
| lighthouse-ci | Google, Lighthouse CI. https://github.com/GoogleChrome/lighthouse-ci (accessed 2026-11-19) | A | The Lighthouse gate. |
| htmd | htmd crate. https://crates.io/crates/htmd (accessed 2026-11-19) | A | HTML-to-markdown engine. |
| lol-html | Cloudflare lol_html. https://github.com/cloudflare/lol-html (accessed 2026-11-19) | A | Streaming head injection and link rewriting. |

## Rejected sources

Cited in research GeoHarness was given, checked, and not relied on.

| Claim | Why rejected |
|---|---|
| "Bajemon and Rochet (Sept 2026)" re-evaluation of GEO tactics | No such paper could be found. |
| "SparkToro, January 2026: 44.2% of citations from the first 30% of a page" | The figure is Kevin Indig's (see `indig-2026`), not SparkToro's. |
