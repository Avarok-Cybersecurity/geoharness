import type { Log } from '../types.js';

/** GitHub Actions workflow-command logger; annotations surface warnings and errors on the run page. */
export function githubLog(write: (line: string) => void): Log {
  const escape = (m: string): string => m.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return {
    info: (m) => { write(m); },
    warn: (m) => { write(`::warning::${escape(m)}`); },
    error: (m) => { write(`::error::${escape(m)}`); },
    async group(title, body) {
      write(`::group::${title}`);
      try {
        return await body();
      } finally {
        write('::endgroup::');
      }
    },
  };
}
