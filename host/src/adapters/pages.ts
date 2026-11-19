import { join } from 'node:path';
import type { PageInput } from '../core/types-index.js';
import type { HostIO } from '../io/types.js';

/** Files that are served but are not pages of their own. */
const NOT_PAGES = new Set(['404.html']);

/** x/index.html → /x/, index.html → /, x.html → /x */
export function routeForFile(file: string): string {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file.slice(0, -'.html'.length)}`;
}

function markdownCandidates(root: string, route: string): string[] {
  const path = route.replace(/^\/|\/$/g, '');
  return path === '' ? [`${root}/index.md`] : [`${root}/${path}.md`, `${root}/${path}/index.md`];
}

export interface PagesOptions {
  siteDir: string;
  /** Site-relative directory the HTML was generated from, when it is markdown (e.g. "content"). */
  markdownRoot: string | undefined;
}

/**
 * Maps every HTML file in the output to a route. lastmod is the last commit of the page's source
 * (the tracked output file, else its source markdown); never the current time.
 */
export async function pagesFromOutput(outputDir: string, io: HostIO, opts: PagesOptions): Promise<PageInput[]> {
  const files = (await io.fs.listFiles(outputDir)).filter((f) => f.endsWith('.html') && !NOT_PAGES.has(f));
  const pages: PageInput[] = [];
  for (const file of files) {
    const route = routeForFile(file);
    const page: PageInput = { route, file, html: await io.fs.readText(join(outputDir, file)) };
    let lastmod = await io.git.lastCommitDate(opts.siteDir, join(outputDir, file));
    if (opts.markdownRoot !== undefined) {
      for (const candidate of markdownCandidates(opts.markdownRoot, route)) {
        const abs = join(opts.siteDir, candidate);
        const md = await io.fs.readTextIfExists(abs);
        if (md === undefined) continue;
        page.markdown = md;
        lastmod ??= await io.git.lastCommitDate(opts.siteDir, abs);
        break;
      }
    }
    if (lastmod !== undefined) page.lastmod = lastmod;
    pages.push(page);
  }
  return pages;
}
