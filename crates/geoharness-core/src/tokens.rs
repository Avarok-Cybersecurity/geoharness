//! Token estimate for `PageSummary.tokens` and the twin frontmatter.
//!
//! Method: `ceil(utf8_bytes / 4)`. This is an *estimate*, not a tokenizer:
//! English prose averages roughly four bytes per token in common BPE
//! vocabularies, and code or non-Latin scripts deviate from that. It is used
//! only to show readers the relative size of a page, never for limits.

/// Estimated tokens of `text`.
pub fn estimate(text: &str) -> u32 {
    u32::try_from(text.len().div_ceil(4)).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    #[test]
    fn rounds_up() {
        assert_eq!(super::estimate(""), 0);
        assert_eq!(super::estimate("abcde"), 2);
    }
}
