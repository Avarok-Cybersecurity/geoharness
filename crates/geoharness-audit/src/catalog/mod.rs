//! Every check's definition: id, title, category (see [`crate::weights`]),
//! severity and the CITATIONS.md ids its finding carries. Blocking checks are
//! the access/indexability ones backed by grade A/B evidence.

mod advisory;

pub use advisory::*;

use crate::types::Severity::{self, Blocking};

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
pub const BUILD_META_EARLY: Check = Check {
    id: "index.build_meta_early",
    title: "Build meta sits where the live check reads",
    category: "indexability",
    severity: Blocking,
    citations: &["cf-workers-static-assets"],
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
    &BUILD_META_EARLY,
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
    &QUOTABLE_SECTIONS,
    &LLMS_TXT,
    &JSON_LD,
    &DESCRIPTION_LENGTH,
    &ENTITY_NODE,
    &WEBSITE_NODE,
    &CONTACT,
    &TRUST_LINKS,
    &LIVE_LINK_HEADER,
];
