//! The minimal JSON-LD injected when a page has none. Emitted for classic
//! search eligibility only: it gave no measurable AI-citation lift
//! (`ahrefs-schema-2026`, `google-ai-guide-2026`).

use serde_json::{Map, Value, json};

use crate::config::{IdentityKind, SiteConfig};

pub struct PageMeta<'a> {
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub canonical: &'a str,
    pub lastmod: Option<&'a str>,
}

fn identity(config: &SiteConfig) -> Value {
    let id = &config.identity;
    let kind = match id.kind {
        IdentityKind::Person => "Person",
        IdentityKind::Organization => "Organization",
    };
    let mut v = json!({ "@type": kind, "name": id.name, "url": id.url });
    if let Some(obj) = v.as_object_mut() {
        if !id.same_as.is_empty() {
            obj.insert("sameAs".into(), json!(id.same_as));
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
    }
    v
}

/// Compact JSON-LD for a page (keys sorted, so output is deterministic).
pub fn page_json_ld(config: &SiteConfig, meta: &PageMeta<'_>) -> String {
    let mut obj = Map::new();
    obj.insert("@context".into(), json!("https://schema.org"));
    obj.insert("@type".into(), json!("WebPage"));
    obj.insert("url".into(), json!(meta.canonical));
    obj.insert("inLanguage".into(), json!(config.site.language));
    obj.insert(
        "isPartOf".into(),
        json!({ "@type": "WebSite", "name": config.site.name, "url": format!("{}/", config.site.origin) }),
    );
    obj.insert("author".into(), identity(config));
    for (key, value) in [
        ("name", meta.title),
        ("description", meta.description),
        ("dateModified", meta.lastmod),
    ] {
        if let Some(v) = value {
            obj.insert(key.into(), json!(v));
        }
    }
    Value::Object(obj).to_string()
}
