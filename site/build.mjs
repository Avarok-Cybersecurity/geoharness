// The site's build (adapter "command": `node build.mjs`, output-dir dist). The pages in src/ are
// complete HTML, regenerated from the repository's sources by `npm run docs`; this only assembles
// dist/ from them and the brand assets, so the deployed files are exactly what was reviewed.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dirname;
const dist = join(here, 'dist');
const brand = join(here, '..', 'brand');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(here, 'src'), dist, { recursive: true });
for (const name of ['favicon-light.svg', 'favicon-dark.svg']) cpSync(join(brand, name), join(dist, name));
console.log(`site: built ${dist}`);
