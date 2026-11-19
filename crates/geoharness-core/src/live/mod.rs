//! `liveCheckPlan` (contract §4) and the evaluation of one observation
//! against its expectation (used by the audit, so plan and check share one
//! definition).

mod evaluate;

pub use evaluate::evaluate;

use crate::config::{SiteConfig, is_origin, validate};
use crate::error::{CoreError, Error};
use crate::types::{LiveCheckInput, LiveExpect, LiveRequest};

/// What an agent that prefers markdown sends (`checkly-2026`).
pub const AGENT_ACCEPT: &str = "text/markdown, text/html, */*";
/// What a browser sends for a navigation.
pub const BROWSER_ACCEPT: &str = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
/// What AI crawlers send for a page.
pub const BOT_ACCEPT: &str = "text/html, */*";
pub const CHECK_UA: &str = "Mozilla/5.0 (compatible; GeoHarness-LiveCheck/1.0; +https://github.com/Avarok-Cybersecurity/geoharness)";
/// The eight AI user agents (`openai-bots`, `anthropic-bots`, `perplexity-bots`).
pub const AI_AGENTS: [&str; 8] = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-User",
    "Claude-SearchBot",
    "PerplexityBot",
    "Perplexity-User",
];
/// Routes sampled for the Accept matrix: `/` plus up to this many others.
pub const SAMPLED_ROUTES: usize = 4;

pub fn ai_user_agent(token: &str) -> String {
    format!(
        "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; {token}/1.0; +https://github.com/Avarok-Cybersecurity/geoharness)"
    )
}

/// `<meta name="build" content="...">` exactly as `processSite` injects it.
pub fn build_meta(build_id: &str) -> String {
    format!("<meta name=\"build\" content=\"{build_id}\">")
}

/// `/` plus up to [`SAMPLED_ROUTES`] others, evenly spaced over the sorted list.
pub fn sample_routes(routes: &[String]) -> Vec<String> {
    let mut others: Vec<&String> = routes.iter().filter(|r| r.as_str() != "/").collect();
    others.sort();
    others.dedup();
    let mut out = vec!["/".to_owned()];
    let n = others.len();
    let take = n.min(SAMPLED_ROUTES);
    for i in 0..take {
        out.push(others[i * n / take].clone());
    }
    out
}

fn req(
    url: String,
    ua: &str,
    accept: &str,
    status: u16,
    ct: Option<&str>,
    vary: Option<&str>,
    body: Option<String>,
) -> LiveRequest {
    LiveRequest {
        url,
        user_agent: ua.to_owned(),
        accept: accept.to_owned(),
        expect: LiveExpect {
            status,
            content_type: ct.map(str::to_owned),
            vary_includes: vary.map(str::to_owned),
            body_includes: body,
        },
    }
}

/// Who is being checked: from a config, or from a bare origin for the
/// config-less live audit (`geoharness audit <url>`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveTarget {
    pub origin: String,
    /// Expected llms.txt H1; `None` only checks that llms.txt has an H1.
    pub site_name: Option<String>,
    /// Expected build meta; `None` omits the build check.
    pub build_id: Option<String>,
}

impl LiveTarget {
    /// From a validated config (all expectations).
    pub fn from_config(
        config: &SiteConfig,
        build_id: Option<&str>,
    ) -> Result<Self, Vec<CoreError>> {
        validate(config)?;
        Self::checked(
            config.site.origin.clone(),
            Some(config.site.name.clone()),
            build_id,
        )
    }

    /// From a bare origin (no geoharness.toml).
    pub fn from_origin(origin: &str, build_id: Option<&str>) -> Result<Self, Vec<CoreError>> {
        if !is_origin(origin) {
            return Err(vec![
                Error::InputInvalid(format!("{origin:?} must be https://host with no path"))
                    .at("origin"),
            ]);
        }
        Self::checked(origin.to_owned(), None, build_id)
    }

    /// From the §4 input: exactly one of `config` and `origin`.
    pub fn from_input(input: &LiveCheckInput) -> Result<Self, Vec<CoreError>> {
        match (&input.config, &input.origin) {
            (Some(c), None) => Self::from_config(c, input.build_id.as_deref()),
            (None, Some(o)) => Self::from_origin(o, input.build_id.as_deref()),
            _ => Err(vec![
                Error::InputInvalid("give exactly one of config and origin".into()).at("config"),
            ]),
        }
    }

    fn checked(
        origin: String,
        site_name: Option<String>,
        build_id: Option<&str>,
    ) -> Result<Self, Vec<CoreError>> {
        if build_id.is_some_and(|b| b.is_empty() || b.contains(['"', '<', '>'])) {
            return Err(vec![
                Error::InputInvalid("buildId is empty or not a plain id".into()).at("buildId"),
            ]);
        }
        Ok(Self {
            origin,
            site_name,
            build_id: build_id.map(str::to_owned),
        })
    }
}

/// Contract §4.
pub fn live_check_plan(input: &LiveCheckInput) -> Result<Vec<LiveRequest>, Vec<CoreError>> {
    Ok(plan(&LiveTarget::from_input(input)?, &input.routes))
}

/// The request matrix for `target`.
pub fn plan(target: &LiveTarget, routes: &[String]) -> Vec<LiveRequest> {
    let origin = &target.origin;
    let mut plan = Vec::new();
    for route in sample_routes(routes) {
        let url = format!("{origin}{route}");
        plan.push(req(
            url.clone(),
            CHECK_UA,
            AGENT_ACCEPT,
            200,
            Some("text/markdown"),
            Some("accept"),
            None,
        ));
        let body = target
            .build_id
            .as_deref()
            .filter(|_| route == "/")
            .map(build_meta);
        plan.push(req(
            url,
            CHECK_UA,
            BROWSER_ACCEPT,
            200,
            Some("text/html"),
            Some("accept"),
            body,
        ));
    }
    for token in AI_AGENTS {
        plan.push(req(
            format!("{origin}/"),
            &ai_user_agent(token),
            BOT_ACCEPT,
            200,
            None,
            None,
            None,
        ));
    }
    let name = target
        .site_name
        .as_ref()
        .map_or_else(|| "# ".to_owned(), |n| format!("# {n}"));
    for (path, ct, body) in [
        ("/robots.txt", "text/plain", "Content-Signal:".to_owned()),
        ("/llms.txt", "text/plain", name),
        ("/sitemap.xml", "xml", "<urlset".to_owned()),
    ] {
        plan.push(req(
            format!("{origin}{path}"),
            CHECK_UA,
            BROWSER_ACCEPT,
            200,
            Some(ct),
            None,
            Some(body),
        ));
    }
    plan
}
