//! The JSON-LD injected when a page has none: one `@graph` with the entity
//! behind the site (Organization or Person), the `WebSite` on the home page
//! (`google-site-names`: it belongs on the home page, once) and the
//! `WebPage`, linked by `@id`. Emitted for classic search and entity
//! disambiguation (`google-organization`); it gave no measurable
//! AI-citation lift (`ahrefs-schema-2026`, `google-ai-guide-2026`).

use serde_json::{Map, Value, json};

use crate::config::{IdentityKind, SiteConfig};

pub struct PageMeta<'a> {
    pub route: &'a str,
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub canonical: &'a str,
    pub lastmod: Option<&'a str>,
}

/// `@id` of the identity node: its URL (a bare origin gets its `/`) plus
/// `#organization` or `#person`, so pages on other sites that use the same
/// convention name the same entity.
pub fn entity_id(config: &SiteConfig) -> String {
    let id = &config.identity;
    let url = id.url.split('#').next().unwrap_or(&id.url);
    let after_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    let slash = if after_scheme.contains('/') { "" } else { "/" };
    let fragment = match id.kind {
        IdentityKind::Person => "person",
        IdentityKind::Organization => "organization",
    };
    format!("{url}{slash}#{fragment}")
}

/// `@id` of the site's `WebSite` node.
pub fn website_id(config: &SiteConfig) -> String {
    format!("{}/#website", config.site.origin)
}

fn entity(config: &SiteConfig) -> Value {
    let id = &config.identity;
    let kind = match id.kind {
        IdentityKind::Person => "Person",
        IdentityKind::Organization => "Organization",
    };
    let mut obj = Map::new();
    obj.insert("@type".into(), json!(kind));
    obj.insert("@id".into(), json!(entity_id(config)));
    obj.insert("name".into(), json!(id.name));
    obj.insert("url".into(), json!(id.url));
    if !id.same_as.is_empty() {
        obj.insert("sameAs".into(), json!(id.same_as));
    }
    for (key, value) in [("logo", &id.logo), ("email", &id.email)] {
        if let Some(v) = value {
            obj.insert(key.into(), json!(v));
        }
    }
    if let Some(org) = &id.organization {
        let key = match id.kind {
            IdentityKind::Person => "worksFor",
            IdentityKind::Organization => "parentOrganization",
        };
        obj.insert(
            key.into(),
            json!({ "@type": "Organization", "name": org.name, "url": org.url }),
        );
    }
    Value::Object(obj)
}

fn website(config: &SiteConfig) -> Value {
    json!({
        "@type": "WebSite",
        "@id": website_id(config),
        "name": config.site.name,
        "url": format!("{}/", config.site.origin),
        "inLanguage": config.site.language,
        "publisher": { "@id": entity_id(config) },
    })
}

fn web_page(config: &SiteConfig, meta: &PageMeta<'_>, home: bool) -> Value {
    let mut obj = Map::new();
    obj.insert("@type".into(), json!("WebPage"));
    obj.insert("@id".into(), json!(meta.canonical));
    obj.insert("url".into(), json!(meta.canonical));
    obj.insert("inLanguage".into(), json!(config.site.language));
    // Off the home page the WebSite is named inline (not a second full node).
    let part_of = if home {
        json!({ "@id": website_id(config) })
    } else {
        json!({
            "@type": "WebSite",
            "@id": website_id(config),
            "name": config.site.name,
            "url": format!("{}/", config.site.origin),
        })
    };
    obj.insert("isPartOf".into(), part_of);
    obj.insert("author".into(), json!({ "@id": entity_id(config) }));
    if home {
        obj.insert("about".into(), json!({ "@id": entity_id(config) }));
    }
    for (key, value) in [
        ("name", meta.title),
        ("description", meta.description),
        ("dateModified", meta.lastmod),
    ] {
        if let Some(v) = value {
            obj.insert(key.into(), json!(v));
        }
    }
    Value::Object(obj)
}

/// Compact JSON-LD for a page (keys sorted, so output is deterministic).
pub fn page_json_ld(config: &SiteConfig, meta: &PageMeta<'_>) -> String {
    let home = meta.route == "/";
    let mut graph = vec![entity(config)];
    if home {
        graph.push(website(config));
    }
    graph.push(web_page(config, meta, home));
    json!({ "@context": "https://schema.org", "@graph": graph }).to_string()
}
