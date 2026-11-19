//! Every citation id used by the audit exists in CITATIONS.md.

use geoharness_audit::catalog::CHECKS;

const CITATIONS: &str = include_str!("../../../CITATIONS.md");
const SOURCES: [&str; 2] = [
    include_str!("../src/weights.rs"),
    include_str!("../src/catalog.rs"),
];

/// The first column of every markdown table whose header's first cell is `ID`.
fn ids() -> Vec<String> {
    let mut out = Vec::new();
    let mut in_id_table = false;
    for line in CITATIONS.lines() {
        let cells: Vec<&str> = line
            .trim()
            .trim_matches('|')
            .split('|')
            .map(str::trim)
            .collect();
        if !line.trim_start().starts_with('|') {
            in_id_table = false;
            continue;
        }
        if cells.first() == Some(&"ID") {
            in_id_table = true;
            continue;
        }
        if in_id_table && cells.first().is_some_and(|c| !c.starts_with("---")) {
            out.push(cells[0].to_owned());
        }
    }
    out
}

#[test]
fn citation_table_parses() {
    let ids = ids();
    assert!(ids.len() > 30, "{ids:?}");
    assert!(ids.contains(&"peec-reading-budget-2026".to_owned()));
    assert!(
        !ids.contains(&"A".to_owned()),
        "grade table must not be read as ids"
    );
}

#[test]
fn every_check_cites_existing_ids() {
    let ids = ids();
    for check in CHECKS {
        assert!(!check.citations.is_empty(), "{} cites nothing", check.id);
        for c in check.citations {
            assert!(
                ids.iter().any(|i| i == c),
                "{} cites unknown id {c}",
                check.id
            );
        }
    }
}

#[test]
fn ids_named_in_weight_and_catalog_docs_exist() {
    let ids = ids();
    let named = SOURCES
        .iter()
        .flat_map(|s| s.lines())
        .filter(|l| l.trim_start().starts_with("//"))
        .flat_map(|l| l.split('`').skip(1).step_by(2))
        .filter(|t| {
            t.contains('-')
                && t.chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        });
    for id in named {
        assert!(
            ids.iter().any(|i| i == id),
            "weights.rs names unknown citation {id}"
        );
    }
}

#[test]
fn check_ids_are_unique() {
    let mut seen: Vec<&str> = CHECKS.iter().map(|c| c.id).collect();
    seen.sort_unstable();
    let n = seen.len();
    seen.dedup();
    assert_eq!(n, seen.len());
}
