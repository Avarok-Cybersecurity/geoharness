//! Golden outputs for the fixture site. `GEOHARNESS_BLESS=1 cargo test`
//! rewrites fixtures/core/expected; review the diff before committing.

mod common;

use std::path::{Path, PathBuf};

use geoharness_core::live::live_check_plan;
use geoharness_core::process_site;
use geoharness_core::rag::{RagInput, RouteHtml, rag_inputs};
use geoharness_core::types::LiveCheckInput;

fn expected_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/core/expected")
}

fn check(name: &str, actual: &str, mismatches: &mut Vec<String>) {
    let path = expected_dir().join(name);
    if std::env::var_os("GEOHARNESS_BLESS").is_some() {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).unwrap_or_else(|e| panic!("{e}"));
        }
        std::fs::write(&path, actual).unwrap_or_else(|e| panic!("{e}"));
        return;
    }
    match std::fs::read_to_string(&path) {
        Ok(expected) if expected == actual => {}
        Ok(expected) => mismatches.push(format!(
            "{name}:\n--- expected\n{expected}\n--- actual\n{actual}"
        )),
        Err(e) => mismatches.push(format!("{name}: {e}")),
    }
}

fn json<T: serde::Serialize>(v: &T) -> String {
    serde_json::to_string_pretty(v).unwrap_or_else(|e| panic!("{e}")) + "\n"
}

#[test]
fn fixture_site_matches_golden_outputs() {
    let input = common::input();
    let out = process_site(&input).unwrap_or_else(|e| panic!("{e:?}"));
    let mut mismatches = Vec::new();
    for f in &out.files {
        check(&format!("files/{}", f.file), &f.contents, &mut mismatches);
    }
    check(
        "rewrite-rules.json",
        &json(&out.rewrite_rules),
        &mut mismatches,
    );
    check("pages.json", &json(&out.pages), &mut mismatches);
    check("warnings.json", &json(&out.warnings), &mut mismatches);

    let html = out
        .pages
        .iter()
        .map(|p| {
            let file = input
                .pages
                .iter()
                .find(|i| i.route == p.route)
                .map(|i| i.file.clone())
                .unwrap_or_default();
            let html = out
                .files
                .iter()
                .find(|f| f.file == file)
                .map(|f| f.contents.clone())
                .unwrap_or_default();
            RouteHtml {
                route: p.route.clone(),
                html,
            }
        })
        .collect();
    let rag = rag_inputs(&RagInput {
        config: input.config.clone(),
        pages: out.pages.clone(),
        html,
    })
    .unwrap_or_else(|e| panic!("{e:?}"));
    check("rag.json", &json(&rag), &mut mismatches);

    let routes: Vec<String> = out.pages.iter().map(|p| p.route.clone()).collect();
    let plan = live_check_plan(&LiveCheckInput {
        config: Some(input.config.clone()),
        origin: None,
        routes,
        build_id: Some(common::BUILD_ID.into()),
    })
    .unwrap_or_else(|e| panic!("{e:?}"));
    check("live-plan.json", &json(&plan), &mut mismatches);
    assert!(mismatches.is_empty(), "{}", mismatches.join("\n\n"));
}
