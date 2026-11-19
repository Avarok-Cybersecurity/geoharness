//! Facts read from a page with a full HTML5 parser (`scraper`).

use scraper::{ElementRef, Html, Selector};

use super::text::visible_text;

/// A parsed page plus its main-content selector.
pub struct Page {
    doc: Html,
}

/// What the page's `<head>` already declares (drives fill-only injection).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct HeadFacts {
    pub title: Option<String>,
    pub description: Option<String>,
    pub canonical: Option<String>,
    pub has_markdown_alternate: bool,
    pub has_describedby: bool,
    /// `property`/`name` values of present `og:*` and `twitter:*` metas.
    pub social: Vec<String>,
    pub json_ld: Vec<String>,
    pub build: Option<String>,
    pub rel_me: Vec<String>,
    pub noindex: bool,
}

/// The main-content element (or `<body>` when the selector matched nothing).
pub struct MainContent<'a> {
    pub element: ElementRef<'a>,
    pub matched_selector: bool,
}

fn sel(s: &str) -> Option<Selector> {
    Selector::parse(s).ok()
}

fn first_attr(doc: &Html, selector: &str, attr: &str) -> Option<String> {
    let s = sel(selector)?;
    doc.select(&s)
        .find_map(|e| e.attr(attr))
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

fn all_attrs(doc: &Html, selector: &str, attr: &str) -> Vec<String> {
    sel(selector).map_or_else(Vec::new, |s| {
        doc.select(&s)
            .filter_map(|e| e.attr(attr).map(|v| v.trim().to_owned()))
            .collect()
    })
}

fn rel_has(doc: &Html, rel: &str, extra: impl Fn(ElementRef<'_>) -> bool) -> Vec<String> {
    sel("link[rel]").map_or_else(Vec::new, |s| {
        doc.select(&s)
            .filter(|e| {
                e.attr("rel").is_some_and(|r| {
                    r.split_ascii_whitespace()
                        .any(|t| t.eq_ignore_ascii_case(rel))
                }) && extra(*e)
            })
            .map(|e| e.attr("href").unwrap_or("").trim().to_owned())
            .collect()
    })
}

impl Page {
    pub fn parse(html: &str) -> Self {
        Self {
            doc: Html::parse_document(html),
        }
    }

    pub fn head(&self) -> HeadFacts {
        let d = &self.doc;
        let title = sel("title")
            .and_then(|s| d.select(&s).next().map(visible_title))
            .filter(|t| !t.is_empty());
        let robots = first_attr(d, r#"meta[name="robots" i]"#, "content").unwrap_or_default();
        let mut social = all_attrs(d, r#"meta[property^="og:"]"#, "property");
        social.extend(all_attrs(d, r#"meta[name^="twitter:"]"#, "name"));
        HeadFacts {
            title,
            description: first_attr(d, r#"meta[name="description" i]"#, "content"),
            canonical: rel_has(d, "canonical", |_| true)
                .into_iter()
                .find(|h| !h.is_empty()),
            has_markdown_alternate: !rel_has(d, "alternate", |e| {
                e.attr("type")
                    .is_some_and(|t| t.eq_ignore_ascii_case("text/markdown"))
            })
            .is_empty(),
            has_describedby: !rel_has(d, "describedby", |_| true).is_empty(),
            social,
            json_ld: sel(r#"script[type="application/ld+json" i]"#).map_or_else(Vec::new, |s| {
                d.select(&s)
                    .map(|e| e.inner_html().trim().to_owned())
                    .collect()
            }),
            build: first_attr(d, r#"meta[name="build"]"#, "content"),
            rel_me: rel_has(d, "me", |_| true),
            noindex: robots.to_ascii_lowercase().contains("noindex"),
        }
    }

    /// The element matched by `main_selector`, else `<body>`, else the root.
    pub fn main(&self, main_selector: &str) -> MainContent<'_> {
        if let Some(element) = sel(main_selector).and_then(|s| self.doc.select(&s).next()) {
            return MainContent {
                element,
                matched_selector: true,
            };
        }
        let element = sel("body")
            .and_then(|s| self.doc.select(&s).next())
            .unwrap_or_else(|| self.doc.root_element());
        MainContent {
            element,
            matched_selector: false,
        }
    }

    /// Visible text of `<body>` (the whole document when there is none).
    pub fn body_text(&self) -> String {
        let body = sel("body").and_then(|s| self.doc.select(&s).next());
        visible_text(body.unwrap_or_else(|| self.doc.root_element()))
    }

    /// Every `<a href>` in the document, in order.
    pub fn all_links(&self) -> Vec<String> {
        all_attrs(&self.doc, "a[href]", "href")
    }

    /// Every `<a href>` in the document as `(href, visible text)`, in order.
    pub fn anchors(&self) -> Vec<(String, String)> {
        sel("a[href]").map_or_else(Vec::new, |s| {
            self.doc
                .select(&s)
                .map(|e| {
                    (
                        e.attr("href").unwrap_or("").trim().to_owned(),
                        visible_text(e),
                    )
                })
                .collect()
        })
    }
}

impl MainContent<'_> {
    pub fn text(&self) -> String {
        visible_text(self.element)
    }

    /// Visible text with text-less links named as the twin names them
    /// (`labels`): what the twin of this content is compared against.
    pub fn text_with_link_names(&self) -> String {
        super::labels::text_with_link_names(&self.element.inner_html())
    }

    pub fn links(&self) -> Vec<String> {
        sel("a[href]").map_or_else(Vec::new, |s| {
            self.element
                .select(&s)
                .filter_map(|e| e.attr("href").map(|h| h.trim().to_owned()))
                .collect()
        })
    }

    /// Text of `h1`–`h6` inside main content, in document order.
    pub fn headings(&self) -> Vec<(u8, String)> {
        sel("h1, h2, h3, h4, h5, h6").map_or_else(Vec::new, |s| {
            self.element
                .select(&s)
                .map(|e| {
                    let level = e.value().name().as_bytes().get(1).map_or(0, |b| b - b'0');
                    (level, visible_text(e))
                })
                .collect()
        })
    }

    pub fn count(&self, selector: &str) -> usize {
        sel(selector).map_or(0, |s| self.element.select(&s).count())
    }

    pub fn inner_html(&self) -> String {
        self.element.inner_html()
    }
}

fn visible_title(e: ElementRef<'_>) -> String {
    e.text()
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
