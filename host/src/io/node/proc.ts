import { spawn, type ChildProcess } from 'node:child_process';
import type { Log, Proc, ProcOptions, ProcResult, Running, StartOptions } from '../types.js';

export function redactAll(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) if (s.length > 0) out = out.split(s).join('***');
  return out;
}

/** Grace between SIGTERM and SIGKILL when stopping a started process tree. */
export const STOP_GRACE_MS = 5000;
const OUTPUT_KEEP_CHARS = 20_000;

/** Process groups of started processes still alive; killed when the host exits, however it exits. */
const live = new Set<number>();

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e;
  }
}

let hooked = false;
function hookExit(): void {
  if (hooked) return;
  hooked = true;
  process.once('exit', () => { for (const pid of live) killGroup(pid, 'SIGKILL'); });
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
    process.once(signal, () => {
      for (const pid of live) killGroup(pid, 'SIGKILL');
      process.exit(code);
    });
  }
}

interface Collected { all: () => string; out: () => string; err: () => string }

function collect(child: ChildProcess, log: Log, options: StartOptions): Collected {
  let stdout = '';
  let stderr = '';
  let all = '';
  const stream = (chunk: Buffer, sink: 'out' | 'err'): void => {
    const text = chunk.toString('utf8');
    if (sink === 'out') stdout += text; else stderr += text;
    all = (all + redactAll(text, options.redact)).slice(-OUTPUT_KEEP_CHARS);
    if (options.stream) for (const line of text.split('\n')) if (line.trim() !== '') log.info(redactAll(line, options.redact));
  };
  child.stdout?.on('data', (c: Buffer) => { stream(c, 'out'); });
  child.stderr?.on('data', (c: Buffer) => { stream(c, 'err'); });
  return { all: () => all, out: () => stdout, err: () => stderr };
}

function spawnArgs(command: string, args: readonly string[], options: StartOptions, detached: boolean): ChildProcess {
  return spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    shell: false,
    detached,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function startTree(log: Log, command: string, args: readonly string[], options: StartOptions): Running {
  hookExit();
  const child = spawnArgs(command, args, options, true);
  const pid = child.pid;
  if (pid !== undefined) live.add(pid);
  const out = collect(child, log, options);
  const exited = new Promise<ProcResult>((resolve) => {
    const done = (code: number): void => {
      if (pid !== undefined) live.delete(pid);
      resolve({ code, stdout: out.out(), stderr: out.err() });
    };
    child.on('error', (e) => { log.error(`${command}: ${e.message}`); done(127); });
    child.on('close', (code, signal) => { done(code ?? (signal === null ? 1 : 128)); });
  });
  return {
    exited,
    output: out.all,
    async stop() {
      if (pid === undefined) {
        await exited;
        return;
      }
      killGroup(pid, 'SIGTERM');
      const timer = setTimeout(() => { killGroup(pid, 'SIGKILL'); }, STOP_GRACE_MS);
      await exited;
      clearTimeout(timer);
      // The group leader exiting does not end the rest of its group; make sure nothing outlives it.
      killGroup(pid, 'SIGKILL');
    },
  };
}

/** Spawns with an argument array and shell:false, so no argument is ever shell-interpreted. */
export function nodeProc(log: Log): Proc {
  return {
    run(command, args, options: ProcOptions) {
      return new Promise((resolve, reject) => {
        const child = spawnArgs(command, args, options, false);
        const out = collect(child, log, options);
        const timer = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`${command} timed out after ${options.timeoutMs} ms`));
        }, options.timeoutMs);
        child.on('error', (e) => { clearTimeout(timer); reject(e); });
        child.on('close', (code, signal) => {
          clearTimeout(timer);
          resolve({ code: code ?? (signal === null ? 1 : 128), stdout: out.out(), stderr: out.err() });
        });
      });
    },
    /** Own process group (POSIX; the action runs on Linux), so stop() reaches npx → node → workerd. */
    start: (command, args, options) => startTree(log, command, args, options),
  };
}
