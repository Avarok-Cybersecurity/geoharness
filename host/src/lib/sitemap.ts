export interface SitemapEntry { loc: string; lastmod: string | undefined }

const URL_BLOCK = /<url>([\s\S]*?)<\/url>/g;
const decode = (s: string): string =>
  s.trim().replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function parseSitemap(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  for (const m of xml.matchAll(URL_BLOCK)) {
    const block = m[1] ?? '';
    const loc = /<loc>([\s\S]*?)<\/loc>/.exec(block)?.[1];
    if (loc === undefined) continue;
    const lastmod = /<lastmod>([\s\S]*?)<\/lastmod>/.exec(block)?.[1];
    out.push({ loc: decode(loc), lastmod: lastmod === undefined ? undefined : decode(lastmod) });
  }
  return out;
}

/** URLs that are new or whose lastmod moved since the previously deployed sitemap; all of them without one. */
export function changedUrls(previous: string | undefined, next: string): string[] {
  const now = parseSitemap(next);
  if (previous === undefined) return now.map((e) => e.loc);
  const before = new Map(parseSitemap(previous).map((e) => [e.loc, e.lastmod]));
  return now.filter((e) => !before.has(e.loc) || before.get(e.loc) !== e.lastmod).map((e) => e.loc);
}
