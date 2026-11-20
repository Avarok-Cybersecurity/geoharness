//! parseConfig: `[[certificates]]` — every key required, each value validated.

use geoharness_core::config::{AcmeDirectory, KeyType};
use geoharness_core::parse_config;

const BASE: &str = include_str!("../../../fixtures/core/site/geoharness.toml");

const CERT: &str = r#"
[[certificates]]
domain = "local.example.com"
path = "agent/loopback"
renewWithinDays = 30
keyType = "ec-256"
acmeDirectory = "production"
acmeEmail = "security@example.com"
"#;

fn with(block: &str) -> String {
    format!("{BASE}\n{block}")
}

fn errors(toml: &str) -> Vec<(String, Option<String>)> {
    parse_config(toml)
        .err()
        .unwrap_or_default()
        .into_iter()
        .map(|e| (e.code, e.path))
        .collect()
}

fn invalid_at(toml: &str, path: &str) -> bool {
    errors(toml)
        .iter()
        .any(|(c, p)| c == "config.invalid" && p.as_deref() == Some(path))
}

#[test]
fn absent_means_no_certificates() {
    assert!(parse_config(BASE).is_ok_and(|c| c.certificates.is_empty()));
}

#[test]
fn a_complete_entry_parses() {
    let c = parse_config(&with(CERT)).unwrap_or_else(|e| panic!("{e:?}"));
    let cert = &c.certificates[0];
    assert_eq!(cert.domain, "local.example.com");
    assert_eq!(cert.path, "agent/loopback");
    assert_eq!(cert.renew_within_days, 30);
    assert_eq!(cert.key_type, KeyType::Ec256);
    assert_eq!(cert.acme_directory, AcmeDirectory::Production);
    assert_eq!(cert.acme_email, "security@example.com");
}

#[test]
fn every_key_is_required() {
    for key in [
        "domain",
        "path",
        "renewWithinDays",
        "keyType",
        "acmeDirectory",
        "acmeEmail",
    ] {
        let block = CERT
            .lines()
            .filter(|l| !l.starts_with(&format!("{key} =")))
            .collect::<Vec<_>>()
            .join("\n");
        let got = errors(&with(&block));
        assert!(
            got.iter().any(|(c, _)| c == "config.missing_key"),
            "{key}: {got:?}"
        );
    }
}

#[test]
fn unknown_key_type_and_directory_are_rejected() {
    assert!(!errors(&with(&CERT.replace("\"ec-256\"", "\"ec256\""))).is_empty());
    assert!(!errors(&with(&CERT.replace("\"production\"", "\"prod\""))).is_empty());
}

#[test]
fn the_window_is_one_to_eighty_nine_days() {
    let window =
        |n: &str| with(&CERT.replace("renewWithinDays = 30", &format!("renewWithinDays = {n}")));
    assert!(invalid_at(&window("0"), "certificates[0].renewWithinDays"));
    assert!(invalid_at(&window("90"), "certificates[0].renewWithinDays"));
    assert!(parse_config(&window("1")).is_ok());
    assert!(parse_config(&window("89")).is_ok());
    assert!(!errors(&window("-1")).is_empty());
}

#[test]
fn path_must_be_a_plain_relative_path() {
    for bad in [
        "../etc/key",
        "agent/../x",
        "/agent/loopback",
        "agent/loopback/",
        "agent//x",
        "agent/loop back",
        "",
    ] {
        let toml = with(&CERT.replace("\"agent/loopback\"", &format!("{bad:?}")));
        assert!(invalid_at(&toml, "certificates[0].path"), "{bad:?}");
    }
    let ok = with(&CERT.replace("\"agent/loopback\"", "\".well-known/agent_cert-1\""));
    assert!(parse_config(&ok).is_ok());
}

#[test]
fn domain_must_be_a_host_name() {
    for bad in [
        "*.example.com",
        "Local.Example.com",
        "localhost",
        "https://x.example.com",
        "x.example.com.",
        "a..example.com",
        "-a.example.com",
    ] {
        let toml = with(&CERT.replace("\"local.example.com\"", &format!("{bad:?}")));
        assert!(invalid_at(&toml, "certificates[0].domain"), "{bad:?}");
    }
}

#[test]
fn email_must_be_one_address() {
    let toml = with(&CERT.replace("security@example.com", "not an address"));
    assert!(invalid_at(&toml, "certificates[0].acmeEmail"));
}

#[test]
fn two_entries_may_not_share_a_path() {
    let second = CERT.replace("local.example.com", "other.example.com");
    assert!(invalid_at(
        &with(&format!("{CERT}{second}")),
        "certificates[1].path"
    ));
}
