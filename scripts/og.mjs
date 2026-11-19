// Renders site/src/og.png (1200×630) from brand/wordmark-light.svg with the locally installed Chrome
// (playwright-core, channel "chrome"). Run by hand after a brand change: `npm run og`; the PNG is committed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const root = join(import.meta.dirname, '..');
const wordmark = readFileSync(join(root, 'brand', 'wordmark-light.svg'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px}
body{display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box;
  background:linear-gradient(135deg,#ffffff 0%,#eef2ff 60%,#ecfeff 100%);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a}
svg{width:760px;height:auto}
p{font-size:40px;line-height:1.25;margin:40px 0 0;max-width:1010px;font-weight:600}
small{display:block;margin-top:28px;font-size:28px;color:#475569;font-weight:500}
</style></head><body>${wordmark}<p>Make any website agent-ready on Cloudflare's free plan</p>
<small>geo.avarok.net · GitHub Action by Avarok Cybersecurity</small></body></html>`;

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: join(root, 'site', 'src', 'og.png'), type: 'png' });
  console.log('wrote site/src/og.png');
} finally {
  await browser.close();
}
