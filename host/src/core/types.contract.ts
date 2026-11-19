// TEMPORARY — transcribed by hand from docs/architecture/contract.md.
// REPLACE AT MERGE with the ts-rs generated host/src/core/types.ts from the core lane,
// then change the single re-export in host/src/core/types-index.ts and delete this file.

export type Result<T> = { ok: true; value: T } | { ok: false; errors: CoreError[] };
export interface CoreError { code: string; message: string; path?: string }

export interface SiteConfig {
  site: { origin: string; name: string; language: string };
  identity: {
    kind: 'person' | 'organization';
    name: string;
    url: string;
    sameAs: string[];
    organization?: { name: string; url: string };
  };
  contentSignal: { search: boolean; aiInput: boolean; aiTrain: boolean };
  bots: BotPolicy[];
  content: { mainSelector: string; exclude: string[] };
  llms: { summary: string; sections: { title: string; routes: string[] }[] };
  env: string[];
  headers: { immutable: string[] };
}
export interface BotPolicy { tokens: string[]; allow: string[]; disallow: string[]; group: 'search' | 'user' | 'training' | 'other' }

export interface SiteInput {
  config: SiteConfig;
  buildId: string;
  env: Record<string, string>;
  pages: PageInput[];
  existing: { robots?: string; headers?: string; llms?: string; sitemap?: string };
}
export interface PageInput {
  route: string;
  file: string;
  html: string;
  markdown?: string;
  lastmod?: string;
}
export interface SiteOutput {
  files: OutFile[];
  rewriteRules: RewriteRule[];
  pages: PageSummary[];
  warnings: CoreError[];
}
export interface OutFile { file: string; contents: string }
export interface RewriteRule { description: string; expression: string; pathExpression: string }
export interface PageSummary { route: string; markdownFile: string; title: string; description: string; tokens: number; lastmod?: string }

export interface AuditInput {
  config: SiteConfig;
  pages: { route: string; html: string; markdown: string }[];
  robots: string;
  headers: string;
  llms?: string;
  sitemap: string;
  live?: LiveObservation[];
}
export interface LiveObservation { url: string; userAgent: string; accept: string; status: number; headers: Record<string, string>; bodyPrefix: string }
export interface AuditReport {
  score: number;
  categories: { id: string; title: string; weight: number; score: number }[];
  findings: Finding[];
}
export interface Finding {
  checkId: string;
  title: string;
  severity: 'blocking' | 'advisory';
  passed: boolean;
  route?: string;
  evidence: string;
  citations: string[];
}

export interface LiveRequest {
  url: string;
  userAgent: string;
  accept: string;
  expect: { status: number; contentType?: string; varyIncludes?: string; bodyIncludes?: string };
}

export interface RagInput { config: SiteConfig; pages: PageSummary[]; html: { route: string; html: string }[] }
export interface RagOutput {
  sidecar: Record<string, { url: string; title: string; lastmod?: string }>;
  edges: { from: { path: string }; to: { path: string }; relation: 'child_of' | 'links_to'; weight: number }[];
}
