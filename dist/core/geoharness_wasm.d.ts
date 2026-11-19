/* tslint:disable */
/* eslint-disable */

/**
 * `audit(AuditInput) -> Result<AuditReport>`.
 */
export function audit(input: any): any;

/**
 * `auditLive(LiveAuditInput) -> Result<AuditReport>`: no config needed.
 */
export function auditLive(input: any): any;

/**
 * `liveCheckPlan(LiveCheckInput) -> Result<LiveRequest[]>`.
 */
export function liveCheckPlan(input: any): any;

/**
 * `parseConfig(toml) -> Result<SiteConfig>`.
 */
export function parseConfig(toml: string): any;

/**
 * `processSite(SiteInput) -> Result<SiteOutput>`.
 */
export function processSite(input: any): any;

/**
 * `ragInputs(RagInput) -> Result<RagOutput>`.
 */
export function ragInputs(input: any): any;
