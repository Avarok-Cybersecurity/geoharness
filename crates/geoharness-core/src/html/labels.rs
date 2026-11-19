//! Accessible names for links that carry no text.
//!
//! An icon-only link (`<a aria-label="GitHub"><svg>…</svg></a>`) converts to
//! `[](url)`: the twin keeps the URL but loses what it is. When a link's
//! visible text is empty, its content is replaced by the first non-empty of
//! `aria-label`, `title` and the `alt` of an image inside it, the order in
//! which those name the link to a screen reader. A link with no name at all is
//! left as it is.

use scraper::node::Text;
use scraper::{ElementRef, Html, Node, Selector};

use super::text::visible_text;

fn attr(el: ElementRef<'_>, name: &str) -> Option<String> {
    el.value()
        .attr(name)
        .map(|v| v.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|v| !v.is_empty())
}

fn name_of(link: ElementRef<'_>, img: &Selector) -> Option<String> {
    attr(link, "aria-label")
        .or_else(|| attr(link, "title"))
        .or_else(|| link.select(img).find_map(|i| attr(i, "alt")))
}

/// `fragment` with every text-less `a[href]` given its accessible name as text.
pub fn label_textless_links(fragment: &str) -> String {
    let (Ok(links), Ok(img)) = (Selector::parse("a[href]"), Selector::parse("img[alt]")) else {
        return fragment.to_owned();
    };
    let mut doc = Html::parse_fragment(fragment);
    let named: Vec<_> = doc
        .select(&links)
        .filter(|a| visible_text(*a).is_empty())
        .filter_map(|a| name_of(a, &img).map(|n| (a.id(), n)))
        .collect();
    if named.is_empty() {
        return fragment.to_owned();
    }
    for (id, name) in named {
        let Some(mut link) = doc.tree.get_mut(id) else {
            continue;
        };
        while let Some(mut child) = link.first_child() {
            child.detach();
        }
        link.append(Node::Text(Text {
            text: name.as_str().into(),
        }));
    }
    doc.root_element().inner_html()
}

/// Visible text of `fragment` after [`label_textless_links`]: the words a twin
/// converted from it carries, for the markdown/HTML equivalence check.
pub fn text_with_link_names(fragment: &str) -> String {
    visible_text(Html::parse_fragment(&label_textless_links(fragment)).root_element())
}

#[cfg(test)]
mod tests {
    use super::label_textless_links;
    use crate::html::markdown::to_markdown;

    fn md(html: &str) -> String {
        to_markdown(&label_textless_links(html)).unwrap_or_default()
    }

    #[test]
    fn names_icon_links_in_accessible_name_order() {
        let html = "<p><a href=\"/a\" aria-label=\"GitHub\" title=\"t\"><svg><title>x</title></svg></a> \
            <a href=\"/b\" title=\"Mail\"><i class=\"icon\"></i></a> \
            <a href=\"/c\"><img src=\"/i.svg\" alt=\"R&eacute;sum&eacute; [CV]\"></a> \
            <a href=\"/d\"><img src=\"/i.svg\" alt=\"\"></a> \
            <a href=\"/e\" aria-label=\"ignored\">Text wins</a></p>";
        assert_eq!(
            md(html),
            "[GitHub](/a \"t\") [Mail](/b \"Mail\") [Résumé \\[CV\\]](/c) [![](/i.svg)](/d) [Text wins](/e)"
        );
    }

    #[test]
    fn leaves_fragments_without_textless_links_untouched() {
        let html = "<p>a <b>b</b></p><table><tr><td>c</td></tr></table>";
        assert_eq!(label_textless_links(html), html);
    }
}
