//! The advisory checks added for geo.new parity (docs/geo-new-parity.md):
//! each passes on what GeoHarness now generates and fails on the gap it names.

mod support;

use geoharness_audit::AuditPage;
use geoharness_core::site::jsonld::{PageMeta, page_json_ld};
use support::{all_pass, fails, findings, healthy_live, run, static_input};

const WORDS12: &str =
    "GeoHarness builds the site and serves a markdown twin to every agent that asks.";

fn page_html(head: &str, main: &str, footer: &str) -> String {
    format!(
        "<html><head><title>T</title><meta name=\"description\" content=\"D\">{head}</head><body><main>{main}</main><footer>{footer}</footer></body></html>"
    )
}

/// The fixture audit with its `/` page replaced.
fn with_home(html: String) -> geoharness_audit::AuditReport {
    let mut input = static_input();
    input.pages.retain(|p| p.route != "/");
    input.pages.push(AuditPage {
        route: "/".into(),
        html,
        markdown: String::new(),
    });
    run(&input)
}

fn ld(json: &str) -> String {
    format!("<script type=\"application/ld+json\">{json}</script>")
}

#[test]
fn the_generated_graph_passes_the_entity_and_website_checks() {
    let mut config = static_input().config;
    config.identity.email = Some("hello@example.com".into());
    let graph = page_json_ld(
        &config,
        &PageMeta {
            route: "/",
            title: Some("T"),
            description: Some("D"),
            canonical: "https://example.com/",
            lastmod: None,
        },
    );
    let r = with_home(page_html(&ld(&graph), "<p>x</p>", ""));
    all_pass(&r, "signals.entity_node");
    all_pass(&r, "signals.website_node");
    all_pass(&r, "signals.contact");
}

/// The JSON-LD GeoHarness generated before: the entity only nested as
/// `author`, the site only nested as `isPartOf`. It used to score 100.
#[test]
fn identity_nested_inside_a_web_page_is_not_an_entity_node() {
    let old = r#"{"@context":"https://schema.org","@type":"WebPage","author":{"@type":"Organization","name":"A","url":"https://a.example","sameAs":["https://github.com/a"]},"isPartOf":{"@type":"WebSite","name":"S","url":"https://example.com/"}}"#;
    let r = with_home(page_html(&ld(old), "<p>x</p>", ""));
    fails(&r, "signals.entity_node", Some("/"));
    fails(&r, "signals.website_node", Some("/"));
    fails(&r, "signals.contact", Some("/"));
}

#[test]
fn an_entity_without_same_as_gets_half_credit() {
    let org = r#"{"@context":"https://schema.org","@type":"Organization","name":"A","url":"https://a.example"}"#;
    let r = with_home(page_html(&ld(org), "<p>x</p>", ""));
    let f = findings(&r, "signals.entity_node");
    assert!(!f[0].passed && f[0].evidence.contains("sameAs"), "{f:?}");
}

#[test]
fn trust_links_need_about_contact_and_privacy() {
    let all = "<a href=\"https://a.example/about/\">About</a><a href=\"mailto:hi@a.example\">Email</a><a href=\"/privacy/\">Privacy</a>";
    all_pass(
        &with_home(page_html("", "<p>x</p>", all)),
        "signals.trust_links",
    );
    let r = with_home(page_html(
        "",
        "<p>x</p>",
        "<a href=\"/about-us/\">Team</a><a href=\"/learn\">Read about it</a>",
    ));
    let f = findings(&r, "signals.trust_links");
    assert!(!f[0].passed, "{f:?}");
    assert_eq!(f[0].evidence, "no contact, no privacy link");
}

#[test]
fn a_description_over_160_characters_fails() {
    let html = |n: usize| {
        page_html("", "<p>x</p>", "")
            .replace("content=\"D\"", &format!("content=\"{}\"", "d".repeat(n)))
    };
    all_pass(&with_home(html(160)), "signals.description_length");
    fails(
        &with_home(html(161)),
        "signals.description_length",
        Some("/"),
    );
}

#[test]
fn a_one_sentence_section_over_a_code_block_is_not_quotable() {
    let quick =
        "<h2>Quick start</h2><p>Add this file next to your site:</p><pre><code>x = 1</code></pre>";
    let r = with_home(page_html("", quick, ""));
    let f = findings(&r, "extract.quotable_sections");
    assert!(
        f.iter()
            .any(|x| x.route.as_deref() == Some("/") && !x.passed),
        "{f:?}"
    );
    let fixed = format!(
        "<h2>Quick start</h2><p>{WORDS12} {WORDS12}</p><pre><code>x = 1</code></pre><h2>Steps</h2><ol><li>a</li></ol>"
    );
    let r = with_home(page_html("", &fixed, ""));
    let f: Vec<_> = findings(&r, "extract.quotable_sections")
        .into_iter()
        .filter(|x| x.route.as_deref() == Some("/"))
        .collect();
    assert!(f[0].passed, "{f:?}");
}

#[test]
fn live_link_headers_are_checked_on_pages_and_twins() {
    let mut input = static_input();
    input.live = Some(healthy_live(&input));
    all_pass(&run(&input), "signals.live_link_header");
    let mut live = healthy_live(&input);
    for o in &mut live {
        o.headers.remove("Link");
    }
    input.live = Some(live);
    let r = run(&input);
    let f = findings(&r, "signals.live_link_header");
    assert!(f.len() >= 2 && f.iter().all(|x| !x.passed), "{f:#?}");
    let mut live = healthy_live(&input);
    for o in &mut live {
        if let Some(v) = o.headers.get_mut("Link") {
            *v = v.replace("text/markdown", "text/plain");
        }
    }
    input.live = Some(live);
    fails(&run(&input), "signals.live_link_header", None);
}
