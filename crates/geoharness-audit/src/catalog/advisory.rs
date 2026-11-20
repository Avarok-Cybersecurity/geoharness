//! Advisory checks: grade B/C/D evidence, or grade A documentation that
//! shows no measured AI-citation effect. They score (partial credit where
//! bands exist) but never block.

use super::Check;
use crate::types::Severity::Advisory;

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

pub const QUOTABLE_SECTIONS: Check = Check {
    id: "extract.quotable_sections",
    title: "Sections are quotable: two or more 10–25-word sentences, or a list",
    category: "extractability",
    severity: Advisory,
    citations: &["geo-new"],
};
pub const DESCRIPTION_LENGTH: Check = Check {
    id: "signals.description_length",
    title: "Meta description fits a search snippet (≤160 characters)",
    category: "signals",
    severity: Advisory,
    citations: &["google-snippet", "geo-new"],
};
pub const ENTITY_NODE: Check = Check {
    id: "signals.entity_node",
    title: "Home page JSON-LD has an Organization or Person node with sameAs",
    category: "signals",
    severity: Advisory,
    citations: &["google-organization", "ahrefs-schema-2026"],
};
pub const WEBSITE_NODE: Check = Check {
    id: "signals.website_node",
    title: "Home page JSON-LD has a WebSite node",
    category: "signals",
    severity: Advisory,
    citations: &["google-site-names", "ahrefs-schema-2026"],
};
pub const CONTACT: Check = Check {
    id: "signals.contact",
    title: "Home page declares a contact (JSON-LD email or contactPoint, or a mailto:, tel: or contact link)",
    category: "signals",
    severity: Advisory,
    citations: &["google-organization", "geo-new"],
};
pub const TRUST_LINKS: Check = Check {
    id: "signals.trust_links",
    title: "Home page links to an about page, a contact and a privacy policy",
    category: "signals",
    severity: Advisory,
    citations: &["google-helpful-content", "geo-new"],
};
pub const LIVE_LINK_HEADER: Check = Check {
    id: "signals.live_link_header",
    title: "HTTP Link header names the markdown twin (pages) or the canonical page (twins)",
    category: "signals",
    severity: Advisory,
    citations: &["rfc-8288", "llmstxt-spec", "google-canonical-header"],
};
