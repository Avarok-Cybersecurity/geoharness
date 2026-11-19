//! HTML reading (`extract`), conversion to markdown (`markdown`) and
//! fill-only head injection (`inject`).

pub mod absolutize;
pub mod extract;
pub mod inject;
pub mod labels;
pub mod markdown;
pub mod text;

pub use extract::{HeadFacts, MainContent, Page};
