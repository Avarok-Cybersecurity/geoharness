//! Every check's definition: id, title, category (see [`crate::weights`]),
//! severity and the CITATIONS.md ids its finding carries. Blocking checks are
//! the access/indexability ones backed by grade A/B evidence.

use crate::types::Severity::{self, Advisory, Blocking};

pub struct Check {
    pub id: &'static str,
    pub title: &'static str,
    pub category: &'static str,
    pub severity: Severity,
    pub citations: &'static [&'static str],
}

const BOTS: &[&str] = &[
    "openai-bots",
    "anthropic-bots",
    "perplexity-bots",
    "google-ai-guide-2026",
];

pub const SPA_SHELL: Check = Check {
    id: "access.spa_shell",
    title: "Page has server-rendered text",
    category: "access",
    severity: Blocking,
    citations: &["peec-how-deep-research-reads-2026", "google-ai-guide-2026"],
};
pub const ROBOTS_BOTS: Check = Check {
    id: "access.robots_bots",
    title: "robots.txt admits search and user agents",
    category: "access",
    severity: Blocking,
    citations: BOTS,
};
pub const LIVE_AI_AGENTS: Check = Check {
    id: "access.live_ai_agents",
    title: "AI user agents get HTTP 200, not a challenge",
    category: "access",
    severity: Blocking,
    citations: &[
        "cf-bot-fight-mode",
        "openai-bots",
        "anthropic-bots",
        "perplexity-bots",
    ],
};
pub const TITLE: Check = Check {
    id: "index.title",
    title: "Page has a <title>",
    category: "indexability",
    severity: Blocking,
    citations: &["google-ai-guide-2026"],
};
pub const DESCRIPTION: Check = Check {
    id: "index.description",
    title: "Page has a meta description",
    category: "indexability",
    severity: Blocking,
    citations: &["google-ai-guide-2026"],
};
pub const CANONICAL: Check = Check {
    id: "index.canonical",
    title: "Page has a canonical link",
    category: "indexability",
    severity: Blocking,
    citations: &["google-ai-guide-2026"],
};
pub const BROKEN_LINKS: Check = Check {
    id: "index.broken_links",
    title: "Internal links resolve",
    category: "indexability",
    severity: Blocking,
    citations: &["google-ai-guide-2026"],
};
pub const LIVE_BUILD: Check = Check {
    id: "index.live_build",
    title: "Live site serves this build",
    category: "indexability",
    severity: Blocking,
    citations: &["cf-workers-static-assets"],
};
pub const CSP_ROBOTS: Check = Check {
    id: "index.csp_robots",
    title: "CSP lets the page fetch /robots.txt (Lighthouse SEO)",
    category: "indexability",
    severity: Blocking,
    citations: &["lighthouse-robots-txt", "w3c-csp3"],
};
pub const LIVE_BEACON: Check = Check {
    id: "index.live_beacon",
    title: "No Cloudflare Web Analytics beacon the CSP was not extended for",
    category: "indexability",
    severity: Blocking,
    citations: &["cf-web-analytics", "lighthouse-errors-in-console"],
};
pub const TWIN: Check = Check {
    id: "delivery.twin",
    title: "Markdown twin exists and matches the page",
    category: "delivery",
    severity: Blocking,
    citations: &["google-spam-policies", "llmstxt-spec", "htmlrag-2025"],
};
pub const LIVE_NEGOTIATION: Check = Check {
    id: "delivery.live_negotiation",
    title: "Accept: text/markdown gets markdown with Vary: Accept",
    category: "delivery",
    severity: Blocking,
    citations: &[
        "cf-markdown-for-agents",
        "cf-transform-rules",
        "checkly-2026",
    ],
};
pub const LIVE_FILES: Check = Check {
    id: "delivery.live_files",
    title: "HTML pages, robots.txt, llms.txt and sitemap.xml are served correctly",
    category: "delivery",
    severity: Blocking,
    citations: &["cf-content-signals", "llmstxt-spec"],
};
pub const LINK_COUNT: Check = Check {
    id: "extract.link_count",
    title: "Few links (<20) so the first read covers the page",
    category: "extractability",
    severity: Advisory,
    citations: &["peec-reading-budget-2026"],
};
pub const FRONT_LOADED: Check = Check {
    id: "extract.front_loaded",
    title: "Main content starts within the first ~5,700 characters",
    category: "extractability",
    severity: Advisory,
    citations: &["peec-reading-budget-2026"],
};
pub const ENTITY_EARLY: Check = Check {
    id: "extract.entity_early",
    title: "Entity named in the first 30% of the content",
    category: "extractability",
    severity: Advisory,
    citations: &["indig-2026"],
};
pub const QUESTION_HEADINGS: Check = Check {
    id: "extract.question_headings",
    title: "A heading is phrased as a question",
    category: "extractability",
    severity: Advisory,
    citations: &["what-gets-cited-2026", "sageo-2026"],
};
pub const VISIBLE_DATE: Check = Check {
    id: "extract.visible_date",
    title: "A date is visible in the content",
    category: "extractability",
    severity: Advisory,
    citations: &["what-gets-cited-2026"],
};
pub const TABLES_KEPT: Check = Check {
    id: "extract.tables_kept",
    title: "Tables survive into the twin",
    category: "extractability",
    severity: Advisory,
    citations: &["htmlrag-2025"],
};
pub const LLMS_TXT: Check = Check {
    id: "signals.llms_txt",
    title: "llms.txt is present and well-formed",
    category: "signals",
    severity: Advisory,
    citations: &[
        "llmstxt-spec",
        "ahrefs-llmstxt-2026",
        "seranking-llmstxt-2026",
    ],
};
pub const JSON_LD: Check = Check {
    id: "signals.json_ld",
    title: "JSON-LD is present and valid",
    category: "signals",
    severity: Advisory,
    citations: &["ahrefs-schema-2026", "google-ai-guide-2026"],
};

/// Every check, for the definition and citation tests.
pub const CHECKS: &[&Check] = &[
    &SPA_SHELL,
    &ROBOTS_BOTS,
    &LIVE_AI_AGENTS,
    &TITLE,
    &DESCRIPTION,
    &CANONICAL,
    &BROKEN_LINKS,
    &LIVE_BUILD,
    &CSP_ROBOTS,
    &LIVE_BEACON,
    &TWIN,
    &LIVE_NEGOTIATION,
    &LIVE_FILES,
    &LINK_COUNT,
    &FRONT_LOADED,
    &ENTITY_EARLY,
    &QUESTION_HEADINGS,
    &VISIBLE_DATE,
    &TABLES_KEPT,
    &LLMS_TXT,
    &JSON_LD,
];
