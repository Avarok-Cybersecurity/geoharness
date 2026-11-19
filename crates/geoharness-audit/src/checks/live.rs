//! Live checks: the plan from `liveCheckPlan` is the expectation, so the
//! audit and the host's fetch list share one definition.

use geoharness_core::live::{AGENT_ACCEPT, CHECK_UA, LiveTarget, evaluate, plan};
use geoharness_core::types::{LiveObservation, LiveRequest};

use super::{Scored, pass_fail};
use crate::catalog::{Check, LIVE_AI_AGENTS, LIVE_BUILD, LIVE_FILES, LIVE_NEGOTIATION};
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
            let obs = live
                .iter()
                .find(|o| o.url == r.url && o.user_agent == r.user_agent && o.accept == r.accept);
            let fails = failures(r, obs);
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
