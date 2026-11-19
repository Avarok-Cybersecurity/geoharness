//! Typed errors. Each variant maps to one stable `code` string of the
//! contract's `CoreError` (see `docs/architecture/contract.md`, "Error codes").

use serde::{Deserialize, Serialize};

/// The contract's `CoreError`: `{ code, message, path? }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct CoreError {
    pub code: String,
    pub message: String,
    /// Config key (dotted) or output-relative file the error concerns.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub path: Option<String>,
}

/// Every failure the core can report. `code()` is the wire code.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum Error {
    #[error("invalid TOML: {0}")]
    ConfigSyntax(String),
    #[error("unknown key: {0}")]
    ConfigUnknownKey(String),
    #[error("missing required key: {0}")]
    ConfigMissingKey(String),
    #[error("invalid value: {0}")]
    ConfigInvalid(String),
    #[error("invalid input: {0}")]
    InputInvalid(String),
    #[error("template: {0}")]
    TemplateUnknown(String),
    #[error("template reads an undeclared env name: {0}")]
    TemplateUndeclaredEnv(String),
    #[error("template value missing: {0}")]
    TemplateMissingValue(String),
    #[error("env name not declared in config.env: {0}")]
    EnvUndeclared(String),
    #[error("html: {0}")]
    Html(String),
    #[error("robots.txt conflict: {0}")]
    RobotsConflict(String),
    #[error("_headers has too many rules: {0}")]
    HeadersTooManyRules(String),
}

impl Error {
    /// The stable wire code of this error.
    pub fn code(&self) -> &'static str {
        match self {
            Self::ConfigSyntax(_) => "config.syntax",
            Self::ConfigUnknownKey(_) => "config.unknown_key",
            Self::ConfigMissingKey(_) => "config.missing_key",
            Self::ConfigInvalid(_) => "config.invalid",
            Self::InputInvalid(_) => "input.invalid",
            Self::TemplateUnknown(_) => "template.unknown",
            Self::TemplateUndeclaredEnv(_) => "template.undeclared_env",
            Self::TemplateMissingValue(_) => "template.missing_value",
            Self::EnvUndeclared(_) => "env.undeclared",
            Self::Html(_) => "html.rewrite",
            Self::RobotsConflict(_) => "robots.conflict",
            Self::HeadersTooManyRules(_) => "headers.too_many_rules",
        }
    }

    /// Converts to the wire form, attaching a config key or file path.
    pub fn at(self, path: impl Into<String>) -> CoreError {
        CoreError {
            code: self.code().to_owned(),
            message: self.to_string(),
            path: Some(path.into()),
        }
    }

    /// Converts to the wire form without a path.
    pub fn into_core(self) -> CoreError {
        CoreError {
            code: self.code().to_owned(),
            message: self.to_string(),
            path: None,
        }
    }
}

/// Non-fatal conditions reported in `SiteOutput.warnings`.
pub mod warning {
    pub const NO_MAIN: &str = "page.no_main";
    pub const EXISTING_KEPT: &str = "output.existing_kept";
    pub const SECTION_EMPTY: &str = "llms.section_empty";
    pub const JSONLD_INVALID: &str = "page.jsonld_invalid";
    pub const MIXED_LAYOUT: &str = "rewrite.mixed_layout";
    pub const CSP_EXTENDED: &str = "headers.csp_extended";
    pub const NO_LASTMOD: &str = "page.no_lastmod";
    pub const LINK_SKIPPED: &str = "headers.link_skipped";
}

/// Builds a warning `CoreError`.
pub fn warn(code: &str, message: impl Into<String>, path: Option<String>) -> CoreError {
    CoreError {
        code: code.to_owned(),
        message: message.into(),
        path,
    }
}

/// Accumulated errors; the contract returns all of them, not just the first.
pub type Errors = Vec<CoreError>;
