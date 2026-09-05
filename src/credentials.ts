import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { AppError } from './errors';
import { atomicWrite, checkAncestors, directory, exists, readBytes, record } from './files';

export type Credential = { key: string; source: 'environment' | 'saved' | 'entered' };
function secure(path: string, kind: 'file' | 'directory') {
  const s = lstatSync(path);
  if ((kind === 'file' ? !s.isFile() || s.nlink !== 1 : !s.isDirectory())
    || (s.mode & 0o077) !== 0 || (process.getuid && s.uid !== process.getuid())) throw new AppError('CREDENTIALS_INVALID');
}
function location(home: string, create: boolean): string {
  try {
    checkAncestors(home);
    const physical = realpathSync(home);
    const config = join(physical, '.config'); const app = join(config, 'iglo.mem');
    checkAncestors(app);
    for (let part = app;; part = dirname(part)) {
      if (exists(join(part, '.git'))) throw new AppError('CREDENTIALS_INVALID');
      if (dirname(part) === part) break;
    }
    if (create) {
      if (!exists(config)) mkdirSync(config, { mode: 0o700 });
      directory(config);
      if (!exists(app)) mkdirSync(app, { mode: 0o700 });
    }
    if (exists(app)) secure(app, 'directory');
    const file = join(app, 'credentials.json');
    if (exists(file)) secure(file, 'file');
    return file;
  } catch { throw new AppError('CREDENTIALS_INVALID'); }
}
export function resolveCredential(home = homedir(), environment = process.env.OPENROUTER_API_KEY): Credential | undefined {
  const override = environment?.trim();
  if (override) return { key: override, source: 'environment' };
  const path = location(home, false);
  if (!exists(path)) return undefined;
  try {
    const value: unknown = JSON.parse(readBytes(path).toString('utf8'));
    if (!record(value) || !record(value.openrouter) || typeof value.openrouter.apiKey !== 'string' || !value.openrouter.apiKey.trim()) throw new Error();
    return { key: value.openrouter.apiKey.trim(), source: 'saved' };
  } catch { throw new AppError('CREDENTIALS_INVALID'); }
}
export function requireCredential(): string {
  const credential = resolveCredential();
  if (!credential) throw new AppError('API_KEY_MISSING');
  return credential.key;
}
export function saveCredential(key: string, home = homedir()): void {
  const path = location(home, true);
  try { atomicWrite(path, JSON.stringify({ openrouter: { apiKey: key.trim() } }) + '\n', 0o600); }
  catch { throw new AppError('CREDENTIALS_SAVE_FAILED'); }
}

async function hiddenEntry(): Promise<string> {
  const input = process.stdin;
  const wasRaw = input.isRaw;
  return new Promise<string>((resolve, reject) => {
    let value = ''; let finished = false;
    const finish = (key?: string) => {
      if (finished) return; finished = true;
      input.removeListener('data', data); input.removeListener('end', cancel); input.removeListener('error', cancel);
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.removeListener(signal, cancel);
      input.setRawMode(wasRaw ?? false); input.pause();
      process.stderr.write('\n');
      if (key === undefined) reject(new AppError('SETUP_CANCELLED')); else resolve(key);
    };
    const cancel = () => finish();
    const data = (chunk: Buffer | string) => {
      for (const c of chunk.toString()) {
        if (finished) break;
        if (c === '\x03' || c === '\x04') { cancel(); break; }
        if (c === '\r' || c === '\n') {
          if (value.trim()) { finish(value.trim()); break; }
          process.stderr.write('\nEnter a non-empty API key: '); value = '';
        } else if (c === '\x7f' || c === '\b') value = Array.from(value).slice(0, -1).join('');
        else if (c >= ' ' && c !== '\x1b') value += c;
      }
    };
    input.setEncoding('utf8');
    input.on('data', data); input.once('end', cancel); input.once('error', cancel);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(signal, cancel);
    input.setRawMode(true); input.resume();
  });
}
export async function setupCredentials(reset: boolean): Promise<{ credentialSource: Credential['source']; credentialsSaved: boolean }> {
  if (reset && (!process.stdin.isTTY || !process.stderr.isTTY)) throw new AppError('SETUP_REQUIRES_TTY');
  if (!reset) {
    const current = resolveCredential();
    if (current) {
      if (current.source === 'environment') process.stderr.write('Using OPENROUTER_API_KEY; it has not been saved for other processes.\n');
      return { credentialSource: current.source, credentialsSaved: false };
    }
  }
  if (!process.stdin.isTTY || !process.stderr.isTTY) throw new AppError('API_KEY_MISSING');
  // Validate before prompting, but only create storage after a key is entered.
  const path = location(homedir(), false);
  process.stderr.write(`Create a key at https://openrouter.ai/settings/keys\nSaved as plaintext at ${path}, private to your OS user and shared across repositories.\nInput is hidden. Ctrl-C cancels.\nOpenRouter API key: `);
  const key = await hiddenEntry();
  saveCredential(key);
  if (reset) process.stderr.write('Credentials replaced. OPENROUTER_API_KEY still takes precedence when set.\n');
  return { credentialSource: 'entered', credentialsSaved: true };
}
