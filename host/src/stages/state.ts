import { join } from 'node:path';
import type { Fs } from '../io/types.js';
import { parseJson } from '../lib/json.js';
import type { RunState } from './context.js';

const STATE_FILE = 'state.json';

export async function loadState(fs: Fs, stateDir: string): Promise<RunState> {
  const text = await fs.readTextIfExists(join(stateDir, STATE_FILE));
  // State is written only by saveState below, from a RunState; the shape is ours.
  return text === undefined ? {} : (parseJson(text, STATE_FILE) as RunState);
}

export async function saveState(fs: Fs, stateDir: string, state: RunState): Promise<void> {
  await fs.writeText(join(stateDir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}
