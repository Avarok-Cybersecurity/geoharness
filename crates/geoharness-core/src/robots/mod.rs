//! robots.txt: parsing (`parse`), RFC 9309 matching (`matcher`) and the
//! `GeoHarness` block with Content Signals merged after the site's own file
//! (`merge`). Cited: `cf-content-signals`, `openai-bots`, `anthropic-bots`,
//! `perplexity-bots`.

mod matcher;
mod merge;
mod parse;
mod sign;

pub use matcher::is_allowed;
pub use merge::{BLOCK_BEGIN, BLOCK_END, content_signal_value, merge};
pub use parse::{Group, Robots, Rule, RuleKind, parse, strip_block};
