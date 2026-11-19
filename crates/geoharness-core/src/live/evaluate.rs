//! Evaluation of one live observation against its planned expectation.

use crate::types::{LiveExpect, LiveObservation};

fn header<'a>(obs: &'a LiveObservation, name: &str) -> Option<&'a str> {
    obs.headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
}

/// Failed expectations of `obs` against `expect`; empty when it passed.
/// `contentType` is a case-insensitive substring of `Content-Type`;
/// `varyIncludes` is a case-insensitive token of `Vary`.
pub fn evaluate(expect: &LiveExpect, obs: &LiveObservation) -> Vec<String> {
    let mut fails = Vec::new();
    if obs.status != expect.status {
        fails.push(format!(
            "status {} (expected {})",
            obs.status, expect.status
        ));
    }
    if let Some(ct) = &expect.content_type {
        let got = header(obs, "content-type").unwrap_or("");
        if !got.to_ascii_lowercase().contains(&ct.to_ascii_lowercase()) {
            fails.push(format!("Content-Type {got:?} (expected {ct})"));
        }
    }
    if let Some(v) = &expect.vary_includes {
        let got = header(obs, "vary").unwrap_or("");
        if !got.split(',').any(|t| t.trim().eq_ignore_ascii_case(v)) {
            fails.push(format!("Vary {got:?} (expected to include {v})"));
        }
    }
    if let Some(b) = &expect.body_includes
        && !obs.body_prefix.contains(b.as_str())
    {
        fails.push(format!("body does not include {b:?}"));
    }
    fails
}
