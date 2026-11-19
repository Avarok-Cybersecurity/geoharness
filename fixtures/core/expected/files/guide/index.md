---
title: "Guide | Example Docs"
description: "Install and configure Example."
canonical: "https://docs.example.org/guide/"
lastmod: "2026-11-01T12:00:00Z"
tokens: 272
---

# Guide

Updated November 1, 2026.

## How do I install it?

```sh
npm install example
```

## Options

| Key   | Default |
| ----- | ------- |
| size  | 10      |
| color | blue    |

Next: [advanced](https://example.com/guide/advanced/).

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
      "@id": "https://docs.example.org/guide/",
      "@type": "WebPage",
      "author": {
        "@id": "https://example.com/#organization"
      },
      "dateModified": "2026-11-01T12:00:00Z",
      "description": "Install and configure Example.",
      "inLanguage": "en-US",
      "isPartOf": {
        "@id": "https://example.com/#website",
        "@type": "WebSite",
        "name": "Example Docs",
        "url": "https://example.com/"
      },
      "name": "Guide | Example Docs",
      "url": "https://docs.example.org/guide/"
    }
  ]
}
```
