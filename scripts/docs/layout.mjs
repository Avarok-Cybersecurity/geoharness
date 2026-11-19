// Shared site chrome, generated into every page: the inline stylesheet, header (with the wordmark
// from brand/wordmark-light.svg, recoloured by CSS for dark mode) and footer.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './sources.mjs';

const REPO_URL = 'https://github.com/Avarok-Cybersecurity/geoharness';

export function minifyCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim();
}

export const cspHash = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

export function siteStyle() {
  const css = minifyCss(readFileSync(join(ROOT, 'site', 'theme.css'), 'utf8'));
  return { block: `<style>${css}</style>`, hash: cspHash(css) };
}

/** The wordmark with its fixed colours replaced by classes the theme recolours per colour scheme. */
export function wordmark() {
  const svg = readFileSync(join(ROOT, 'brand', 'wordmark-light.svg'), 'utf8');
  const out = svg
    .replace(/\n\s*/g, '')
    .replace('role="img" aria-label="GeoHarness"', 'role="img" aria-labelledby="wm-title" width="310" height="64"')
    .replace(/(<svg[^>]*>)/, '$1<title id="wm-title">GeoHarness</title>')
    .replace(/id="g"/, 'id="wm-g"').replace(/url\(#g\)/g, 'url(#wm-g)')
    .replace('stop-color="#4338CA"', 'class="s1"').replace('stop-color="#0E7490"', 'class="s2"')
    .replace(/fill="#0F172A" opacity="\.78"/, 'class="ink2"').replace(/fill="#0F172A"/, 'class="ink"');
  if (/#[0-9A-Fa-f]{6}/.test(out)) throw new Error('wordmark still has a fixed colour; update layout.mjs for brand/wordmark-light.svg');
  return out;
}

export function header() {
  return [
    '<a class="skip" href="#content">Skip to content</a>',
    '<header class="site"><div class="wrap">',
    `<a class="brand" href="/" aria-label="GeoHarness home">${wordmark()}</a>`,
    '<nav aria-label="Primary"><ul>',
    '<li><a href="/docs/">Docs</a></li>',
    '<li><a href="/citations/">Citations</a></li>',
    `<li><a href="${REPO_URL}">GitHub</a></li>`,
    '</ul></nav>',
    '</div></header>',
  ].join('\n');
}

export function footer() {
  return [
    '<footer class="site"><div class="wrap">',
    '<p>GeoHarness is open source (Apache-2.0 OR MIT) by <a href="https://avarok.net/about/">Avarok Cybersecurity</a>.',
    ` <a href="mailto:contact@avarok.net">Contact</a> · <a href="https://avarok.net/privacy/">Privacy notice</a> · <a href="${REPO_URL}/security/policy">Security policy</a></p>`,
    '<p>This site is built, audited and deployed by GeoHarness itself. Agents: send <code>Accept: text/markdown</code>, or read <a href="/llms.txt">llms.txt</a>.</p>',
    '</div></footer>',
  ].join('\n');
}
