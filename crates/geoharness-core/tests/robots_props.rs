//! Property tests for merging the `GeoHarness` block into a site's robots.txt.

mod common;

use geoharness_core::config::{BotGroup, BotPolicy};
use geoharness_core::robots::{content_signal_value, merge, parse};
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

/// A site file whose groups may include `*` (the group most crawlers read).
fn site_robots_with_star() -> impl Strategy<Value = Vec<(String, Vec<String>)>> {
    let rules = prop::collection::vec("/[a-z]{0,6}/?", 1..3);
    prop::collection::vec((prop_oneof![token(), Just("*".to_owned())], rules), 0..4)
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
        let site_lines = once
            .lines()
            .filter(|l| !l.starts_with("Content-Signal:"))
            .collect::<Vec<_>>()
            .join("\n");
        prop_assert!(site_lines.starts_with(existing.trim_end()), "site lines changed:\n{}", once);
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

    /// Content Signals are site-wide policy, and a crawler reads only the most
    /// specific group naming it (RFC 9309): every group of the merged file,
    /// the site's own included, must carry exactly the configured signal.
    #[test]
    fn every_group_carries_the_configured_signal(site in site_robots_with_star(), ours in token(), star in any::<bool>()) {
        prop_assume!(!site.iter().any(|(t, _)| t.eq_ignore_ascii_case(&ours)));
        let existing = render(&site);
        let mut config = config_with(vec![ours], vec![]);
        if star {
            let star_rules = site.iter().find(|(t, _)| t == "*").map(|(_, d)| d.clone()).unwrap_or_default();
            config.bots.push(BotPolicy { tokens: vec!["*".into()], allow: vec![], disallow: star_rules, group: BotGroup::Other });
        }
        let expected = content_signal_value(config.content_signal);
        let out = merge(Some(&existing), &config).map_err(|e| TestCaseError::fail(e.to_string()))?;
        let lines = out.lines().filter(|l| l.starts_with("Content-Signal:")).count();
        let parsed = parse(&out);
        prop_assert_eq!(lines, parsed.groups.len(), "one signal line per group:\n{}", out);
        for g in &parsed.groups {
            prop_assert_eq!(g.content_signal.as_deref(), Some(expected.as_str()), "group {:?}:\n{}", g.agents, out);
        }
        let again = merge(Some(&out), &config).map_err(|e| TestCaseError::fail(e.to_string()))?;
        prop_assert_eq!(&out, &again);
    }

    #[test]
    fn a_site_signal_that_differs_is_a_conflict(t in prop_oneof![token(), Just("*".to_owned())]) {
        let existing = format!("User-agent: {t}\nContent-Signal: search=no, ai-input=no, ai-train=no\nDisallow: /a/\n");
        let config = config_with(vec!["OtherBot".into()], vec![]);
        prop_assert!(merge(Some(&existing), &config).is_err());
    }

    #[test]
    fn a_site_signal_that_matches_is_kept_once(t in token()) {
        let config = config_with(vec!["OtherBot".into()], vec![]);
        let value = content_signal_value(config.content_signal);
        let existing = format!("User-agent: {t}\nContent-Signal: {value}\nDisallow: /a/\n");
        let out = merge(Some(&existing), &config).map_err(|e| TestCaseError::fail(e.to_string()))?;
        prop_assert!(out.starts_with(existing.trim_end()));
        prop_assert_eq!(out.matches(&format!("Content-Signal: {value}")).count(), parse(&out).groups.len());
    }
}
