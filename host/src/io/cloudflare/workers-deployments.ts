import { asArray, asNumber, asObject, asString, isObject } from '../../lib/json.js';
import { CloudflareApiError, type CfClient } from './client.js';

/**
 * The Worker version serving 100% (or the largest share) of the newest deployment; undefined when the Worker
 * does not exist yet (first deploy). Endpoint: GET /accounts/{account_id}/workers/scripts/{name}/deployments.
 */
export async function currentWorkerVersion(cf: CfClient, accountId: string, name: string): Promise<string | undefined> {
  let result: unknown;
  try {
    result = await cf.call('GET', `/accounts/${accountId}/workers/scripts/${encodeURIComponent(name)}/deployments`);
  } catch (e) {
    if (e instanceof CloudflareApiError && e.status === 404) return undefined;
    throw e;
  }
  const deployments = asArray(asObject(result, 'deployments result').deployments, 'deployments');
  const newest = deployments
    .map((d, i) => asObject(d, `deployments[${i}]`))
    .map((d) => ({ d, at: typeof d.created_on === 'string' ? d.created_on : '' }))
    .sort((a, b) => b.at.localeCompare(a.at))[0]?.d;
  if (newest === undefined) return undefined;
  const versions = asArray(newest.versions, 'deployment.versions')
    .filter(isObject)
    .map((v) => ({ id: asString(v.version_id, 'version_id'), share: asNumber(v.percentage, 'percentage') }))
    .sort((a, b) => b.share - a.share);
  return versions[0]?.id;
}
