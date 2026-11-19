//! parseConfig: unknown keys, missing keys, semantic validation, defaults.

mod common;

use geoharness_core::parse_config;

const BASE: &str = include_str!("../../../fixtures/core/site/geoharness.toml");

fn codes(toml: &str) -> Vec<(String, Option<String>)> {
    parse_config(toml)
        .err()
        .unwrap_or_default()
        .into_iter()
        .map(|e| (e.code, e.path))
        .collect()
}

#[test]
fn fixture_config_parses() {
    assert!(parse_config(BASE).is_ok());
}

#[test]
fn unknown_key_is_an_error_with_its_path() {
    let toml = BASE.replace("[content]\n", "[content]\nmainSelecter = \"x\"\n");
    let got = codes(&toml);
    assert_eq!(got.len(), 1, "{got:?}");
    assert_eq!(got[0].0, "config.unknown_key");
    assert!(
        got[0]
            .1
            .as_deref()
            .is_some_and(|p| p.starts_with("content")),
        "{got:?}"
    );
}

#[test]
fn missing_content_signal_is_required_not_defaulted() {
    let toml = BASE.replace("aiTrain = false\n", "");
    assert_eq!(codes(&toml)[0].0, "config.missing_key");
}

#[test]
fn semantic_errors_are_all_reported() {
    let toml = BASE
        .replace("https://example.com\"", "http://example.com/\"")
        .replace("mainSelector = \"main\"", "mainSelector = \"main[\"")
        .replace("env = [\"PUBLIC_NAME\"]", "env = [\"lower\"]");
    let paths: Vec<String> = codes(&toml).into_iter().filter_map(|(_, p)| p).collect();
    assert!(paths.contains(&"site.origin".to_owned()), "{paths:?}");
    assert!(
        paths.contains(&"content.mainSelector".to_owned()),
        "{paths:?}"
    );
    assert!(paths.contains(&"env[0]".to_owned()), "{paths:?}");
}

#[test]
fn duplicate_bot_token_is_rejected() {
    let toml = BASE.replace(
        "tokens = [\"GPTBot\", \"ClaudeBot\"]",
        "tokens = [\"GPTBot\", \"PerplexityBot\"]",
    );
    assert!(
        codes(&toml)
            .iter()
            .any(|(_, p)| p.as_deref() == Some("bots[2].tokens"))
    );
}

#[test]
fn documented_defaults_are_empty_lists() {
    let toml = BASE
        .replace("exclude = [\"/drafts/**\"]\n", "")
        .replace("[headers]\nimmutable = [\"/assets/*\"]\n", "");
    let c = parse_config(&toml).unwrap_or_else(|e| panic!("{e:?}"));
    assert!(c.content.exclude.is_empty() && c.headers.immutable.is_empty());
}

#[test]
fn prerender_routes_are_optional_and_validated() {
    assert!(parse_config(BASE).is_ok_and(|c| c.prerender.is_none()));
    let ok = format!("{BASE}\n[prerender]\nroutes = [\"/\", \"/about/\"]\n");
    assert!(parse_config(&ok).is_ok_and(|c| c.prerender.is_some_and(|p| p.routes.len() == 2)));
    let bad = format!("{BASE}\n[prerender]\nroutes = [\"/blog/*\"]\n");
    assert!(
        codes(&bad)
            .iter()
            .any(|(_, p)| p.as_deref() == Some("prerender.routes[0]"))
    );
}
