//! The call layer behind every export, exercised natively.

use geoharness_wasm::calls;
use serde_json::{Value, json};

const TOML: &str = include_str!("../../../fixtures/core/site/geoharness.toml");

fn config() -> Value {
    calls::parse_config(TOML)["value"].clone()
}

#[test]
fn bad_input_uses_the_error_envelope_with_a_path() {
    let out = calls::process_site(json!({ "config": 1 }));
    assert_eq!(out["ok"], false);
    assert_eq!(out["errors"][0]["code"], "input.invalid");
    assert_eq!(out["errors"][0]["path"], "config");
}

#[test]
fn parsed_config_feeds_process_site() {
    let out = calls::process_site(
        json!({ "config": config(), "buildId": "abc", "hosts": ["example.com"], "env": {}, "pages": [], "existing": {}, "sourceLastmod": {} }),
    );
    assert_eq!(out["ok"], true, "{out}");
    assert!(
        out["value"]["files"]
            .as_array()
            .is_some_and(|f| f.iter().any(|f| f["file"] == "robots.txt"))
    );
}

#[test]
fn live_plan_accepts_config_or_origin_but_not_both() {
    let with_config =
        calls::live_check_plan(json!({ "config": config(), "routes": ["/"], "buildId": "abc" }));
    assert_eq!(with_config["ok"], true, "{with_config}");
    let with_origin =
        calls::live_check_plan(json!({ "origin": "https://example.com", "routes": ["/"] }));
    assert_eq!(with_origin["ok"], true, "{with_origin}");
    let both = calls::live_check_plan(
        json!({ "config": config(), "origin": "https://example.com", "routes": [] }),
    );
    assert_eq!(both["ok"], false);
}

#[test]
fn audit_live_needs_no_config() {
    let out =
        calls::audit_live(json!({ "origin": "https://example.com", "routes": ["/"], "live": [] }));
    assert_eq!(out["ok"], true, "{out}");
    assert!(
        out["value"]["findings"]
            .as_array()
            .is_some_and(|f| f.iter().all(|f| f["passed"] == false))
    );
}
