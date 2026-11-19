//! Markdown/HTML equivalence: the weighted Jaccard overlap of normalized word
//! multisets, `Σ min(a_w, b_w) / Σ max(a_w, b_w)`. Words are lowercased runs of
//! alphanumeric characters. Markdown link and image targets, code-fence info
//! strings and frontmatter/JSON-LD are removed from the twin first, because
//! they are markup rather than prose. 1.0 means the same words, same counts.

use std::collections::BTreeMap;

use geoharness_core::twin::prose;

fn words(text: &str) -> BTreeMap<String, u32> {
    let mut out = BTreeMap::new();
    for w in text
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
    {
        *out.entry(w.to_lowercase()).or_insert(0) += 1;
    }
    out
}

/// Removes `](target)` link/image targets and fence info strings.
fn strip_markup(md: &str) -> String {
    let mut out = String::with_capacity(md.len());
    for line in md.lines() {
        if line.trim_start().starts_with("```") {
            out.push('\n');
            continue;
        }
        let mut rest = line;
        while let Some(i) = rest.find("](") {
            out.push_str(&rest[..i]);
            let after = &rest[i + 2..];
            rest = after.find(')').map_or("", |j| &after[j + 1..]);
        }
        out.push_str(rest);
        out.push('\n');
    }
    out
}

/// Overlap of `html_text` (the page's main-content text) and `twin`.
pub fn overlap(html_text: &str, twin: &str) -> f64 {
    let a = words(html_text);
    let b = words(&strip_markup(&prose(twin)));
    let (mut min, mut max) = (0u32, 0u32);
    for key in a.keys().chain(b.keys().filter(|k| !a.contains_key(*k))) {
        let (x, y) = (
            a.get(key).copied().unwrap_or(0),
            b.get(key).copied().unwrap_or(0),
        );
        min += x.min(y);
        max += x.max(y);
    }
    if max == 0 {
        1.0
    } else {
        f64::from(min) / f64::from(max)
    }
}

#[cfg(test)]
mod tests {
    use super::overlap;

    #[test]
    fn identical_prose_with_markup_is_equivalent() {
        let twin = "---\ntitle: \"x\"\n---\n\n# Hello\n\nSee [the guide](https://a.b/c/).\n\n```json\n{\"z\":1}\n```\n";
        assert!((overlap("Hello See the guide.", twin) - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn missing_half_is_divergent() {
        assert!(overlap("one two three four", "one two") < 0.6);
    }
}
