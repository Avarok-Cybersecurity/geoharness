//! Advisory per-page content checks taken from prior art (`geo-new`):
//! quotable sections and snippet-length descriptions.

use super::{PageCtx, Scored, pass_fail, scored};
use crate::catalog::{DESCRIPTION_LENGTH, QUOTABLE_SECTIONS};
use crate::weights::{DESCRIPTION_MAX_CHARS, QUOTABLE_MIN_SENTENCES, QUOTABLE_SENTENCE_WORDS};

/// Credit = share of non-empty heading-led sections that have
/// [`QUOTABLE_MIN_SENTENCES`] sentences in [`QUOTABLE_SENTENCE_WORDS`], or
/// a list. A page with no such section is not judged.
pub fn quotable_sections(p: &PageCtx<'_>, main_selector: &str) -> Option<Scored> {
    let sections: Vec<_> = p
        .page
        .main(main_selector)
        .sections()
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect();
    if sections.is_empty() {
        return None;
    }
    let weak: Vec<&str> = sections
        .iter()
        .filter(|s| !s.has_list && s.sentences_in(QUOTABLE_SENTENCE_WORDS) < QUOTABLE_MIN_SENTENCES)
        .map(|s| s.heading.as_str())
        .collect();
    let total = sections.len();
    let good = total - weak.len();
    let credit = f64::from(u32::try_from(good).unwrap_or(0))
        / f64::from(u32::try_from(total).unwrap_or(u32::MAX));
    let evidence = if weak.is_empty() {
        format!("all {total} sections quotable")
    } else {
        format!("{good} of {total} sections quotable; weak: {weak:?}")
    };
    Some(scored(&QUOTABLE_SECTIONS, Some(p.route), credit, evidence))
}

/// Characters of the meta description; a page without one is left to the
/// blocking `index.description`.
pub fn description_length(p: &PageCtx<'_>) -> Option<Scored> {
    let description = p.page.head().description?;
    let chars = description
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .count();
    Some(pass_fail(
        &DESCRIPTION_LENGTH,
        Some(p.route),
        chars <= DESCRIPTION_MAX_CHARS,
        format!("{chars} characters (advisory limit {DESCRIPTION_MAX_CHARS})"),
    ))
}
