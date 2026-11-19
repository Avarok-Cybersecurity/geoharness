// The adapter list for the README and /docs/adapters/. Ids must match host/src/adapters/ids.ts
// (checked by run.mjs); detection details live in each adapter's detect().
export const ADAPTERS = [
  ['worker-assets', 'A wrangler config with `assets.directory`', 'Builds, writes into the assets directory and deploys with your own wrangler config, so your Worker code and bindings stay in charge'],
  ['sveltekit-static', 'A Svelte config using `@sveltejs/adapter-static`', 'Runs the build; output is adapter-static\'s directory'],
  ['vite-prerender', 'A Vite config and an empty SPA mount point in `index.html`', 'Builds, then renders `/` and every llms route (or `prerender.routes`) with headless Chromium so pages carry real text'],
  ['command', 'The `build-command` input is set', 'Runs it (no shell) and reads `output-dir`; works for any language'],
  ['python', '`tools/build.py`, or `pyproject.toml` with a `build-command`', 'Runs the build; attaches markdown sources it finds to their pages'],
  ['npm', '`package.json` with a `build` script', 'Runs the script; output from `output-dir` or the generator\'s config'],
  ['make', 'A Makefile with a `build` target', 'Runs `make build`; reads `output-dir`'],
  ['static', '`output-dir/index.html` exists and no `build-command`', 'Nothing to build: the committed output is used as is'],
];
export const ADAPTER_HEAD = ['Adapter', 'Detected when', 'What it does'];
