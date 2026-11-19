//! Blocking access checks: empty SPA shells and robots.txt blocking the
//! agents that fetch pages for search and for users.

use geoharness_core::config::BotGroup;
use geoharness_core::robots;

use super::{PageCtx, Scored, pass_fail};
use crate::catalog::{ROBOTS_BOTS, SPA_SHELL};
use crate::types::AuditInput;
use crate::weights::{MUST_ADMIT, SPA_MIN_TEXT_CHARS};

pub fn spa_shell(p: &PageCtx<'_>) -> Scored {
    let chars = p.page.body_text().chars().count();
    pass_fail(
        &SPA_SHELL,
        Some(p.route),
        chars >= SPA_MIN_TEXT_CHARS,
        format!("{chars} characters of visible text in the HTML (threshold {SPA_MIN_TEXT_CHARS})"),
    )
}

pub fn robots_bots(input: &AuditInput) -> Scored {
    let parsed = robots::parse(&input.robots);
    let configured = input
        .config
        .bots
        .iter()
        .filter(|b| matches!(b.group, BotGroup::Search | BotGroup::User))
        .flat_map(|b| b.tokens.iter().map(String::as_str));
    let mut agents: Vec<&str> = MUST_ADMIT
        .iter()
        .copied()
        .chain(configured)
        .filter(|t| *t != "*")
        .collect();
    agents.sort_unstable();
    agents.dedup();
    let blocked: Vec<&str> = agents
        .into_iter()
        .filter(|a| !robots::is_allowed(&parsed, a, "/"))
        .collect();
    let evidence = if blocked.is_empty() {
        "every search and user agent may fetch /".to_owned()
    } else {
        format!("robots.txt disallows / for: {}", blocked.join(", "))
    };
    pass_fail(&ROBOTS_BOTS, None, blocked.is_empty(), evidence)
}
