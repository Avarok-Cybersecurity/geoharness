//! Site-level advisory checks on the home page: who is behind the site
//! (JSON-LD entity and `WebSite` nodes), how to reach them, and links to the
//! pages that say so. Absent from the score when no `/` page is audited.

use serde_json::Value;

use super::{PageCtx, Scored, pass_fail, scored};
use crate::catalog::{CONTACT, ENTITY_NODE, TRUST_LINKS, WEBSITE_NODE};

/// `@type`s counted as the entity behind a site (schema.org Organization
/// subtypes a site commonly declares, and Person).
const ENTITY_TYPES: [&str; 9] = [
    "Organization",
    "Corporation",
    "LocalBusiness",
    "OnlineBusiness",
    "OnlineStore",
    "NGO",
    "EducationalOrganization",
    "NewsMediaOrganization",
    "Person",
];

/// Top-level nodes of every JSON-LD block (`@graph` members, array items or
/// the object itself); nested values such as `author` are not nodes.
pub fn top_level_nodes(blocks: &[String]) -> Vec<Value> {
    let mut out = Vec::new();
    for block in blocks {
        let Ok(v) = serde_json::from_str::<Value>(block) else {
            continue;
        };
        let items = match v {
            Value::Array(items) => items,
            other => vec![other],
        };
        for item in items {
            match item.get("@graph").and_then(Value::as_array) {
                Some(graph) => out.extend(graph.iter().cloned()),
                None => out.push(item),
            }
        }
    }
    out
}

fn has_type(node: &Value, types: &[&str]) -> bool {
    match node.get("@type") {
        Some(Value::String(t)) => types.contains(&t.as_str()),
        Some(Value::Array(ts)) => ts
            .iter()
            .any(|t| t.as_str().is_some_and(|t| types.contains(&t))),
        _ => false,
    }
}

fn non_empty(node: &Value, key: &str) -> bool {
    match node.get(key) {
        Some(Value::String(s)) => !s.trim().is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(o)) => !o.is_empty(),
        _ => false,
    }
}

fn is_contact_link(href: &str, text: &str) -> bool {
    let h = href.to_ascii_lowercase();
    h.starts_with("mailto:")
        || h.starts_with("tel:")
        || h.contains("contact")
        || text.to_lowercase().contains("contact")
}

/// A link whose URL path has a segment starting with `word`, or whose text
/// starts with it (`About`, `About us`, `Privacy policy`).
fn links_to(anchors: &[(String, String)], word: &str) -> bool {
    anchors.iter().any(|(href, text)| {
        let h = href.to_ascii_lowercase();
        let path = h.split(['?', '#']).next().unwrap_or("");
        path.split('/').skip(1).any(|seg| seg.starts_with(word))
            || text.trim().to_lowercase().starts_with(word)
    })
}

/// The four home-page checks; empty when `pages` has no `/`.
pub fn site(pages: &[PageCtx<'_>]) -> Vec<Scored> {
    let Some(home) = pages.iter().find(|p| p.route == "/") else {
        return Vec::new();
    };
    let route = Some("/");
    let nodes = top_level_nodes(&home.page.head().json_ld);
    let entity = nodes.iter().find(|n| has_type(n, &ENTITY_TYPES));
    let (credit, evidence) = match entity {
        None => (0.0, "no top-level Organization or Person node".to_owned()),
        Some(n) if !(non_empty(n, "name") && non_empty(n, "url")) => {
            (0.0, "entity node lacks name or url".to_owned())
        }
        Some(n) if !non_empty(n, "sameAs") => (0.5, "entity node has no sameAs".to_owned()),
        Some(_) => (1.0, "entity node with name, url and sameAs".to_owned()),
    };
    let mut out = vec![scored(&ENTITY_NODE, route, credit, evidence)];

    let website = nodes
        .iter()
        .any(|n| has_type(n, &["WebSite"]) && non_empty(n, "name") && non_empty(n, "url"));
    out.push(pass_fail(
        &WEBSITE_NODE,
        route,
        website,
        if website {
            "WebSite node with name and url"
        } else {
            "no top-level WebSite node with name and url"
        },
    ));

    let anchors = home.page.anchors();
    let in_ld = entity.is_some_and(|n| {
        ["email", "telephone", "contactPoint"]
            .iter()
            .any(|k| non_empty(n, k))
    });
    let linked = anchors.iter().any(|(h, t)| is_contact_link(h, t));
    let evidence = format!(
        "contact in JSON-LD: {}; contact link: {}",
        if in_ld { "yes" } else { "no" },
        if linked { "yes" } else { "no" }
    );
    out.push(pass_fail(&CONTACT, route, in_ld || linked, evidence));

    let found = [
        ("about", links_to(&anchors, "about")),
        ("contact", linked),
        ("privacy", links_to(&anchors, "privacy")),
    ];
    let missing: Vec<&str> = found.iter().filter(|(_, f)| !f).map(|(w, _)| *w).collect();
    let credit = f64::from(u8::try_from(3 - missing.len()).unwrap_or(0)) / 3.0;
    let evidence = if missing.is_empty() {
        "about, contact and privacy links present".to_owned()
    } else {
        format!("no {} link", missing.join(", no "))
    };
    out.push(scored(&TRUST_LINKS, route, credit, evidence));
    out
}
