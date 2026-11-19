import { join } from 'node:path';
import { changedUrls } from '../lib/sitemap.js';
import { need, type StageContext } from './context.js';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const KEY_FILE = /^([0-9a-f]{32})\.txt$/;
/** IndexNow accepts at most 10,000 URLs per request. */
const MAX_URLS = 10_000;
const TIMEOUT_MS = 20_000;

export async function indexnowStage(ctx: StageContext): Promise<void> {
  const config = need(ctx.state, 'config', 'indexnow');
  const processed = need(ctx.state, 'processed', 'indexnow');
  const { outputDir } = need(ctx.state, 'build', 'indexnow');
  const keyFile = processed.files.find((f) => KEY_FILE.test(f));
  const key = keyFile === undefined ? undefined : KEY_FILE.exec(keyFile)?.[1];
  if (keyFile === undefined || key === undefined) throw new Error('the core produced no IndexNow key file (<32 hex>.txt)');

  const sitemap = await ctx.io.fs.readText(join(outputDir, 'sitemap.xml'));
  const urls = changedUrls(ctx.state.previousSitemap, sitemap);
  if (urls.length === 0) {
    ctx.io.log.info('IndexNow: no changed URLs');
    ctx.state.indexnow = { submitted: [], status: undefined };
    return;
  }
  const origin = config.site.origin;
  const urlList = urls.slice(0, MAX_URLS);
  const res = await ctx.io.http.request({
    method: 'POST', url: INDEXNOW_ENDPOINT, headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(origin).host, key, keyLocation: `${origin}/${keyFile}`, urlList }),
    timeoutMs: TIMEOUT_MS, redirect: 'manual',
  });
  ctx.state.indexnow = { submitted: urlList, status: res.status };
  if (res.status !== 200 && res.status !== 202) throw new Error(`IndexNow rejected the submission: HTTP ${res.status} ${res.body.slice(0, 200)}`);
  ctx.io.log.info(`IndexNow: submitted ${urlList.length} URLs (HTTP ${res.status})`);
}
