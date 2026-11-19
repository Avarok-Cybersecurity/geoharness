import type { HostIO } from '../io/types.js';
import { commandAdapter } from './command.js';
import type { AdapterId } from './ids.js';
import { makeAdapter } from './make.js';
import { npmAdapter } from './npm.js';
import { pythonAdapter } from './python.js';
import { staticAdapter } from './static.js';
import { sveltekitStaticAdapter } from './sveltekit.js';
import type { Adapter, AdapterOptions, Detection } from './types.js';
import { vitePrerenderAdapter } from './vite-prerender.js';
import { workerAssetsAdapter } from './worker-assets.js';

export function createAdapters(opts: AdapterOptions & { tempDir: string }): Adapter[] {
  return [
    workerAssetsAdapter(opts), sveltekitStaticAdapter(opts), vitePrerenderAdapter(opts), commandAdapter(opts),
    pythonAdapter(opts), npmAdapter(opts), makeAdapter(opts), staticAdapter(opts),
  ];
}

export interface Selection { adapter: Adapter; detection: Detection; ranking: { id: AdapterId; detection: Detection }[] }

export class AdapterSelectionError extends Error {
  constructor(message: string, readonly ranking: { id: AdapterId; detection: Detection }[]) {
    super(message);
    this.name = 'AdapterSelectionError';
  }
}

function describe(r: { id: AdapterId; detection: Detection }): string {
  return `${r.id} (${r.detection.confidence.toFixed(2)}: ${r.detection.evidence.join('; ') || 'no evidence'})`;
}

/**
 * Runs every detect(). The `adapter` input overrides; otherwise the highest confidence wins and a tie
 * at the top fails naming both. Evidence for every candidate is logged either way.
 */
export async function selectAdapter(adapters: Adapter[], dir: string, io: HostIO, override: AdapterId | 'auto'): Promise<Selection> {
  const ranking: { id: AdapterId; detection: Detection }[] = [];
  for (const a of adapters) {
    const detection = await a.detect(dir, io);
    if (detection.confidence < 0 || detection.confidence > 1) throw new Error(`adapter ${a.id} returned confidence ${detection.confidence}`);
    ranking.push({ id: a.id, detection });
  }
  ranking.sort((x, y) => y.detection.confidence - x.detection.confidence);
  for (const r of ranking) if (r.detection.confidence > 0 || r.detection.evidence.length > 0) io.log.info(`adapter candidate ${describe(r)}`);

  const pick = (id: AdapterId): Selection => {
    const adapter = adapters.find((a) => a.id === id);
    const entry = ranking.find((r) => r.id === id);
    if (adapter === undefined || entry === undefined) throw new Error(`unknown adapter ${id}`);
    return { adapter, detection: entry.detection, ranking };
  };
  if (override !== 'auto') {
    io.log.info(`adapter ${override} chosen by the adapter input`);
    return pick(override);
  }
  const [first, second] = ranking;
  if (first === undefined || first.detection.confidence === 0) {
    throw new AdapterSelectionError('no adapter recognised this site; set the adapter input (and build-command/output-dir)', ranking);
  }
  if (second !== undefined && second.detection.confidence === first.detection.confidence) {
    throw new AdapterSelectionError(
      `adapter detection tied between ${describe(first)} and ${describe(second)}; set the adapter input`, ranking);
  }
  io.log.info(`adapter ${describe(first)} selected`);
  return pick(first.id);
}
