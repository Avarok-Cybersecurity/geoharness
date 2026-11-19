//! Property tests for merging the `GeoHarness` block into a site's robots.txt.

mod common;

use geoharness_core::config::{BotGroup, BotPolicy};
use geoharness_core::robots::{merge, parse};
use proptest::prelude::*;

fn token() -> impl Strategy<Value = String> {
    "[A-Z][a-zA-Z]{2,8}Bot"
}

fn rules() -> impl Strategy<Value = Vec<String>> {
    prop::collection::vec("/[a-z]{0,6}/?", 0..3)
}

fn site_robots() -> impl Strategy<Value = Vec<(String, Vec<String>)>> {
    prop::collection::vec((token(), rules()), 0..4)
}

fn render(groups: &[(String, Vec<String>)]) -> String {
    groups
        .iter()
        .map(|(t, d)| {
            let rules = d
                .iter()
                .map(|p| format!("Disallow: {p}\n"))
                .collect::<Vec<_>>()
                .concat();
            format!("User-agent: {t}\n{rules}")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn config_with(tokens: Vec<String>, disallow: Vec<String>) -> geoharness_core::SiteConfig {
    let mut c = common::config();
    c.bots = vec![BotPolicy {
        tokens,
        allow: vec![],
        disallow,
        group: BotGroup::Other,
    }];
    c
}

proptest! {
    #[test]
    fn site_groups_survive_verbatim_and_merge_is_idempotent(site in site_robots(), ours in token()) {
        let existing = render(&site);
        prop_assume!(!site.iter().any(|(t, _)| t.eq_ignore_ascii_case(&ours)));
        let config = config_with(vec![ours.clone()], vec!["/x/".into()]);
        let once = merge(Some(&existing), &config).map_err(|e| TestCaseError::fail(e.to_string()))?;
        prop_assert!(once.starts_with(existing.trim_end()));
        let again = merge(Some(&once), &config).map_err(|e| TestCaseError::fail(e.to_string()))?;
        prop_assert_eq!(&once, &again);
        let parsed = parse(&once);
        for (t, _) in &site {
            prop_assert!(parsed.groups.iter().any(|g| g.names(t)));
        }
        prop_assert!(parsed.groups.iter().any(|g| g.names(&ours) && g.content_signal.is_some()));
    }

    #[test]
    fn same_token_with_different_rules_is_a_conflict(t in token(), theirs in "/[a-z]{1,6}/", ours in "/[a-z]{1,6}/") {
        prop_assume!(theirs != ours);
        let existing = format!("User-agent: {t}\nDisallow: {theirs}\n");
        let config = config_with(vec![t.to_lowercase()], vec![ours]);
        prop_assert!(merge(Some(&existing), &config).is_err());
    }

    #[test]
    fn same_token_with_identical_rules_is_not_duplicated(t in token(), path in "/[a-z]{1,6}/") {
        let existing = format!("User-agent: {t}\nDisallow: {path}\n");
        let config = config_with(vec![t.clone()], vec![path]);
        let out = merge(Some(&existing), &config).map_err(|e| TestCaseError::fail(e.to_string()))?;
        prop_assert_eq!(parse(&out).groups.iter().filter(|g| g.names(&t)).count(), 1);
    }
}
