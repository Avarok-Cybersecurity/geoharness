//! Heading-led sections of main content, measured for quotability: how many
//! of their sentences fall in a quotable length band, and whether they hold
//! a list (the audit's `extract.quotable_sections`).

use scraper::{ElementRef, Selector};

use super::extract::MainContent;
use super::text::visible_text;

/// One `h2`–`h6` and the content up to the next such heading.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Section {
    pub heading: String,
    /// Sentences of the section's paragraphs, as word counts.
    pub sentence_words: Vec<usize>,
    /// The section holds a `<ul>` or `<ol>`.
    pub has_list: bool,
}

impl Section {
    /// Sentences whose word count lies in `range`.
    pub fn sentences_in(&self, range: std::ops::RangeInclusive<usize>) -> usize {
        self.sentence_words
            .iter()
            .filter(|w| range.contains(w))
            .count()
    }

    /// No paragraph and no list: a heading directly followed by another.
    pub fn is_empty(&self) -> bool {
        self.sentence_words.is_empty() && !self.has_list
    }
}

/// Word counts of the sentences of `text`: a sentence ends at `.`, `!` or
/// `?` followed by whitespace or the end of the text.
pub fn sentence_words(text: &str) -> Vec<usize> {
    let mut out = Vec::new();
    let mut words = 0;
    for word in text.split_whitespace() {
        words += 1;
        if word.ends_with(['.', '!', '?']) {
            out.push(words);
            words = 0;
        }
    }
    if words > 0 {
        out.push(words);
    }
    out
}

fn is_heading(name: &str) -> bool {
    matches!(name, "h2" | "h3" | "h4" | "h5" | "h6")
}

impl MainContent<'_> {
    /// Sections led by `h2`–`h6`, in document order. Text before the first
    /// such heading belongs to no section.
    pub fn sections(&self) -> Vec<Section> {
        let Ok(sel) = Selector::parse("h2, h3, h4, h5, h6, p, ul, ol") else {
            return Vec::new();
        };
        let mut out: Vec<Section> = Vec::new();
        for el in self.element.select(&sel) {
            let name = el.value().name();
            if is_heading(name) {
                out.push(Section {
                    heading: visible_text(el),
                    sentence_words: Vec::new(),
                    has_list: false,
                });
                continue;
            }
            let Some(current) = out.last_mut() else {
                continue;
            };
            if name == "p" && !inside_list(el) {
                current
                    .sentence_words
                    .extend(sentence_words(&visible_text(el)));
            } else if name != "p" {
                current.has_list = true;
            }
        }
        out
    }
}

fn inside_list(el: ElementRef<'_>) -> bool {
    el.ancestors()
        .filter_map(ElementRef::wrap)
        .any(|a| matches!(a.value().name(), "ul" | "ol"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::html::Page;

    #[test]
    fn splits_sentences_and_sections() {
        assert_eq!(sentence_words("One two. Three four five! Six"), [2, 3, 1]);
        let page = Page::parse(
            "<main><p>Intro.</p><h2>A</h2><p>One two three. Four.</p><h2>B</h2><ul><li><p>x y.</p></li></ul><h2>C</h2><h3>D</h3><p>e</p></main>",
        );
        let s = page.main("main").sections();
        let heads: Vec<&str> = s.iter().map(|x| x.heading.as_str()).collect();
        assert_eq!(heads, ["A", "B", "C", "D"]);
        assert_eq!(s[0].sentence_words, [3, 1]);
        assert!(s[1].has_list && s[1].sentence_words.is_empty());
        assert!(s[2].is_empty());
        assert_eq!(s[0].sentences_in(2..=3), 1);
    }
}
