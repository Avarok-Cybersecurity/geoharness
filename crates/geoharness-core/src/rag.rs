//! `ragInputs` (contract §5): sidecar metadata and graph edges for
//! `AutoRepoRAG`. `child_of` follows the URL hierarchy; `links_to` counts
//! internal anchors in main content (weight = number of anchors).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::config::{SiteConfig, validate};
use crate::error::CoreError;
use crate::html::Page;
use crate::links::{resolve, route_for};
use crate::types::PageSummary;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RagInput {
    pub config: SiteConfig,
    pub pages: Vec<PageSummary>,
    pub html: Vec<RouteHtml>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RouteHtml {
    pub route: String,
    pub html: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct RagOutput {
    pub sidecar: BTreeMap<String, SidecarEntry>,
    pub edges: Vec<Edge>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct SidecarEntry {
    pub url: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub lastmod: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub from: EdgeEnd,
    pub to: EdgeEnd,
    pub relation: Relation,
    pub weight: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub struct EdgeEnd {
    pub path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum Relation {
    ChildOf,
    LinksTo,
}

/// Nearest ancestor route of `route` that is a page (`/a/b/` → `/a/` → `/`).
fn parent(route: &str, routes: &[&str]) -> Option<String> {
    let mut current = route.trim_end_matches('/').to_owned();
    while let Some(i) = current.rfind('/') {
        current.truncate(i);
        let candidate = format!("{current}/");
        if routes.contains(&candidate.as_str()) {
            return Some(candidate);
        }
    }
    None
}

fn edge(from: &str, to: &str, relation: Relation, weight: f64) -> Edge {
    Edge {
        from: EdgeEnd {
            path: from.to_owned(),
        },
        to: EdgeEnd {
            path: to.to_owned(),
        },
        relation,
        weight,
    }
}

/// Contract §5.
pub fn rag_inputs(input: &RagInput) -> Result<RagOutput, Vec<CoreError>> {
    validate(&input.config)?;
    let origin = &input.config.site.origin;
    let routes: Vec<&str> = input.pages.iter().map(|p| p.route.as_str()).collect();
    let md_of = |route: &str| {
        input
            .pages
            .iter()
            .find(|p| p.route == route)
            .map(|p| p.markdown_file.clone())
    };
    let sidecar = input
        .pages
        .iter()
        .map(|p| {
            let entry = SidecarEntry {
                url: format!("{origin}{}", p.route),
                title: p.title.clone(),
                lastmod: p.lastmod.clone(),
            };
            (p.markdown_file.clone(), entry)
        })
        .collect();
    let mut edges = Vec::new();
    for p in input.pages.iter().filter(|p| p.route != "/") {
        if let Some(parent_md) = parent(&p.route, &routes).and_then(|r| md_of(&r)) {
            edges.push(edge(&p.markdown_file, &parent_md, Relation::ChildOf, 1.0));
        }
    }
    for h in &input.html {
        let Some(from) = md_of(&h.route) else {
            continue;
        };
        let page = Page::parse(&h.html);
        let mut counts: BTreeMap<String, u32> = BTreeMap::new();
        for href in page.main(&input.config.content.main_selector).links() {
            let target = resolve(origin, &h.route, &href)
                .and_then(|path| route_for(&path, &routes))
                .and_then(md_of);
            if let Some(to) = target.filter(|t| *t != from) {
                *counts.entry(to).or_default() += 1;
            }
        }
        edges.extend(
            counts
                .into_iter()
                .map(|(to, n)| edge(&from, &to, Relation::LinksTo, f64::from(n))),
        );
    }
    Ok(RagOutput { sidecar, edges })
}
