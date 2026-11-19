//! Advisory checks (grade B/C evidence; partial credit where bands exist).

use serde_json::Value;

use super::{PageCtx, Scored, pass_fail, scored};
use crate::catalog::{
    ENTITY_EARLY, FRONT_LOADED, JSON_LD, LINK_COUNT, LLMS_TXT, QUESTION_HEADINGS, TABLES_KEPT,
    VISIBLE_DATE,
};
use crate::weights::{
    ENTITY_WINDOW_PERCENT, FIRST_WINDOW_CHARS, LINKS_FULL_CREDIT_BELOW, LINKS_NO_CREDIT_FROM,
};

pub fn page(p: &PageCtx<'_>, main_selector: &str, entities: &[&str]) -> Vec<Scored> {
    let main = p.page.main(main_selector);
    let text = main.text();
    let route = Some(p.route);
    let mut out = Vec::new();

    let links = p.page.all_links().len();
    let credit = if links < LINKS_FULL_CREDIT_BELOW {
        1.0
    } else if links < LINKS_NO_CREDIT_FROM {
        0.5
    } else {
        0.0
    };
    out.push(scored(
        &LINK_COUNT,
        route,
        credit,
        format!("{links} links on the page"),
    ));

    let body = p.page.body_text();
    let snippet: String = text.chars().take(60).collect();
    let offset = body.find(&snippet).map(|i| body[..i].chars().count());
    let front = main.matched_selector && offset.is_some_and(|o| o <= FIRST_WINDOW_CHARS);
    let evidence = match (main.matched_selector, offset) {
        (false, _) => "main selector matched nothing".to_owned(),
        (true, Some(o)) => format!("main content starts at character {o}"),
        (true, None) => "main content not found in body text".to_owned(),
    };
    out.push(pass_fail(&FRONT_LOADED, route, front, evidence));

    let window = (text.chars().count() * ENTITY_WINDOW_PERCENT).div_ceil(100);
    let head: String = text.chars().take(window).collect::<String>().to_lowercase();
    let named = entities.iter().find(|e| head.contains(&e.to_lowercase()));
    let evidence = named.map_or_else(
        || format!("none of {entities:?} in the first {window} characters"),
        |e| format!("{e:?} within the first {window} characters"),
    );
    out.push(pass_fail(&ENTITY_EARLY, route, named.is_some(), evidence));

    let question = main
        .headings()
        .into_iter()
        .find(|(level, t)| *level >= 2 && is_question(t));
    let evidence = question.as_ref().map_or_else(
        || "no question-style h2–h6".to_owned(),
        |(_, t)| format!("{t:?}"),
    );
    out.push(pass_fail(
        &QUESTION_HEADINGS,
        route,
        question.is_some(),
        evidence,
    ));

    let dated = main.count("time") > 0 || has_date(&text);
    out.push(pass_fail(
        &VISIBLE_DATE,
        route,
        dated,
        if dated {
            "date found"
        } else {
            "no visible date"
        },
    ));

    if main.count("table") > 0 {
        let kept = p
            .markdown
            .lines()
            .any(|l| l.trim_start().starts_with('|') && l.contains("---"));
        out.push(pass_fail(
            &TABLES_KEPT,
            route,
            kept,
            if kept {
                "markdown table present"
            } else {
                "table flattened"
            },
        ));
    }

    let blocks = p.page.head().json_ld;
    let valid = !blocks.is_empty() && blocks.iter().all(|b| json_ld_ok(b));
    let evidence = format!(
        "{} JSON-LD block(s), {}",
        blocks.len(),
        if valid { "valid" } else { "missing or invalid" }
    );
    out.push(pass_fail(&JSON_LD, route, valid, evidence));
    out
}

pub fn llms(llms: Option<&str>) -> Scored {
    let ok = llms.is_some_and(|l| {
        l.starts_with("# ")
            && l.lines().any(|x| x.starts_with("> "))
            && l.lines().any(|x| x.starts_with("## "))
    });
    let evidence = match (llms, ok) {
        (None, _) => "no llms.txt",
        (Some(_), true) => "H1, blockquote summary and H2 link sections present",
        (Some(_), false) => "llms.txt lacks the H1/blockquote/H2 structure",
    };
    pass_fail(&LLMS_TXT, None, ok, evidence)
}

const QUESTION_WORDS: [&str; 12] = [
    "what", "how", "why", "when", "where", "who", "which", "can", "does", "is", "are", "should",
];

fn is_question(t: &str) -> bool {
    let first = t.split_whitespace().next().unwrap_or("").to_lowercase();
    t.trim_end().ends_with('?') || QUESTION_WORDS.contains(&first.as_str())
}

fn json_ld_ok(block: &str) -> bool {
    let has = |v: &Value| {
        v.get("@context").is_some() && (v.get("@type").is_some() || v.get("@graph").is_some())
    };
    match serde_json::from_str::<Value>(block) {
        Ok(Value::Array(items)) => !items.is_empty() && items.iter().all(has),
        Ok(v) => has(&v),
        Err(_) => false,
    }
}

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/// ISO `YYYY-MM-DD`, or a month name followed within 12 characters by a year.
fn has_date(text: &str) -> bool {
    let b = text.as_bytes();
    let digit = |i: usize| b.get(i).is_some_and(u8::is_ascii_digit);
    let iso = (0..b.len()).any(|i| {
        (0..4).all(|k| digit(i + k))
            && b.get(i + 4) == Some(&b'-')
            && digit(i + 5)
            && digit(i + 6)
            && b.get(i + 7) == Some(&b'-')
            && digit(i + 8)
            && digit(i + 9)
    });
    let lower = text.to_lowercase();
    let words: Vec<&str> = lower.split_whitespace().collect();
    let named = words.iter().enumerate().any(|(i, w)| {
        MONTHS.iter().any(|m| w.starts_with(m))
            && words[i + 1..].iter().take(2).any(|n| {
                let y = n.trim_matches(|c: char| !c.is_ascii_digit());
                y.len() == 4 && (y.starts_with("19") || y.starts_with("20"))
            })
    });
    iso || named
}

#[cfg(test)]
mod tests {
    use super::{has_date, is_question};

    #[test]
    fn dates_and_questions() {
        assert!(has_date("Updated 2026-11-01."));
        assert!(has_date("Updated November 1, 2026."));
        assert!(!has_date("Version 2026 of nothing"));
        assert!(is_question("How do I install it"));
        assert!(!is_question("Options"));
    }
}
