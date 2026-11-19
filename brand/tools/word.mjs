import opentype from 'opentype.js';
import { writeFileSync } from 'node:fs';
const [,, dir, bold, med] = process.argv;
const fb = opentype.loadSync(bold), fm = opentype.loadSync(med);
const size = 40, y = 44;
const geo = fb.getPath('Geo', 76, y, size);
const gw = fb.getAdvanceWidth('Geo', size);
const har = fm.getPath('Harness', 76 + gw + 1, y, size);
const hw = fm.getAdvanceWidth('Harness', size);
const W = Math.ceil(76 + gw + 1 + hw + 4);
for (const [name, ink, c1, c2] of [['light', '#0F172A', '#4338CA', '#0E7490'], ['dark', '#F1F5F9', '#A5B4FC', '#67E8F9']]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 64" role="img" aria-label="GeoHarness">
  <defs><linearGradient id="g" x1="8" y1="56" x2="56" y2="8" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <g fill="none" stroke="url(#g)" stroke-linecap="round" stroke-linejoin="round"><path d="M48.97 15.03 A24 24 0 1 0 56 32 H36" stroke-width="5"/><ellipse cx="32" cy="32" rx="9.5" ry="23.5" stroke-width="2.5" opacity=".5"/></g>
  <circle cx="35" cy="32" r="4.2" fill="url(#g)"/>
  <path d="${geo.toPathData(2)}" fill="${ink}"/><path d="${har.toPathData(2)}" fill="${ink}" opacity=".78"/>
</svg>`;
  writeFileSync(`${dir}/wordmark-${name}.svg`, svg);
}
