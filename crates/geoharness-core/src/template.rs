//! `{{geo.build_id}}`, `{{geo.lastmod}}`, `{{env.NAME}}` substitution.
//! Only `geo.` and `env.` expressions are touched; any other `{{...}}` is left
//! verbatim so pages that legitimately contain braces are not corrupted.

use std::collections::BTreeMap;

use crate::error::Error;

/// Values a template may read.
pub struct TemplateContext<'a> {
    pub build_id: &'a str,
    pub lastmod: Option<&'a str>,
    pub declared_env: &'a [String],
    pub env: &'a BTreeMap<String, String>,
}

/// Expands every `geo.`/`env.` expression in `input`.
pub fn render(input: &str, ctx: &TemplateContext<'_>) -> Result<String, Error> {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find("{{") {
        let after = &rest[start + 2..];
        let Some(end) = after.find("}}") else { break };
        let expr = after[..end].trim();
        out.push_str(&rest[..start]);
        match resolve(expr, ctx)? {
            Some(value) => out.push_str(value),
            None => out.push_str(&rest[start..start + 2 + end + 2]),
        }
        rest = &after[end + 2..];
    }
    out.push_str(rest);
    Ok(out)
}

fn resolve<'a>(expr: &str, ctx: &'a TemplateContext<'_>) -> Result<Option<&'a str>, Error> {
    if let Some(key) = expr.strip_prefix("geo.") {
        return match key {
            "build_id" => Ok(Some(ctx.build_id)),
            "lastmod" => ctx.lastmod.map(Some).ok_or_else(|| {
                Error::TemplateMissingValue("geo.lastmod (page has no lastmod)".into())
            }),
            other => Err(Error::TemplateUnknown(format!(
                "unknown variable geo.{other}"
            ))),
        };
    }
    if let Some(name) = expr.strip_prefix("env.") {
        if !ctx.declared_env.iter().any(|d| d == name) {
            return Err(Error::TemplateUndeclaredEnv(name.to_owned()));
        }
        return ctx
            .env
            .get(name)
            .map(|v| Some(v.as_str()))
            .ok_or_else(|| Error::TemplateMissingValue(format!("env.{name} was not supplied")));
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx<'a>(env: &'a BTreeMap<String, String>, declared: &'a [String]) -> TemplateContext<'a> {
        TemplateContext {
            build_id: "abc",
            lastmod: Some("2026-01-02"),
            declared_env: declared,
            env,
        }
    }

    #[test]
    fn expands_known_and_leaves_foreign_braces() {
        let env = BTreeMap::from([("NAME".to_owned(), "x".to_owned())]);
        let declared = vec!["NAME".to_owned()];
        let out = render(
            "{{ geo.build_id }}/{{geo.lastmod}}/{{env.NAME}}/{{ other }}",
            &ctx(&env, &declared),
        );
        assert_eq!(out, Ok("abc/2026-01-02/x/{{ other }}".to_owned()));
    }

    #[test]
    fn undeclared_env_is_an_error_not_empty() {
        let env = BTreeMap::from([("SECRET".to_owned(), "x".to_owned())]);
        let out = render("{{env.SECRET}}", &ctx(&env, &[]));
        assert_eq!(out, Err(Error::TemplateUndeclaredEnv("SECRET".into())));
    }

    #[test]
    fn unknown_geo_variable_is_an_error() {
        let env = BTreeMap::new();
        assert!(matches!(
            render("{{geo.nope}}", &ctx(&env, &[])),
            Err(Error::TemplateUnknown(_))
        ));
    }
}
