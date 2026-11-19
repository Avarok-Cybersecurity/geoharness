//! Aggregation: category score = mean credit × 100 over its findings;
//! total = weight-averaged category scores over categories that have
//! findings (so a static audit is not penalized for absent live data).

use crate::checks::Scored;
use crate::types::{AuditReport, CategoryScore};
use crate::weights::CATEGORIES;

fn round1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

pub fn report(scored: Vec<Scored>) -> AuditReport {
    let mut categories = Vec::new();
    for c in &CATEGORIES {
        let credits: Vec<f64> = scored
            .iter()
            .filter(|s| s.category == c.id)
            .map(|s| s.credit)
            .collect();
        if credits.is_empty() {
            continue;
        }
        let mean = credits.iter().sum::<f64>()
            / f64::from(u32::try_from(credits.len()).unwrap_or(u32::MAX));
        categories.push(CategoryScore {
            id: c.id.into(),
            title: c.title.into(),
            weight: c.weight,
            score: round1(mean * 100.0),
        });
    }
    let total_weight: f64 = categories.iter().map(|c| c.weight).sum();
    let score = if total_weight > 0.0 {
        round1(categories.iter().map(|c| c.weight * c.score).sum::<f64>() / total_weight)
    } else {
        0.0
    };
    AuditReport {
        score,
        categories,
        findings: scored.into_iter().map(|s| s.finding).collect(),
    }
}
