/** I/O seams. Business logic receives a HostIO and never imports node:* I/O modules itself. */

export interface Fs {
  readText(path: string): Promise<string>;
  /** undefined when the file does not exist; other errors throw. */
  readTextIfExists(path: string): Promise<string | undefined>;
  writeText(path: string, contents: string): Promise<void>;
  appendText(path: string, contents: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
  /** Recursive listing of regular files, relative to dir, POSIX separators, sorted. */
  listFiles(dir: string): Promise<string[]>;
  makeTempDir(parent: string, prefix: string): Promise<string>;
  remove(path: string): Promise<void>;
}

export interface Git {
  /** ISO 8601 committer date of the last commit touching path, or undefined if untracked. */
  lastCommitDate(repoDir: string, path: string): Promise<string | undefined>;
}

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  redirect: 'follow' | 'manual';
}
export interface HttpResponse { status: number; headers: Record<string, string>; body: string }
export interface Http { request(req: HttpRequest): Promise<HttpResponse> }

export interface ProcOptions {
  cwd: string;
  /** Added on top of the runner environment (PATH etc.). */
  env: Record<string, string>;
  timeoutMs: number;
  /** Values that must never appear in streamed logs. */
  redact: string[];
  /** Stream output lines to the log while running. */
  stream: boolean;
}
export interface ProcResult { code: number; stdout: string; stderr: string }
/** A long-running process (a local server). Its whole process tree is stopped by stop() and on host exit. */
export interface Running {
  /** Settles when the process exits, for whatever reason. */
  readonly exited: Promise<ProcResult>;
  /** Output so far (redacted), for error messages. */
  output(): string;
  /** Terminates the process tree (SIGTERM, then SIGKILL after a grace period); resolves once it exited. */
  stop(): Promise<void>;
}
export type StartOptions = Omit<ProcOptions, 'timeoutMs'>;
export interface Proc {
  run(command: string, args: readonly string[], options: ProcOptions): Promise<ProcResult>;
  start(command: string, args: readonly string[], options: StartOptions): Running;
}

/** Local network facts the host needs (no traffic). */
export interface Net {
  /** A TCP port on 127.0.0.1 that was free when asked. */
  freePort(): Promise<number>;
}

export interface Log {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  group<T>(title: string, body: () => Promise<T>): Promise<T>;
}

export interface Env { get(name: string): string | undefined }

export interface Clock {
  nowMs(): number;
  sleep(ms: number): Promise<void>;
}

export interface HostIO { fs: Fs; git: Git; http: Http; proc: Proc; net: Net; log: Log; env: Env; clock: Clock }
