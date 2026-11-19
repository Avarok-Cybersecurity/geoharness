//! sitemap.xml. `lastmod` appears only when the host supplied one (git
//! date); `GeoHarness` never invents a date.

/// One `<url>` entry.
pub struct Entry<'a> {
    pub loc: String,
    pub lastmod: Option<&'a str>,
}

/// XML text/attribute escape.
pub fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Renders the sitemap for `entries` in the given order.
pub fn render(entries: &[Entry<'_>]) -> String {
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n",
    );
    for e in entries {
        out.push_str("  <url>\n");
        out.push_str(&format!("    <loc>{}</loc>\n", xml_escape(&e.loc)));
        if let Some(l) = e.lastmod {
            out.push_str(&format!("    <lastmod>{}</lastmod>\n", xml_escape(l)));
        }
        out.push_str("  </url>\n");
    }
    out.push_str("</urlset>\n");
    out
}
