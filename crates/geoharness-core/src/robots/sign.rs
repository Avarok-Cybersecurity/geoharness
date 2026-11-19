//! Puts the configured `Content-Signal` into the site's own groups.
//!
//! A crawler obeys only the most specific group naming it (RFC 9309), and the
//! site's own groups come first, so a token the site already names (its
//! `User-agent: *` included) never reads a group `GeoHarness` generates. The
//! signal is site-wide policy (`cf-content-signals`), so each site group that
//! lacks one gets the configured line right after its `User-agent` lines; no
//! other line changes. A site group that already states a different signal is
//! a conflict, never overridden.

use super::parse::Group;

/// The site text with a `Content-Signal: <signal>` line added to every group
/// that has none, or `Err` with the agents of groups stating another value.
pub fn sign_site_groups(site: &str, groups: &[Group], signal: &str) -> Result<String, Vec<String>> {
    let conflicts: Vec<String> = groups
        .iter()
        .filter(|g| g.content_signal.as_deref().is_some_and(|s| s != signal))
        .flat_map(|g| g.agents.clone())
        .collect();
    if !conflicts.is_empty() {
        return Err(conflicts);
    }
    let unsigned: Vec<usize> = groups
        .iter()
        .filter(|g| g.content_signal.is_none())
        .filter_map(|g| g.agents_end)
        .collect();
    let mut out = String::with_capacity(site.len());
    for (index, line) in site.lines().enumerate() {
        out.push_str(line);
        out.push('\n');
        if unsigned.contains(&index) {
            out.push_str(&format!("Content-Signal: {signal}\n"));
        }
    }
    Ok(out)
}
