//! `gen-checks`: the GEO score's categories and checks as JSON
//! (`docs/generated/checks.json`) for the README and site generators. The
//! Rust catalog and weights stay the single source; this is a derived view.

use serde_json::{Value, json};

use geoharness_audit::{catalog, weights};

pub fn render() -> String {
    let categories: Vec<Value> = weights::CATEGORIES
        .iter()
        .map(|c| json!({ "id": c.id, "title": c.title, "weight": c.weight }))
        .collect();
    let checks: Vec<Value> = catalog::CHECKS
        .iter()
        .map(|c| {
            json!({
                "id": c.id,
                "title": c.title,
                "category": c.category,
                "severity": c.severity,
                "citations": c.citations,
            })
        })
        .collect();
    let doc = json!({
        "generatedBy": "cargo run -p xtask -- gen-checks (from crates/geoharness-audit/src/catalog/ and weights.rs)",
        "categories": categories,
        "checks": checks,
    });
    serde_json::to_string_pretty(&doc).unwrap_or_default() + "\n"
}
