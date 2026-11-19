---
title: "Private | Example Docs"
description: "Internal notes."
canonical: "https://example.com/private/"
tokens: 253
---

# Private

Not for crawlers. These notes list the release checklist that Example Inc follows before tagging a version, the people who sign off on it, and the dashboards they watch during the first hour after a release goes out.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": "https://example.com/#organization",
      "@type": "Organization",
      "name": "Example Inc",
      "sameAs": [
        "https://github.com/example"
      ],
      "url": "https://example.com/"
    },
    {
      "@id": "https://example.com/private/",
      "@type": "WebPage",
      "author": {
        "@id": "https://example.com/#organization"
      },
      "description": "Internal notes.",
      "inLanguage": "en-US",
      "isPartOf": {
        "@id": "https://example.com/#website",
        "@type": "WebSite",
        "name": "Example Docs",
        "url": "https://example.com/"
      },
      "name": "Private | Example Docs",
      "url": "https://example.com/private/"
    }
  ]
}
```
