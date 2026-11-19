//! Input checks the core re-does even though the host should have done them.

use std::collections::BTreeSet;

use super::undeclared_env;
use crate::error::{CoreError, Error};
use crate::types::SiteInput;

pub fn input(input: &SiteInput) -> Result<(), Vec<CoreError>> {
    let mut errors = Vec::new();
    for name in input.env.keys() {
        if !input.config.env.contains(name) {
            errors.push(undeclared_env(name));
        }
    }
    let id = &input.build_id;
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        errors.push(
            Error::InputInvalid(format!("buildId {id:?} must be [A-Za-z0-9._-]+")).at("buildId"),
        );
    }
    let mut routes = BTreeSet::new();
    let mut files = BTreeSet::new();
    for p in &input.pages {
        if !p.route.starts_with('/') || p.route.contains(['?', '#', ' ', '\n']) {
            errors.push(
                Error::InputInvalid(format!("route {:?} must be an absolute path", p.route))
                    .at(p.file.clone()),
            );
        }
        if !routes.insert(p.route.as_str()) {
            errors.push(
                Error::InputInvalid(format!("route {:?} appears twice", p.route))
                    .at(p.file.clone()),
            );
        }
        if !files.insert(p.file.as_str()) || p.file.split('/').any(|s| s == ".." || s.is_empty()) {
            errors.push(
                Error::InputInvalid(format!(
                    "file {:?} is duplicated or not a clean relative path",
                    p.file
                ))
                .at(p.file.clone()),
            );
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}
