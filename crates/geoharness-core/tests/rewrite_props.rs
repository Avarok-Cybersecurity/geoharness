//! Property tests for the Accept-negotiation rewrite rules.

use geoharness_core::rewrite::{BareMapping, Kind, kinds, rules};
use geoharness_core::twin::twin_path;
use proptest::prelude::*;

fn segments() -> impl Strategy<Value = Vec<String>> {
    prop::collection::vec("[a-z0-9-]{1,8}", 1..5)
}

fn mapping() -> impl Strategy<Value = BareMapping> {
    prop_oneof![Just(BareMapping::Sibling), Just(BareMapping::Index)]
}

fn rewrite(bare: BareMapping, path: &str) -> Option<String> {
    let applicable: Vec<Kind> = kinds(bare)
        .into_iter()
        .filter(|k| k.applies(path))
        .collect();
    assert!(applicable.len() <= 1, "{path} matched {applicable:?}");
    applicable.first().map(|k| k.rewrite(path))
}

proptest! {
    #[test]
    fn at_most_one_rule_matches_any_path(path in "/[a-zA-Z0-9./_-]{0,30}", bare in mapping()) {
        let _ = rewrite(bare, &path);
    }

    #[test]
    fn directory_pages_reach_their_twin(segs in segments()) {
        let file = format!("{}/index.html", segs.join("/"));
        let twin = format!("/{}", twin_path(&file).unwrap_or_default());
        let route = format!("/{}/", segs.join("/"));
        prop_assert_eq!(rewrite(BareMapping::Index, &route), Some(twin.clone()));
        prop_assert_eq!(rewrite(BareMapping::Index, route.trim_end_matches('/')), Some(twin.clone()));
        prop_assert_eq!(rewrite(BareMapping::Index, &format!("{route}index.html")), Some(twin));
    }

    #[test]
    fn file_pages_reach_their_twin(segs in segments()) {
        let file = format!("{}.html", segs.join("/"));
        let twin = format!("/{}", twin_path(&file).unwrap_or_default());
        let bare = format!("/{}", segs.join("/"));
        prop_assert_eq!(rewrite(BareMapping::Sibling, &bare), Some(twin.clone()));
        prop_assert_eq!(rewrite(BareMapping::Sibling, &format!("{bare}.html")), Some(twin));
    }

    #[test]
    fn twins_and_assets_are_never_rewritten(segs in segments(), ext in "(md|js|css|png|txt|xml)", bare in mapping()) {
        let path = format!("/{}.{ext}", segs.join("/"));
        prop_assert_eq!(rewrite(bare, &path), None);
    }

    #[test]
    fn expressions_are_host_guarded_and_regex_free(host in "[a-z]{1,10}\\.(com|org|net)", bare in mapping()) {
        for r in rules(&host, bare) {
            let guard = format!("http.host eq \"{host}\"");
            let head = format!("({guard} and any(");
            prop_assert!(r.expression.starts_with(&head));
            prop_assert!(r.expression.contains("contains \"text/markdown\""));
            prop_assert!(!r.expression.contains(" matches ") && !r.expression.contains(" ~ "));
            prop_assert!(!r.path_expression.contains("regex_replace"));
            let prefix = format!("geoharness:{host}");
            prop_assert!(r.description.starts_with(&prefix));
        }
    }
}
