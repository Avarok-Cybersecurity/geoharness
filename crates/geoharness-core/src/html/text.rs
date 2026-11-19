//! Visible-text extraction shared by the twin, the audit and RAG edges.

use scraper::{ElementRef, Node};

/// Elements whose text is never visible content.
const INVISIBLE: [&str; 6] = ["script", "style", "noscript", "template", "svg", "head"];

/// Visible text of `el`, whitespace-collapsed, block boundaries as spaces.
pub fn visible_text(el: ElementRef<'_>) -> String {
    let mut out = String::new();
    push_text(el, &mut out);
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn push_text(el: ElementRef<'_>, out: &mut String) {
    if INVISIBLE.contains(&el.value().name()) {
        return;
    }
    for child in el.children() {
        match child.value() {
            Node::Text(t) => out.push_str(t),
            Node::Element(_) => {
                if let Some(c) = ElementRef::wrap(child) {
                    out.push(' ');
                    push_text(c, out);
                    out.push(' ');
                }
            }
            _ => {}
        }
    }
}
