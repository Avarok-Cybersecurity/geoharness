//! Generated JSON-LD: one `@graph` with the entity, the home page's
//! `WebSite` and the `WebPage`, linked by `@id`.

mod common;

use geoharness_core::config::IdentityKind;
use geoharness_core::site::jsonld::{PageMeta, entity_id, page_json_ld};
use serde_json::Value;

fn graph(route: &str, config: &geoharness_core::SiteConfig) -> Vec<Value> {
    let canonical = format!("https://example.com{route}");
    let ld = page_json_ld(
        config,
        &PageMeta {
            route,
            title: Some("T"),
            description: Some("D"),
            canonical: &canonical,
            lastmod: None,
        },
    );
    let v: Value = serde_json::from_str(&ld).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(v["@context"], "https://schema.org");
    v["@graph"].as_array().cloned().unwrap_or_default()
}

fn of_type<'a>(g: &'a [Value], t: &str) -> Vec<&'a Value> {
    g.iter().filter(|n| n["@type"] == t).collect()
}

#[test]
fn the_home_page_has_entity_website_and_page_nodes_linked_by_id() {
    let config = common::config();
    let g = graph("/", &config);
    let org = of_type(&g, "Organization");
    let site = of_type(&g, "WebSite");
    let page = of_type(&g, "WebPage");
    assert_eq!((org.len(), site.len(), page.len()), (1, 1, 1), "{g:?}");
    assert_eq!(org[0]["@id"], "https://example.com/#organization");
    assert_eq!(org[0]["sameAs"][0], "https://github.com/example");
    assert_eq!(site[0]["@id"], "https://example.com/#website");
    assert_eq!(site[0]["publisher"]["@id"], org[0]["@id"]);
    assert_eq!(page[0]["isPartOf"]["@id"], site[0]["@id"]);
    assert_eq!(page[0]["author"]["@id"], org[0]["@id"]);
    assert_eq!(page[0]["about"]["@id"], org[0]["@id"]);
}

#[test]
fn other_pages_name_the_website_inline_without_a_second_website_node() {
    let g = graph("/guide/", &common::config());
    assert!(of_type(&g, "WebSite").is_empty(), "{g:?}");
    let page = of_type(&g, "WebPage");
    assert_eq!(page[0]["isPartOf"]["@type"], "WebSite");
    assert_eq!(page[0]["isPartOf"]["@id"], "https://example.com/#website");
    assert!(page[0].get("about").is_none());
}

#[test]
fn logo_and_email_appear_only_when_configured() {
    let mut config = common::config();
    let g = graph("/", &config);
    let org = of_type(&g, "Organization")[0];
    assert!(org.get("logo").is_none() && org.get("email").is_none());
    config.identity.logo = Some("https://example.com/logo.png".into());
    config.identity.email = Some("hello@example.com".into());
    let g = graph("/", &config);
    let org = of_type(&g, "Organization")[0];
    assert_eq!(org["logo"], "https://example.com/logo.png");
    assert_eq!(org["email"], "hello@example.com");
}

#[test]
fn entity_ids_follow_the_identity_url() {
    let mut config = common::config();
    config.identity.kind = IdentityKind::Person;
    config.identity.url = "https://jane.example".into();
    assert_eq!(entity_id(&config), "https://jane.example/#person");
    config.identity.url = "https://example.com/team/jane".into();
    assert_eq!(entity_id(&config), "https://example.com/team/jane#person");
}

#[test]
fn identity_logo_and_email_are_validated() {
    let base = include_str!("../../../fixtures/core/site/geoharness.toml");
    let with = |extra: &str| {
        geoharness_core::parse_config(&base.replace(
            "sameAs = [\"https://github.com/example\"]",
            &format!("sameAs = [\"https://github.com/example\"]\n{extra}"),
        ))
    };
    assert!(with("logo = \"https://example.com/l.png\"\nemail = \"a@example.com\"").is_ok());
    for bad in [
        "logo = \"http://example.com/l.png\"",
        "logo = \"/l.png\"",
        "email = \"not-an-address\"",
        "email = \"a b@example.com\"",
    ] {
        let errs = with(bad).err().unwrap_or_default();
        assert_eq!(
            errs.first().map(|e| e.code.as_str()),
            Some("config.invalid"),
            "{bad}: {errs:?}"
        );
    }
}
