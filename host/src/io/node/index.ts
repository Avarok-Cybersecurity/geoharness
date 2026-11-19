import { setTimeout as sleep } from 'node:timers/promises';
import type { HostIO } from '../types.js';
import { nodeFs } from './fs.js';
import { nodeGit } from './git.js';
import { nodeHttp } from './http.js';
import { githubLog } from './log.js';
import { nodeProc } from './proc.js';

export function nodeHostIO(): HostIO {
  const log = githubLog((line) => { process.stdout.write(`${line}\n`); });
  const proc = nodeProc(log);
  return {
    fs: nodeFs,
    git: nodeGit(proc),
    http: nodeHttp,
    proc,
    log,
    env: { get: (name) => process.env[name] },
    clock: { nowMs: () => Date.now(), sleep: async (ms) => { await sleep(ms); } },
  };
}
