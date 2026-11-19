//! Live checks: the plan from `liveCheckPlan` is the expectation, so the
//! audit and the host's fetch list share one definition.

use geoharness_core::link_header;
use geoharness_core::live::{AGENT_ACCEPT, CHECK_UA, LiveTarget, evaluate, plan};
use geoharness_core::types::{LiveObservation, LiveRequest};

use super::{Scored, pass_fail};
use crate::catalog::{
    Check, LIVE_AI_AGENTS, LIVE_BUILD, LIVE_FILES, LIVE_LINK_HEADER, LIVE_NEGOTIATION,
};
use crate::weights::CHALLENGE_MARKERS;

fn classify(r: &LiveRequest) -> &'static Check {
    if r.user_agent != CHECK_UA {
        &LIVE_AI_AGENTS
    } else if r.accept == AGENT_ACCEPT {
        &LIVE_NEGOTIATION
    } else if r
        .expect
        .body_includes
        .as_deref()
        .is_some_and(|b| b.starts_with("<meta name=\"build\""))
    {
        &LIVE_BUILD
    } else {
        &LIVE_FILES
    }
}

fn find<'a>(r: &LiveRequest, live: &'a [LiveObservation]) -> Option<&'a LiveObservation> {
    live.iter()
        .find(|o| o.url == r.url && o.user_agent == r.user_agent && o.accept == r.accept)
}

/// What a sampled page's (or its twin's) `Link` header must declare: the
/// markdown twin for an HTML response, the canonical page for a twin.
fn link_expectation(r: &LiveRequest) -> Option<(&'static str, Option<&'static str>)> {
    if r.user_agent != CHECK_UA {
        return None;
    }
    match r.expect.content_type.as_deref() {
        Some("text/html") => Some(("alternate", Some("text/markdown"))),
        Some("text/markdown") => Some(("canonical", None)),
        _ => None,
    }
}

/// One advisory finding per sampled page and per sampled twin.
pub fn link_headers(
    target: &LiveTarget,
    routes: &[String],
    live: &[LiveObservation],
) -> Vec<Scored> {
    plan(target, routes)
        .iter()
        .filter_map(|r| {
            let (rel, media) = link_expectation(r)?;
            let header = find(r, live).and_then(|o| {
                o.headers
                    .iter()
                    .find(|(k, _)| k.eq_ignore_ascii_case("link"))
                    .map(|(_, v)| v.as_str())
            });
            let ok = header.is_some_and(|h| {
                link_header::parse(h)
                    .iter()
                    .any(|l| l.has_rel(rel) && media.is_none_or(|m| l.param("type") == Some(m)))
            });
            let want =
                media.map_or_else(|| format!("rel={rel}"), |m| format!("rel={rel} type={m}"));
            let evidence = match header {
                None => format!(
                    "{} (Accept {:?}): no Link header; expected {want}",
                    r.url, r.accept
                ),
                Some(h) => format!(
                    "{} (Accept {:?}): Link {h:?}; expected {want}",
                    r.url, r.accept
                ),
            };
            Some(pass_fail(&LIVE_LINK_HEADER, None, ok, evidence))
        })
        .collect()
}

fn failures(r: &LiveRequest, obs: Option<&LiveObservation>) -> Vec<String> {
    let Some(obs) = obs else {
        return vec!["not observed".to_owned()];
    };
    let mut fails = evaluate(&r.expect, obs);
    if let Some(m) = CHALLENGE_MARKERS
        .iter()
        .find(|m| obs.body_prefix.contains(**m))
    {
        fails.push(format!("bot challenge page ({m:?} in body)"));
    }
    fails
}

/// One finding per planned request of `target`'s plan.
pub fn checks(target: &LiveTarget, routes: &[String], live: &[LiveObservation]) -> Vec<Scored> {
    plan(target, routes)
        .iter()
        .map(|r| {
            let fails = failures(r, find(r, live));
            let what = format!("{} (UA {:?}, Accept {:?})", r.url, r.user_agent, r.accept);
            let evidence = if fails.is_empty() {
                format!("{what}: ok")
            } else {
                format!("{what}: {}", fails.join("; "))
            };
            pass_fail(classify(r), None, fails.is_empty(), evidence)
        })
        .collect()
}
