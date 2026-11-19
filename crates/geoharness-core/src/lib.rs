//! Pure core of `GeoHarness`. Every function takes values and returns values:
//! no filesystem, network, clock, environment or process access (SBIO).

pub mod config;
pub mod error;
pub mod glob;
pub mod headers;
pub mod html;
pub mod indexnow;
pub mod links;
pub mod live;
pub mod llms;
pub mod rag;
pub mod rewrite;
pub mod robots;
pub mod site;
pub mod sitemap;
pub mod template;
pub mod tokens;
pub mod twin;
pub mod types;

pub use config::{SiteConfig, parse_config};
pub use error::{CoreError, Error};
pub use site::process_site;
