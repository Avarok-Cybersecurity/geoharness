//! Main content → markdown with `htmd` (`htmd` citation). Tables and fenced
//! code are kept because structure beats flattened text for retrieval
//! (`htmlrag-2025`).

use htmd::HtmlToMarkdown;
use htmd::options::{
    BulletListMarker, CodeBlockFence, CodeBlockStyle, HeadingStyle, HrStyle, Options,
};

use crate::error::Error;

fn converter() -> HtmlToMarkdown {
    let options = Options {
        heading_style: HeadingStyle::Atx,
        hr_style: HrStyle::Dashes,
        code_block_style: CodeBlockStyle::Fenced,
        code_block_fence: CodeBlockFence::Backticks,
        bullet_list_marker: BulletListMarker::Dash,
        ul_bullet_spacing: 1,
        ol_number_spacing: 1,
        ..Options::default()
    };
    HtmlToMarkdown::builder()
        .options(options)
        .skip_tags(vec![
            "script", "style", "noscript", "template", "svg", "iframe",
        ])
        .build()
}

/// Converts an HTML fragment (main content's inner HTML) to markdown.
pub fn to_markdown(fragment: &str) -> Result<String, Error> {
    converter()
        .convert(fragment)
        .map(|md| md.trim().to_owned())
        .map_err(|e| Error::Html(format!("markdown conversion failed: {e}")))
}

#[cfg(test)]
mod tests {
    use super::to_markdown;

    #[test]
    fn keeps_tables_fences_and_nesting() {
        let html = "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>\
            <pre><code class=\"language-rust\">fn main() {}\n</code></pre>\
            <ul><li>one<ul><li>inner</li></ul></li></ul>";
        let md = to_markdown(html).unwrap_or_default();
        assert!(md.contains("| A | B |"), "{md}");
        assert!(md.contains("```rust\nfn main() {}\n```"), "{md}");
        assert!(md.contains("- one\n  - inner"), "{md}");
    }
}
