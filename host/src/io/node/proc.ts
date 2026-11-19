import { spawn } from 'node:child_process';
import type { Log, Proc } from '../types.js';

export function redactAll(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) if (s.length > 0) out = out.split(s).join('***');
  return out;
}

/** Spawns with an argument array and shell:false, so no argument is ever shell-interpreted. */
export function nodeProc(log: Log): Proc {
  return {
    run(command, args, options) {
      return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd: options.cwd,
          env: { ...process.env, ...options.env },
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        const stream = (chunk: Buffer, sink: 'out' | 'err'): void => {
          const text = chunk.toString('utf8');
          if (sink === 'out') stdout += text; else stderr += text;
          if (options.stream) for (const line of text.split('\n')) if (line.trim() !== '') log.info(redactAll(line, options.redact));
        };
        child.stdout.on('data', (c: Buffer) => { stream(c, 'out'); });
        child.stderr.on('data', (c: Buffer) => { stream(c, 'err'); });
        const timer = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`${command} timed out after ${options.timeoutMs} ms`));
        }, options.timeoutMs);
        child.on('error', (e) => { clearTimeout(timer); reject(e); });
        child.on('close', (code, signal) => {
          clearTimeout(timer);
          resolve({ code: code ?? (signal === null ? 1 : 128), stdout, stderr });
        });
      });
    },
  };
}
