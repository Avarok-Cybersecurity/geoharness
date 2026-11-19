use super::{SiteConfig, validate};
use crate::error::{CoreError, Error};

/// Contract §1: parses and validates `geoharness.toml`.
pub fn parse_config(source: &str) -> Result<SiteConfig, Vec<CoreError>> {
    let deserializer = toml::Deserializer::parse(source)
        .map_err(|e| vec![Error::ConfigSyntax(e.message().to_owned()).into_core()])?;
    let config: SiteConfig = serde_path_to_error::deserialize(deserializer).map_err(|e| {
        let path = e.path().to_string();
        let message = e.inner().message().to_owned();
        vec![classify(&message, &path).at(path)]
    })?;
    validate(&config)?;
    Ok(config)
}

fn classify(message: &str, path: &str) -> Error {
    if message.starts_with("unknown field") {
        Error::ConfigUnknownKey(format!("{path}: {message}"))
    } else if message.starts_with("missing field") {
        Error::ConfigMissingKey(format!("{path}: {message}"))
    } else {
        Error::ConfigInvalid(format!("{path}: {message}"))
    }
}
