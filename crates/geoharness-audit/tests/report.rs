//! Golden audit report of the processed fixture, and scoring properties.

mod support;

use std::path::Path;

use support::{healthy_live, run, static_input};

#[test]
fn static_report_matches_golden() {
    let report = run(&static_input());
    let actual = serde_json::to_string_pretty(&report).unwrap_or_default() + "\n";
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/core/expected/audit-static.json");
    if std::env::var_os("GEOHARNESS_BLESS").is_some() {
        std::fs::write(&path, &actual).unwrap_or_else(|e| panic!("{e}"));
    }
    let expected = std::fs::read_to_string(&path).unwrap_or_default();
    assert_eq!(expected, actual);
}

#[test]
fn live_data_adds_categories_without_lowering_a_healthy_score() {
    let base = run(&static_input());
    let mut input = static_input();
    input.live = Some(healthy_live(&input));
    let live = run(&input);
    assert!(live.score >= base.score, "{} < {}", live.score, base.score);
    assert!((0.0..=100.0).contains(&live.score));
}

#[test]
fn categories_are_weighted_by_the_table() {
    let r = run(&static_input());
    for c in &r.categories {
        let def = geoharness_audit::weights::CATEGORIES
            .iter()
            .find(|d| d.id == c.id);
        assert!(def.is_some_and(|d| (d.weight - c.weight).abs() < f64::EPSILON));
    }
    let sum: f64 = geoharness_audit::weights::CATEGORIES
        .iter()
        .map(|c| c.weight)
        .sum();
    assert!((sum - 100.0).abs() < f64::EPSILON);
}
