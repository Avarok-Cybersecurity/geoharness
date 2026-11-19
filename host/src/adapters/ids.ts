export const ADAPTER_IDS = [
  'static', 'command', 'npm', 'sveltekit-static', 'python', 'make', 'vite-prerender', 'worker-assets',
] as const;
export type AdapterId = (typeof ADAPTER_IDS)[number];
