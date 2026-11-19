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
export interface Proc { run(command: string, args: readonly string[], options: ProcOptions): Promise<ProcResult> }

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

export interface HostIO { fs: Fs; git: Git; http: Http; proc: Proc; log: Log; env: Env; clock: Clock }
