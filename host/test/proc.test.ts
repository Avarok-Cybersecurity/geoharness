import { describe, expect, it } from 'vitest';
import { nodeNet } from '../src/io/node/net.js';
import { nodeProc } from '../src/io/node/proc.js';
import { recordingLog } from './helpers/io.js';

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// A parent that starts a grandchild and ignores SIGTERM: stop() must still end both (SIGKILL after the grace).
const TREE = `
const { spawn } = require('node:child_process');
const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
process.on('SIGTERM', () => {});
console.log('grandchild ' + c.pid + ' secret-token');
setInterval(() => {}, 1000);
`;

async function grandchildPid(output: () => string): Promise<number> {
  for (let i = 0; i < 100; i += 1) {
    const m = /grandchild (\d+)/.exec(output());
    if (m?.[1] !== undefined) return Number(m[1]);
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`no grandchild pid in ${output()}`);
}

describe('nodeProc.start', () => {
  it('stops the whole process tree, even a child that ignores SIGTERM', async () => {
    const log = recordingLog();
    const running = nodeProc(log).start(process.execPath, ['-e', TREE], { cwd: process.cwd(), env: {}, redact: ['secret-token'], stream: true });
    const child = await grandchildPid(() => running.output());
    expect(alive(child)).toBe(true);
    await running.stop();
    const result = await running.exited;
    expect(result.code).not.toBe(0);
    await new Promise((r) => setTimeout(r, 200));
    expect(alive(child)).toBe(false);
    expect(running.output()).toContain('***');
    expect(running.output()).not.toContain('secret-token');
    expect(log.lines.some((l) => l.includes('secret-token'))).toBe(false);
  }, 20_000);

  it('reports an early exit through exited', async () => {
    const running = nodeProc(recordingLog()).start(process.execPath, ['-e', 'process.exit(3)'], { cwd: process.cwd(), env: {}, redact: [], stream: false });
    expect((await running.exited).code).toBe(3);
    await running.stop();
  });
});

describe('nodeNet.freePort', () => {
  it('returns a usable port', async () => {
    const port = await nodeNet.freePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });
});
