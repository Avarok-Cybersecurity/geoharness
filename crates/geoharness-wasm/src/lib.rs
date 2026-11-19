//! `wasm-bindgen` exports of the GeoHarness core.
//!
//! Every export takes a plain JS object (`parseConfig` takes the TOML text)
//! and returns the contract's `Result<T>` as a plain object:
//! `{ ok: true, value }` or `{ ok: false, errors: CoreError[] }`. Objects
//! cross the boundary with `serde-wasm-bindgen` in JSON-compatible mode (maps
//! become objects, never `Map`; no field is a `BigInt`). Target:
//! `wasm32-unknown-unknown` only.

pub mod calls;

use serde::Serialize;
use serde_wasm_bindgen::{Deserializer, Serializer};
use wasm_bindgen::prelude::{JsError, JsValue, wasm_bindgen};

/// Converts an envelope to a plain JS object. Failing here means the
/// envelope itself could not be represented, so it throws.
fn to_js(value: &serde_json::Value) -> Result<JsValue, JsError> {
    value
        .serialize(&Serializer::json_compatible())
        .map_err(|e| JsError::new(&e.to_string()))
}

/// `parseConfig(toml) -> Result<SiteConfig>`.
#[wasm_bindgen(js_name = parseConfig)]
pub fn parse_config(toml: &str) -> Result<JsValue, JsError> {
    to_js(&calls::parse_config(toml))
}

/// `processSite(SiteInput) -> Result<SiteOutput>`.
#[wasm_bindgen(js_name = processSite)]
pub fn process_site(input: JsValue) -> Result<JsValue, JsError> {
    to_js(&calls::process_site(Deserializer::from(input)))
}

/// `audit(AuditInput) -> Result<AuditReport>`.
#[wasm_bindgen(js_name = audit)]
pub fn audit(input: JsValue) -> Result<JsValue, JsError> {
    to_js(&calls::audit(Deserializer::from(input)))
}

/// `auditLive(LiveAuditInput) -> Result<AuditReport>`: no config needed.
#[wasm_bindgen(js_name = auditLive)]
pub fn audit_live(input: JsValue) -> Result<JsValue, JsError> {
    to_js(&calls::audit_live(Deserializer::from(input)))
}

/// `liveCheckPlan(LiveCheckInput) -> Result<LiveRequest[]>`.
#[wasm_bindgen(js_name = liveCheckPlan)]
pub fn live_check_plan(input: JsValue) -> Result<JsValue, JsError> {
    to_js(&calls::live_check_plan(Deserializer::from(input)))
}

/// `ragInputs(RagInput) -> Result<RagOutput>`.
#[wasm_bindgen(js_name = ragInputs)]
pub fn rag_inputs(input: JsValue) -> Result<JsValue, JsError> {
    to_js(&calls::rag_inputs(Deserializer::from(input)))
}
