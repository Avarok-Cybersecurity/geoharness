---
title: "Advanced | Example Docs"
description: "Advanced use of Example."
canonical: "https://example.com/guide/advanced/"
lastmod: "2026-11-12T10:00:00Z"
tokens: 287
---

# Advanced

Built from 0123abcd by the docs team.

Advanced users of Example can tune the widget cache, swap the renderer and plug in their own storage backend. Each of these is a single option in the configuration file described in the guide.

Back to the [guide](https://example.com/guide/).

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
      "@id": "https://example.com/guide/advanced/",
      "@type": "WebPage",
      "author": {
        "@id": "https://example.com/#organization"
      },
      "dateModified": "2026-11-12T10:00:00Z",
      "description": "Advanced use of Example.",
      "inLanguage": "en-US",
      "isPartOf": {
        "@id": "https://example.com/#website",
        "@type": "WebSite",
        "name": "Example Docs",
        "url": "https://example.com/"
      },
      "name": "Advanced | Example Docs",
      "url": "https://example.com/guide/advanced/"
    }
  ]
}
```
