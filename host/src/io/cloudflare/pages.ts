import { asObject, asString, isObject } from '../../lib/json.js';
import { CloudflareApiError, type CfClient } from './client.js';

export async function listPagesDomains(cf: CfClient, accountId: string, project: string): Promise<string[]> {
  const items = await cf.list(`/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/domains`, 50);
  return items.map((u, i) => asString(asObject(u, `pages.domains[${i}]`).name, 'pages.domain.name'));
}

export async function addPagesDomain(cf: CfClient, accountId: string, project: string, name: string): Promise<void> {
  await cf.call('POST', `/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/domains`, { name });
}

export async function pagesProjectExists(cf: CfClient, accountId: string, project: string): Promise<boolean> {
  try {
    await cf.call('GET', `/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}`);
    return true;
  } catch (e) {
    if (e instanceof CloudflareApiError && e.status === 404) return false;
    throw e;
  }
}

/** The id of the project's current production deployment; undefined for a new project or one never deployed. */
export async function currentPagesProduction(cf: CfClient, accountId: string, project: string): Promise<string | undefined> {
  let result: unknown;
  try {
    result = await cf.call('GET', `/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}`);
  } catch (e) {
    if (e instanceof CloudflareApiError && e.status === 404) return undefined;
    throw e;
  }
  const canonical = asObject(result, 'pages project').canonical_deployment;
  return isObject(canonical) && typeof canonical.id === 'string' ? canonical.id : undefined;
}

/** Points production back at an earlier successful production deployment (`cf-pages-rollback`). */
export async function rollbackPages(cf: CfClient, accountId: string, project: string, deploymentId: string): Promise<void> {
  await cf.call('POST', `/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/deployments/${encodeURIComponent(deploymentId)}/rollback`);
}
