//! `[[certificates]]`: TLS certificate pairs the host keeps renewed and
//! serves as `<path>.pem` and `<path>.key`. Every key is required.

use serde::{Deserialize, Serialize};

use super::SiteConfig;
use super::validate::{Report, is_email};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Certificate {
    /// The one DNS name the certificate is for (its only SAN).
    pub domain: String,
    /// Output-relative path without extension: served as `<path>.pem` and `<path>.key`.
    pub path: String,
    /// Renew when `notAfter - now <= renewWithinDays` days.
    pub renew_within_days: u32,
    pub key_type: KeyType,
    pub acme_directory: AcmeDirectory,
    /// ACME account contact.
    pub acme_email: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
pub enum KeyType {
    #[serde(rename = "ec-256")]
    Ec256,
    #[serde(rename = "ec-384")]
    Ec384,
    #[serde(rename = "rsa-2048")]
    Rsa2048,
    #[serde(rename = "rsa-3072")]
    Rsa3072,
    #[serde(rename = "rsa-4096")]
    Rsa4096,
}

/// Let's Encrypt's directories; `staging` issues untrusted certificates, for tests.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
pub enum AcmeDirectory {
    Production,
    Staging,
}

/// Let's Encrypt certificates last 90 days; a window of 90 or more would renew on every run.
const MAX_WINDOW_DAYS: u32 = 89;

pub(super) fn certificates(c: &SiteConfig, r: &mut Report) {
    for (i, cert) in c.certificates.iter().enumerate() {
        let key = |k: &str| format!("certificates[{i}].{k}");
        r.check(is_host_name(&cert.domain), &key("domain"), || {
            format!(
                "{:?} must be a lower-case host name with at least two labels (no wildcard)",
                cert.domain
            )
        });
        r.check(is_cert_path(&cert.path), &key("path"), || {
            format!("{:?} must be a relative path of [A-Za-z0-9._-] segments (no leading or trailing '/', no '..')", cert.path)
        });
        r.check(
            !c.certificates[..i].iter().any(|o| o.path == cert.path),
            &key("path"),
            || format!("{:?} is used by an earlier certificate", cert.path),
        );
        r.check(
            (1..=MAX_WINDOW_DAYS).contains(&cert.renew_within_days),
            &key("renewWithinDays"),
            || {
                format!(
                    "{} must be 1–{MAX_WINDOW_DAYS} (certificates last 90 days)",
                    cert.renew_within_days
                )
            },
        );
        r.check(is_email(&cert.acme_email), &key("acmeEmail"), || {
            format!(
                "{:?} must be a single address like name@example.com",
                cert.acme_email
            )
        });
    }
}

fn is_host_name(s: &str) -> bool {
    let labels: Vec<&str> = s.split('.').collect();
    s.len() <= 253
        && labels.len() >= 2
        && labels.iter().all(|l| {
            (1..=63).contains(&l.len())
                && !l.starts_with('-')
                && !l.ends_with('-')
                && l.chars()
                    .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
        })
}

fn is_cert_path(s: &str) -> bool {
    !s.is_empty()
        && s.split('/').all(|seg| {
            !seg.is_empty()
                && seg != "."
                && seg != ".."
                && seg
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
        })
}
