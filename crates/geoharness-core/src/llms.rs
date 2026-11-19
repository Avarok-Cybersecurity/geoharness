//! llms.txt and llms-full.txt in the llmstxt.org format (`llmstxt-spec`):
//! H1 site name, blockquote summary, H2 sections of links to `.md` twins.

use crate::config::SiteConfig;
use crate::error::{CoreError, warn, warning};
use crate::glob;

/// What llms files need to know about one page.
pub struct LlmsPage<'a> {
    pub route: &'a str,
    pub title: &'a str,
    pub description: &'a str,
    /// Absolute URL of the twin.
    pub twin_url: String,
    pub twin: &'a str,
}

fn header(config: &SiteConfig) -> String {
    format!("# {}\n\n> {}\n", config.site.name, config.llms.summary)
}

fn link_text(s: &str) -> String {
    s.replace('[', "\\[").replace(']', "\\]")
}

/// llms.txt. Sections list matching pages in page order; an empty section
/// is omitted with a warning.
pub fn llms_txt(
    config: &SiteConfig,
    pages: &[LlmsPage<'_>],
    warnings: &mut Vec<CoreError>,
) -> String {
    let mut out = header(config);
    for (i, section) in config.llms.sections.iter().enumerate() {
        let members: Vec<_> = pages
            .iter()
            .filter(|p| glob::any(&section.routes, p.route))
            .collect();
        if members.is_empty() {
            warnings.push(warn(
                warning::SECTION_EMPTY,
                format!("llms section {:?} matched no page", section.title),
                Some(format!("llms.sections[{i}]")),
            ));
            continue;
        }
        out.push_str(&format!("\n## {}\n\n", section.title));
        for p in members {
            out.push_str(&format!("- [{}]({})", link_text(p.title), p.twin_url));
            if !p.description.is_empty() {
                out.push_str(&format!(": {}", p.description));
            }
            out.push('\n');
        }
    }
    out
}

/// llms-full.txt: the header, then every twin verbatim, each preceded by a
/// separator comment naming its URL (twins start with `---` frontmatter, so a
/// thematic break would be ambiguous).
pub fn llms_full_txt(config: &SiteConfig, pages: &[LlmsPage<'_>]) -> String {
    let mut out = header(config);
    for p in pages {
        out.push_str(&format!("\n<!-- geoharness:page {} -->\n", p.twin_url));
        out.push_str(p.twin.trim_end());
        out.push('\n');
    }
    out
}
