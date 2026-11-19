//! Each blocking check: a positive case (the processed fixture passes) and a
//! negative control (one targeted defect makes exactly that check fail).

mod support;

use support::{all_pass, fails, healthy_live, run, static_input};

const SHELL: &str = "<!doctype html><html><head><title>App</title><meta name=\"description\" content=\"d\"><link rel=\"canonical\" href=\"https://example.com/guide/\"></head><body><div id=\"root\"></div><script src=\"/app.js\"></script></body></html>";

#[test]
fn processed_fixture_passes_every_static_blocking_check_but_the_broken_link() {
    let r = run(&static_input());
    for check in [
        "access.spa_shell",
        "access.robots_bots",
        "index.title",
        "index.description",
        "index.canonical",
        "delivery.twin",
    ] {
        all_pass(&r, check);
    }
    fails(&r, "index.broken_links", Some("/"));
    let others = support::findings(&r, "index.broken_links");
    assert!(
        others
            .iter()
            .filter(|f| f.route.as_deref() != Some("/"))
            .all(|f| f.passed)
    );
}

#[test]
fn empty_spa_shell_fails() {
    let mut input = static_input();
    input.pages[1].html = SHELL.into();
    fails(&run(&input), "access.spa_shell", Some("/guide/"));
}

#[test]
fn robots_blocking_a_search_bot_fails() {
    let mut input = static_input();
    input.robots = format!(
        "User-agent: OAI-SearchBot\nDisallow: /\n\n{}",
        input.robots.replace("User-agent: OAI-SearchBot\n", "")
    );
    fails(&run(&input), "access.robots_bots", None);
}

#[test]
fn missing_head_metadata_fails_each_check() {
    let mut input = static_input();
    let html = &input.pages[2].html;
    let stripped: String = html
        .split_inclusive('>')
        .filter(|t| {
            !t.contains("<title")
                && !t.contains("Advanced | Example Docs</title>")
                && !t.contains("name=\"description\"")
                && !t.contains("rel=\"canonical\"")
        })
        .collect();
    input.pages[2].html = stripped;
    let r = run(&input);
    for check in ["index.title", "index.description", "index.canonical"] {
        fails(&r, check, Some("/guide/advanced/"));
    }
}

#[test]
fn missing_and_divergent_twins_fail() {
    let mut input = static_input();
    input.pages[0].markdown = String::new();
    input.pages[1].markdown =
        "---\ntitle: \"x\"\n---\n\n# Guide\n\nSomething else entirely.\n".into();
    let r = run(&input);
    fails(&r, "delivery.twin", Some("/"));
    fails(&r, "delivery.twin", Some("/guide/"));
}

#[test]
fn healthy_live_observations_pass() {
    let mut input = static_input();
    input.live = Some(healthy_live(&input));
    let r = run(&input);
    for check in [
        "access.live_ai_agents",
        "index.live_build",
        "delivery.live_negotiation",
        "delivery.live_files",
    ] {
        all_pass(&r, check);
    }
}

fn live_with(
    edit: impl Fn(&mut geoharness_core::types::LiveObservation),
) -> geoharness_audit::AuditReport {
    let mut input = static_input();
    let mut live = healthy_live(&input);
    live.iter_mut().for_each(edit);
    input.live = Some(live);
    run(&input)
}

#[test]
fn agent_accept_answered_with_html_fails() {
    let r = live_with(|o| {
        if o.accept.starts_with("text/markdown") {
            o.headers.insert("Content-Type".into(), "text/html".into());
        }
    });
    fails(&r, "delivery.live_negotiation", None);
}

#[test]
fn missing_vary_accept_fails() {
    let r = live_with(|o| {
        o.headers.insert("Vary".into(), "Accept-Encoding".into());
    });
    fails(&r, "delivery.live_negotiation", None);
}

#[test]
fn ai_agent_challenged_or_refused_fails() {
    let r = live_with(|o| {
        if o.user_agent.contains("GPTBot") {
            o.status = 403;
        }
        if o.user_agent.contains("ClaudeBot") {
            o.body_prefix = "<title>Just a moment...</title>".into();
        }
    });
    let failed: Vec<_> = support::findings(&r, "access.live_ai_agents")
        .into_iter()
        .filter(|f| !f.passed)
        .collect();
    assert_eq!(failed.len(), 2, "{failed:#?}");
}

#[test]
fn build_meta_mismatch_fails() {
    let r =
        live_with(|o| o.body_prefix = o.body_prefix.replace(support::common::BUILD_ID, "stale"));
    fails(&r, "index.live_build", None);
}

#[test]
fn missing_observation_and_missing_llms_fail() {
    let mut input = static_input();
    let mut live = healthy_live(&input);
    live.retain(|o| !o.url.ends_with("/llms.txt"));
    input.live = Some(live);
    fails(&run(&input), "delivery.live_files", None);
}

#[test]
fn config_less_live_audit_passes_healthy_and_fails_refused_bots() {
    use geoharness_audit::{LiveAuditInput, audit_live};
    use geoharness_core::live::{LiveTarget, plan};
    let routes = vec!["/".to_owned(), "/docs/".to_owned()];
    let target =
        LiveTarget::from_origin("https://example.com", None).unwrap_or_else(|e| panic!("{e:?}"));
    let requests = plan(&target, &routes);
    assert!(
        requests
            .iter()
            .all(|r| r.expect.body_includes.as_deref() != Some("<meta name=\"build\""))
    );
    let mut input = LiveAuditInput {
        origin: "https://example.com".into(),
        routes,
        build_id: None,
        live: support::observe(requests),
    };
    let healthy = audit_live(&input).unwrap_or_else(|e| panic!("{e:?}"));
    assert!(healthy.findings.iter().all(|f| f.passed), "{healthy:#?}");
    assert!(support::findings(&healthy, "index.live_build").is_empty());
    input
        .live
        .iter_mut()
        .filter(|o| o.user_agent.contains("PerplexityBot"))
        .for_each(|o| o.status = 403);
    fails(
        &audit_live(&input).unwrap_or_else(|e| panic!("{e:?}")),
        "access.live_ai_agents",
        None,
    );
    input.origin = "https://example.com/path".into();
    assert!(audit_live(&input).is_err());
}

#[test]
fn build_meta_within_the_live_window_passes() {
    all_pass(&run(&static_input()), "index.build_meta_early");
}

/// A site that writes its own build meta late in a big `<head>`: the live
/// check reads only the first BODY_PREFIX_CHARS, so it fails after deploy.
#[test]
fn build_meta_past_the_live_window_fails_before_deploy() {
    use geoharness_core::live::{BODY_PREFIX_CHARS, build_meta};
    let mut input = static_input();
    let meta = build_meta(&input.build_id);
    let html = input.pages[1].html.replace(&meta, "");
    let padding = format!("<style>{}</style>", "a".repeat(BODY_PREFIX_CHARS));
    input.pages[1].html = html.replacen("</head>", &format!("{padding}{meta}</head>"), 1);
    let r = run(&input);
    fails(&r, "index.build_meta_early", Some("/guide/"));
    let f = support::findings(&r, "index.build_meta_early");
    assert!(f.iter().filter(|x| !x.passed).all(|x| x.evidence.contains("8192")), "{f:#?}");
}

/// Measured in UTF-16 code units, as the host slices the body (`String.slice`).
#[test]
fn build_meta_window_counts_utf16_units_not_bytes() {
    use geoharness_core::live::{BODY_PREFIX_CHARS, build_meta};
    let mut input = static_input();
    let meta = build_meta(&input.build_id);
    let html = input.pages[1].html.replace(&meta, "");
    let head_end = html.find("</head>").unwrap_or_else(|| panic!("no </head>"));
    let before = html[..head_end].encode_utf16().count() + "<style></style>".len() + meta.len();
    // 'é' is 2 bytes but 1 UTF-16 unit: the page fits by units, and would not by bytes.
    let pad = "é".repeat(BODY_PREFIX_CHARS - before);
    input.pages[1].html = html.replacen("</head>", &format!("<style>{pad}</style>{meta}</head>"), 1);
    all_pass(&run(&input), "index.build_meta_early");
}

#[test]
fn a_build_meta_in_another_form_fails_because_the_live_check_matches_it_exactly() {
    use geoharness_core::live::build_meta;
    let mut input = static_input();
    let meta = build_meta(&input.build_id);
    let own = format!("<meta content=\"{}\" name=\"build\" />", input.build_id);
    input.pages[1].html = input.pages[1].html.replace(&meta, &own);
    fails(&run(&input), "index.build_meta_early", Some("/guide/"));
}
