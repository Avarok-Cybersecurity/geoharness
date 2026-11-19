import type {
  AuditInput, AuditReport, CoreError, LiveAuditInput, LiveCheckInput, LiveRequest, RagInput, RagOutput, Result, SiteConfig,
  SiteInput, SiteOutput,
} from './types-index.js';

/** The pure core, as seen by the host (docs/architecture/contract.md §1–5, including auditLive). */
export interface Core {
  parseConfig(toml: string): Result<SiteConfig>;
  processSite(input: SiteInput): Result<SiteOutput>;
  audit(input: AuditInput): Result<AuditReport>;
  liveCheckPlan(input: LiveCheckInput): Result<LiveRequest[]>;
  auditLive(input: LiveAuditInput): Result<AuditReport>;
  ragInputs(input: RagInput): Result<RagOutput>;
}

export class CoreFailure extends Error {
  constructor(readonly operation: string, readonly errors: CoreError[]) {
    super(`${operation} failed:\n${errors.map(formatCoreError).join('\n')}`);
    this.name = 'CoreFailure';
  }
}

export function formatCoreError(e: CoreError): string {
  return `  [${e.code}]${e.path === undefined ? '' : ` ${e.path}:`} ${e.message}`;
}

/** Unwraps a core Result or throws a CoreFailure naming every error. */
export function unwrap<T>(operation: string, result: Result<T>): T {
  if (result.ok) return result.value;
  throw new CoreFailure(operation, result.errors);
}
