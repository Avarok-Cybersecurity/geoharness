//! One page: templating, twin, head injection and summary.

use crate::config::SiteConfig;
use crate::error::{CoreError, Error, warn, warning};
use crate::html::absolutize::absolutize;
use crate::html::inject::{HeadValues, inject, missing_tags};
use crate::html::labels::label_textless_links;
use crate::html::{Page, markdown::to_markdown};
use crate::tokens;
use crate::twin::{self, Frontmatter};
use crate::types::{PageInput, PageSummary};

use super::jsonld::{PageMeta, page_json_ld};

pub struct Processed {
    pub html: String,
    pub twin: String,
    pub summary: PageSummary,
    pub noindex: bool,
    /// The canonical the page declares, else `origin + route`.
    pub canonical: String,
}

fn collapse(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Processes one already-templated page that is not excluded.
pub fn process(
    config: &SiteConfig,
    build_id: &str,
    page: &PageInput,
    warnings: &mut Vec<CoreError>,
) -> Result<Processed, Error> {
    let markdown_file = twin::twin_path(&page.file)?;
    let origin = &config.site.origin;
    let parsed = Page::parse(&page.html);
    let facts = parsed.head();
    let title = facts.title.as_deref().map(collapse);
    let description = facts.description.as_deref().map(collapse);
    let canonical = facts
        .canonical
        .clone()
        .unwrap_or_else(|| format!("{origin}{}", page.route));
    let markdown_url = format!("{origin}{}", twin::twin_url_path(&markdown_file));
    let generated_ld = page_json_ld(
        config,
        &PageMeta {
            route: &page.route,
            title: title.as_deref(),
            description: description.as_deref(),
            canonical: &canonical,
            lastmod: page.lastmod.as_deref(),
        },
    );
    let json_ld = if facts.json_ld.is_empty() {
        vec![generated_ld.clone()]
    } else {
        facts.json_ld.clone()
    };
    for block in &facts.json_ld {
        if serde_json::from_str::<serde_json::Value>(block).is_err() {
            warnings.push(warn(
                warning::JSONLD_INVALID,
                "JSON-LD block is not valid JSON",
                Some(page.file.clone()),
            ));
        }
    }
    let body = if let Some(md) = &page.markdown {
        twin::strip_frontmatter(md).trim().to_owned()
    } else {
        let main = parsed.main(&config.content.main_selector);
        if !main.matched_selector {
            warnings.push(warn(
                warning::NO_MAIN,
                format!(
                    "content.mainSelector {:?} matched nothing; used <body>",
                    config.content.main_selector
                ),
                Some(page.file.clone()),
            ));
        }
        let labelled = label_textless_links(&main.inner_html());
        to_markdown(&absolutize(&labelled, origin, &page.route, &canonical)?)?
    };
    let after = twin::body_with_json_ld(&body, &json_ld);
    let token_count = tokens::estimate(&after);
    let twin = twin::assemble(
        &Frontmatter {
            title: title.as_deref().unwrap_or(""),
            description: description.as_deref().unwrap_or(""),
            canonical: &canonical,
            lastmod: page.lastmod.as_deref(),
            tokens: token_count,
        },
        &after,
    );
    let tags = missing_tags(
        &facts,
        &HeadValues {
            canonical: &canonical,
            markdown_url: &markdown_url,
            llms_url: &format!("{origin}/llms.txt"),
            title: title.as_deref(),
            description: description.as_deref(),
            site_name: &config.site.name,
            json_ld: &generated_ld,
            build_id,
            same_as: &config.identity.same_as,
        },
    );
    Ok(Processed {
        html: inject(&page.html, &tags)?,
        twin,
        noindex: facts.noindex,
        canonical: canonical.clone(),
        summary: PageSummary {
            route: page.route.clone(),
            markdown_file,
            title: title.unwrap_or_default(),
            description: description.unwrap_or_default(),
            tokens: token_count,
            lastmod: page.lastmod.clone(),
        },
    })
}
