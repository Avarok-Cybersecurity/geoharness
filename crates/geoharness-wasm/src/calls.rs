//! Target-independent call layer: decode any serde input, run the core, and
//! build the contract's `Result<T>` envelope. The wasm exports feed it a
//! `JsValue` deserializer; native tests feed it `serde_json::Value`.

use serde::Serialize;
use serde::de::{Deserialize, DeserializeOwned, Deserializer};
use serde_json::{Value, json};

use geoharness_audit::{AuditInput, LiveAuditInput};
use geoharness_core::rag::RagInput;
use geoharness_core::types::{LiveCheckInput, SiteInput};
use geoharness_core::{CoreError, Error};

/// `{ok:true,value}` or `{ok:false,errors}`.
pub fn envelope<T: Serialize>(result: Result<T, Vec<CoreError>>) -> Value {
    let errors = |errors: Vec<CoreError>| json!({ "ok": false, "errors": errors });
    match result.map(|v| serde_json::to_value(v)) {
        Ok(Ok(value)) => json!({ "ok": true, "value": value }),
        Ok(Err(e)) => errors(vec![
            Error::InputInvalid(format!("output serialization: {e}")).into_core(),
        ]),
        Err(e) => errors(e),
    }
}

/// Decodes with the JSON path of the first bad field in the error.
pub fn decode<'de, D: Deserializer<'de>, T: Deserialize<'de>>(de: D) -> Result<T, Vec<CoreError>>
where
    D::Error: std::fmt::Display,
{
    serde_path_to_error::deserialize(de).map_err(|e| {
        let path = e.path().to_string();
        vec![Error::InputInvalid(e.inner().to_string()).at(path)]
    })
}

fn run<'de, D, I, O>(de: D, f: impl FnOnce(&I) -> Result<O, Vec<CoreError>>) -> Value
where
    D: Deserializer<'de>,
    D::Error: std::fmt::Display,
    I: DeserializeOwned,
    O: Serialize,
{
    envelope(decode::<D, I>(de).and_then(|i| f(&i)))
}

pub fn parse_config(toml: &str) -> Value {
    envelope(geoharness_core::parse_config(toml))
}

pub fn process_site<'de, D: Deserializer<'de>>(de: D) -> Value
where
    D::Error: std::fmt::Display,
{
    run(de, |i: &SiteInput| geoharness_core::process_site(i))
}

pub fn audit<'de, D: Deserializer<'de>>(de: D) -> Value
where
    D::Error: std::fmt::Display,
{
    run(de, |i: &AuditInput| geoharness_audit::audit(i))
}

pub fn audit_live<'de, D: Deserializer<'de>>(de: D) -> Value
where
    D::Error: std::fmt::Display,
{
    run(de, |i: &LiveAuditInput| geoharness_audit::audit_live(i))
}

pub fn live_check_plan<'de, D: Deserializer<'de>>(de: D) -> Value
where
    D::Error: std::fmt::Display,
{
    run(de, |i: &LiveCheckInput| {
        geoharness_core::live::live_check_plan(i)
    })
}

pub fn rag_inputs<'de, D: Deserializer<'de>>(de: D) -> Value
where
    D::Error: std::fmt::Display,
{
    run(de, |i: &RagInput| geoharness_core::rag::rag_inputs(i))
}
