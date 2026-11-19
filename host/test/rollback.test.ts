import { afterEach, describe, expect, it } from 'vitest';
import { currentWorkerVersion } from '../src/io/cloudflare/workers-deployments.js';
import { nodeHttp } from '../src/io/node/http.js';
import { CfClient } from '../src/io/cloudflare/client.js';
import { recordPrevious, rollBack } from '../src/stages/rollback.js';
import { startFakeCf, type FakeCf } from './helpers/cf-server.js';
import { ACCOUNT, makeContext, makeInputs } from './helpers/context.js';
import { fakeCore } from './helpers/fake-core.js';
import { noHttp, testIO } from './helpers/io.js';
import { recordingProc } from './helpers/world.js';

let cf: FakeCf | undefined;
afterEach(async () => { await cf?.close(); cf = undefined; });

const client = (fake: FakeCf): CfClient => new CfClient({ http: nodeHttp, token: 'test-token', baseUrl: fake.baseUrl, timeoutMs: 5000 });

describe('current Worker version', () => {
  it('takes the newest deployment and, in a split, the version with the larger share', async () => {
    cf = await startFakeCf({ workerDeployments: { site: [
      { id: 'old', created_on: '2026-11-01T00:00:00Z', versions: [{ version_id: 'v1', percentage: 100 }] },
      { id: 'new', created_on: '2026-11-02T00:00:00Z', versions: [{ version_id: 'v2', percentage: 10 }, { version_id: 'v3', percentage: 90 }] },
    ] } });
    expect(await currentWorkerVersion(client(cf), ACCOUNT, 'site')).toBe('v3');
    expect(await currentWorkerVersion(client(cf), ACCOUNT, 'absent')).toBeUndefined();
  });
});

describe('Pages rollback', () => {
  async function pagesContext(production: Record<string, string>) {
    cf = await startFakeCf({ pagesProduction: production });
    const io = testIO({ http: { request: (r) => (r.url.startsWith(cf?.baseUrl ?? '-') ? nodeHttp.request(r) : noHttp.request(r)) }, env: {}, proc: recordingProc() });
    return makeContext({ io, core: fakeCore({ score: 90, blockingFails: false }), inputs: makeInputs({ target: 'pages' }), cfBaseUrl: cf.baseUrl, state: {} });
  }

  it('records the production deployment and rolls back to it through the API', async () => {
    const ctx = await pagesContext({ 'geo-site': 'dep-prev' });
    ctx.state.previousDeployment = await recordPrevious(ctx, undefined);
    expect(ctx.state.previousDeployment).toEqual({ target: 'pages', deploymentId: 'dep-prev' });
    if (cf !== undefined) cf.state.pagesProduction['geo-site'] = 'dep-new';
    expect(await rollBack(ctx, 'post-deploy verification failed')).toEqual({ performed: true, detail: 'rolled Pages project geo-site back to deployment dep-prev' });
    expect(cf?.state.pagesProduction['geo-site']).toBe('dep-prev');
    expect(cf?.requests.at(-1)).toMatchObject({ method: 'POST', path: `/accounts/${ACCOUNT}/pages/projects/geo-site/deployments/dep-prev/rollback` });
  });

  it('a new project has nothing to roll back to', async () => {
    const ctx = await pagesContext({});
    ctx.state.previousDeployment = await recordPrevious(ctx, undefined);
    expect(await rollBack(ctx, 'x')).toEqual({ performed: false, detail: 'first production deployment of geo-site: nothing to roll back to' });
  });

  it('a repo-owned Worker without a name cannot be rolled back, and says why', async () => {
    const ctx = await pagesContext({});
    ctx.inputs.target = 'workers';
    ctx.state.previousDeployment = await recordPrevious(ctx, undefined);
    expect((await rollBack(ctx, 'x')).detail).toBe('cannot roll back: the repo-owned wrangler config states no Worker name');
  });
});
