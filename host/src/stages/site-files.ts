import { join } from 'node:path';
import { outputDirWithin } from '../adapters/shared.js';
import type { AuditInput, PageSummary, SiteConfig } from '../core/types-index.js';
import type { Fs } from '../io/types.js';

/** Writes a core-produced file, refusing any path that would leave the output directory. */
export async function writeOutputFile(fs: Fs, outputDir: string, file: string, contents: string): Promise<void> {
  await fs.writeText(outputDirWithin(outputDir, file), contents);
}

/** The processed site, read back from disk, as the core's audit expects it. */
export async function staticAuditInput(fs: Fs, outputDir: string, config: SiteConfig, pages: PageSummary[]): Promise<AuditInput> {
  const read = (f: string): Promise<string | undefined> => fs.readTextIfExists(join(outputDir, f));
  const robots = await read('robots.txt');
  const sitemap = await read('sitemap.xml');
  if (robots === undefined || sitemap === undefined) throw new Error('processed output lacks robots.txt or sitemap.xml');
  const auditPages: AuditInput['pages'] = [];
  for (const p of pages) {
    const htmlFile = p.markdownFile.replace(/\.md$/, '.html');
    auditPages.push({ route: p.route, html: await fs.readText(join(outputDir, htmlFile)), markdown: await fs.readText(join(outputDir, p.markdownFile)) });
  }
  const input: AuditInput = { config, pages: auditPages, robots, headers: (await read('_headers')) ?? '', sitemap };
  const llms = await read('llms.txt');
  if (llms !== undefined) input.llms = llms;
  return input;
}
