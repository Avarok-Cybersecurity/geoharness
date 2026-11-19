# Security policy

## Supported versions

| Version | Supported |
|---|---|
| v1.x | Yes |
| < 1.0 | No |

## Reporting a vulnerability

Please do **not** open a public issue. Report privately through GitHub's
[private vulnerability reporting](https://github.com/Avarok-Cybersecurity/geoharness/security/advisories/new)
for this repository. Include the affected version or commit, a description, reproduction steps and the impact
you expect. We acknowledge reports within 3 business days and aim to ship a fix or mitigation within 30 days,
coordinating disclosure with you.

## Scope

In scope: the action (`action.yml`, `dist/`), the host (`host/`), the core (`crates/`), the negotiate Worker
(`edge/`) and the site at https://geo.avarok.net. Particularly relevant:

- anything that lets an input, a page or a build output execute commands, escape the build output directory or
  read environment variables not declared in `geoharness.toml`;
- anything that leaks the Cloudflare API token, or makes GeoHarness change zone rules not tagged
  `geoharness:<host>`;
- markdown twins that differ from their pages in a way the equivalence check misses (cloaking).

## Design

The security model (pure WebAssembly core, least-privilege token, tagged zone changes, no shell, pinned supply
chain, dry runs for pull requests) is described in the README and at https://geo.avarok.net/docs/security/.
