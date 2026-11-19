//! The fixture site (fixtures/core/site), loaded at compile time.
#![allow(dead_code)]

use std::collections::BTreeMap;

use geoharness_core::types::{Existing, PageInput, SiteInput};
use geoharness_core::{SiteConfig, parse_config};

macro_rules! fixture {
    ($p:literal) => {
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fixtures/core/site/",
            $p
        ))
    };
}

pub const BUILD_ID: &str = "0123abcd";

pub fn config() -> SiteConfig {
    match parse_config(fixture!("geoharness.toml")) {
        Ok(c) => c,
        Err(e) => panic!("fixture config invalid: {e:?}"),
    }
}

fn page(
    route: &str,
    file: &str,
    html: &str,
    markdown: Option<&str>,
    lastmod: Option<&str>,
) -> PageInput {
    PageInput {
        route: route.into(),
        file: file.into(),
        html: html.into(),
        markdown: markdown.map(Into::into),
        lastmod: lastmod.map(Into::into),
    }
}

pub fn input() -> SiteInput {
    SiteInput {
        config: config(),
        build_id: BUILD_ID.into(),
        hosts: vec!["example.com".into(), "www.example.com".into()],
        source_lastmod: BTreeMap::from([(
            "pages/guide/advanced/**".to_owned(),
            "2026-11-12T10:00:00Z".to_owned(),
        )]),
        env: BTreeMap::from([("PUBLIC_NAME".to_owned(), "the docs team".to_owned())]),
        pages: vec![
            page(
                "/",
                "index.html",
                fixture!("pages/index.html"),
                None,
                Some("2026-11-10T09:00:00Z"),
            ),
            page(
                "/guide/",
                "guide/index.html",
                fixture!("pages/guide/index.html"),
                None,
                Some("2026-11-01T12:00:00Z"),
            ),
            page(
                "/guide/advanced/",
                "guide/advanced/index.html",
                fixture!("pages/guide/advanced/index.html"),
                None,
                None,
            ),
            page(
                "/private/",
                "private/index.html",
                fixture!("pages/private/index.html"),
                None,
                None,
            ),
            page(
                "/pricing/",
                "pricing/index.html",
                fixture!("pages/pricing/index.html"),
                Some(fixture!("pages/pricing/source.md")),
                Some("2026-10-05T08:30:00Z"),
            ),
            page(
                "/drafts/wip/",
                "drafts/wip/index.html",
                fixture!("pages/drafts/wip/index.html"),
                None,
                None,
            ),
        ],
        existing: Existing {
            robots: Some(fixture!("existing/robots.txt").into()),
            headers: Some(fixture!("existing/_headers").into()),
            llms: None,
            sitemap: None,
        },
    }
}
