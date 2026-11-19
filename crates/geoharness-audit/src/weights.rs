//! The GEO score's categories, weights and thresholds — the single place
//! they are defined. Scores take their weights from [`CATEGORIES`]; each
//! check's title, severity and citations are in [`crate::catalog`].
//!
//! Why these weights. The survey of 45 GEO studies (`martinez-2026`) finds
//! no content technique with a stable cross-platform effect; relevance and
//! position are the reproducible levers, and a page that cannot be fetched,
//! indexed or extracted has neither. Rewrite-style GEO tactics mostly fail
//! under benchmark conditions (`cseo-bench-2025`, `sageo-2026`). So 80 of 100
//! points sit on access, indexability and markdown delivery — checks backed
//! by grade A platform documentation — and those checks are *blocking*. The
//! remaining 20 points are advisory heuristics from grade B/C measurements
//! that may move citations but have not been shown to do so causally.
//! For comparison, prior art (`geo-new`) puts 15% on AI access and 57% on
//! content and brand heuristics; `GeoHarness` inverts that on the evidence above.

pub struct Category {
    pub id: &'static str,
    pub title: &'static str,
    pub weight: f64,
}

pub const CATEGORIES: [Category; 5] = [
    // Agents read text only (`peec-how-deep-research-reads-2026`); robots and
    // bot challenges decide whether they read at all (`cf-bot-fight-mode`).
    Category {
        id: "access",
        title: "AI access",
        weight: 30.0,
    },
    // Generative search rests on core Search eligibility (`google-ai-guide-2026`).
    Category {
        id: "indexability",
        title: "Indexability",
        weight: 25.0,
    },
    // Markdown served by negotiation and equivalent to the HTML: what agents
    // that ask for markdown receive (`checkly-2026`, `evilmartians-2026`),
    // and the guard against cloaking (`google-spam-policies`).
    Category {
        id: "delivery",
        title: "Markdown delivery",
        weight: 25.0,
    },
    // Grade C reading-budget and position measurements; advisory.
    Category {
        id: "extractability",
        title: "Extractability (advisory)",
        weight: 12.0,
    },
    // Shown not to move AI citations (grade B); kept for completeness.
    Category {
        id: "signals",
        title: "Optional signals (advisory)",
        weight: 8.0,
    },
];

/// Visible body text below this many characters is an empty SPA shell.
/// Shells render nothing or a one-line notice (Create React App's noscript
/// notice is 46 characters, and `<noscript>` text is not counted anyway);
/// 100 leaves margin above that without failing short real pages.
pub const SPA_MIN_TEXT_CHARS: usize = 100;
/// Weighted-Jaccard word overlap a twin must reach (see `equivalence`).
/// 0.8 tolerates link text, alt text and adapter-source markdown wording
/// differences while failing a twin that omits a fifth of the page.
pub const TWIN_MIN_OVERLAP: f64 = 0.8;
/// `peec-reading-budget-2026`: link-count bands and the first-read window.
pub const LINKS_FULL_CREDIT_BELOW: usize = 20;
pub const LINKS_NO_CREDIT_FROM: usize = 60;
pub const FIRST_WINDOW_CHARS: usize = 5_700;
/// `indig-2026`: share of the page in which citations concentrate.
pub const ENTITY_WINDOW_PERCENT: usize = 30;
/// Search and user agents whose access is blocking (in addition to the
/// config's `search`/`user` groups).
pub const MUST_ADMIT: [&str; 8] = [
    "Googlebot",
    "Bingbot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "Claude-SearchBot",
    "Claude-User",
    "PerplexityBot",
    "Perplexity-User",
];
/// Body markers of a bot challenge instead of content.
pub const CHALLENGE_MARKERS: [&str; 4] = [
    "challenge-platform",
    "cf-chl",
    "Just a moment...",
    "Attention Required!",
];
