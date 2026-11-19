//! `processSite` (contract §2): orchestrates every page and site file.

mod check;
pub mod jsonld;
mod lastmod;
mod page;

use crate::error::{CoreError, Error, warn, warning};
use crate::llms::{LlmsPage, llms_full_txt, llms_txt};
use crate::template::{TemplateContext, render};
use crate::types::{OutFile, SiteInput, SiteOutput};
use crate::{analytics, config, glob, headers, indexnow, rewrite, robots, sitemap, twin};

/// Runs the whole pipeline; returns every error found, not just the first.
pub fn process_site(input: &SiteInput) -> Result<SiteOutput, Vec<CoreError>> {
    config::validate(&input.config)?;
    check::input(input)?;
    let config = &input.config;
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut page_files = Vec::new();
    let mut processed = Vec::new();
    for page in &input.pages {
        let templated = templated(input, page);
        let templated = match templated {
            Ok(p) => p,
            Err(e) => {
                errors.push(e.at(page.file.clone()));
                continue;
            }
        };
        if glob::any(&config.content.exclude, &page.route) {
            page_files.push(OutFile {
                file: page.file.clone(),
                contents: templated.html,
            });
            continue;
        }
        match page::process(config, &input.build_id, &templated, &mut warnings) {
            Ok(p) => {
                page_files.push(OutFile {
                    file: page.file.clone(),
                    contents: p.html.clone(),
                });
                processed.push(p);
            }
            Err(e) => errors.push(e.at(page.file.clone())),
        }
    }
    let undated: Vec<String> = processed
        .iter()
        .filter(|p| p.summary.lastmod.is_none())
        .map(|p| p.summary.route.clone())
        .collect();
    warnings.extend(lastmod::missing_warning(&undated));
    let robots_txt =
        robots::merge(input.existing.robots.as_deref(), config).map_err(|e| e.at("robots.txt"));
    let headers_txt = merged_headers(input, &mut warnings);
    let (robots_txt, headers_txt) = match (robots_txt, headers_txt) {
        (Ok(r), Ok(h)) if errors.is_empty() => (r, h),
        (r, h) => {
            errors.extend(r.err());
            errors.extend(h.err());
            return Err(errors);
        }
    };
    let mut files = page_files;
    files.extend(processed.iter().map(|p| OutFile {
        file: p.summary.markdown_file.clone(),
        contents: p.twin.clone(),
    }));
    files.extend(site_files(input, &processed, &robots_txt, &mut warnings));
    files.push(OutFile {
        file: "robots.txt".into(),
        contents: robots_txt,
    });
    files.push(OutFile {
        file: "_headers".into(),
        contents: headers_txt,
    });
    let key = indexnow::key(&config.site.origin);
    files.push(OutFile {
        file: format!("{key}.txt"),
        contents: key,
    });

    let page_list: Vec<&str> = input.pages.iter().map(|p| p.file.as_str()).collect();
    let (bare, index, sibling) = rewrite::bare_mapping(&page_list);
    if index > 0 && sibling > 0 {
        warnings.push(warn(
            warning::MIXED_LAYOUT,
            format!(
                "{index} directory-style and {sibling} file-style pages; bare paths map as {bare:?}"
            ),
            None,
        ));
    }
    Ok(SiteOutput {
        files,
        rewrite_rules: input
            .hosts
            .iter()
            .flat_map(|h| rewrite::rules(h, bare))
            .collect(),
        pages: processed.into_iter().map(|p| p.summary).collect(),
        warnings,
    })
}

/// The page with its templates rendered and its effective lastmod set.
fn templated(
    input: &SiteInput,
    page: &crate::types::PageInput,
) -> Result<crate::types::PageInput, Error> {
    let lastmod = lastmod::effective(
        &input.config,
        &input.source_lastmod,
        &page.route,
        page.lastmod.as_deref(),
    );
    let ctx = TemplateContext {
        build_id: &input.build_id,
        lastmod: lastmod.as_deref(),
        declared_env: &input.config.env,
        env: &input.env,
    };
    let html = render(&page.html, &ctx)?;
    let markdown = page
        .markdown
        .as_deref()
        .map(|m| render(m, &ctx))
        .transpose()?;
    Ok(crate::types::PageInput {
        html,
        markdown,
        lastmod,
        ..page.clone()
    })
}

/// `_headers`, with the site's CSP extended for the beacon on explicit opt-in.
fn merged_headers(input: &SiteInput, warnings: &mut Vec<CoreError>) -> Result<String, CoreError> {
    let config = &input.config;
    let mut extended = Vec::new();
    let merged = headers::merge_with(input.existing.headers.as_deref(), config, |site| {
        if !config.cloudflare_web_analytics() {
            return site;
        }
        let (text, patterns) = analytics::extend_site_headers(&site);
        extended = patterns;
        text
    })
    .map_err(|e| e.at("_headers"))?;
    if !extended.is_empty() {
        warnings.push(warn(
            warning::CSP_EXTENDED,
            format!(
                "analytics.cloudflareWebAnalytics = true: the site's Content-Security-Policy for {} now admits {} (script-src) and 'self' plus {} (connect-src)",
                extended.join(", "),
                analytics::BEACON_SCRIPT_SOURCE,
                analytics::BEACON_REPORT_SOURCE
            ),
            Some("_headers".to_owned()),
        ));
    }
    Ok(merged)
}

fn host_without_port(host: &str) -> &str {
    host.split(':').next().unwrap_or(host)
}

fn site_files(
    input: &SiteInput,
    processed: &[page::Processed],
    robots_txt: &str,
    warnings: &mut Vec<CoreError>,
) -> Vec<OutFile> {
    let config = &input.config;
    let origin = &config.site.origin;
    let rules = robots::parse(robots_txt);
    let indexable: Vec<&page::Processed> = processed
        .iter()
        .filter(|p| !p.noindex && robots::is_allowed(&rules, "*", &p.summary.route))
        .collect();
    let llms_pages: Vec<LlmsPage<'_>> = indexable
        .iter()
        .map(|p| LlmsPage {
            route: &p.summary.route,
            title: &p.summary.title,
            description: &p.summary.description,
            twin_url: format!("{origin}{}", twin::twin_url_path(&p.summary.markdown_file)),
            twin: &p.twin,
        })
        .collect();
    let mut files = Vec::new();
    match &input.existing.llms {
        Some(_) => warnings.push(kept("llms.txt")),
        None => files.push(OutFile {
            file: "llms.txt".into(),
            contents: llms_txt(config, &llms_pages, warnings),
        }),
    }
    files.push(OutFile {
        file: "llms-full.txt".into(),
        contents: llms_full_txt(config, &llms_pages),
    });
    if input.existing.sitemap.is_some() {
        warnings.push(kept("sitemap.xml"));
        return files;
    }
    let entries: Vec<sitemap::Entry<'_>> = indexable
        .iter()
        .map(|p| sitemap::Entry {
            loc: format!("{origin}{}", p.summary.route),
            lastmod: p.summary.lastmod.as_deref(),
        })
        .collect();
    files.push(OutFile {
        file: "sitemap.xml".into(),
        contents: sitemap::render(&entries),
    });
    files
}

fn kept(file: &str) -> CoreError {
    warn(
        warning::EXISTING_KEPT,
        format!("the site ships its own {file}; GeoHarness kept it and did not generate one"),
        Some(file.to_owned()),
    )
}

/// Re-exported so the wasm crate does not reach into submodules.
pub fn undeclared_env(name: &str) -> CoreError {
    Error::EnvUndeclared(name.to_owned()).at(format!("env.{name}"))
}
