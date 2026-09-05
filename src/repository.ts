import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { AppError } from '@/src/errors';

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

// Read only a regular final component, without following a substituted symlink.
export function readRegularFile(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('not a regular file');
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

function directory(path: string): boolean {
  return lstatSync(path).isDirectory();
}

function validHead(head: string): boolean {
  if (/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(head)) return true;
  if (!head.startsWith('ref: refs/')) return false;
  const ref = head.slice(5);
  // Git check-ref-format rules; no Git subprocess is needed at runtime.
  return (
    // oxlint-disable-next-line no-control-regex -- Git refnames must reject control bytes.
    !/[\x00-\x20\x7f~^:?*[\\]/.test(ref) &&
    !ref.includes('..') &&
    !ref.includes('@{') &&
    !ref.endsWith('.') &&
    ref
      .split('/')
      .every((part) => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock'))
  );
}

function validateAdmin(path: string, linked: boolean): void {
  if (!directory(path)) throw new Error('invalid administrative directory');
  const head = readRegularFile(join(path, 'HEAD')).trim();
  if (!validHead(head)) {
    throw new Error('invalid HEAD');
  }
  let common = path;
  if (linked) {
    try {
      const value = readRegularFile(join(path, 'commondir')).trim();
      // oxlint-disable-next-line no-control-regex -- Administrative paths reject NUL and line breaks.
      if (!value || /[\r\n\x00]/.test(value)) throw new Error('invalid commondir');
      common = realpathSync(resolve(path, value));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  if (!directory(join(common, 'objects')) || !directory(join(common, 'refs'))) {
    throw new Error('invalid administrative structure');
  }
}

/** cwd defines the worktree; no Git executable or GIT_* environment is consulted. */
export function resolveWorktree(cwd: string): string {
  try {
    let current = realpathSync(cwd);
    if (!statSync(current).isDirectory()) throw new Error('cwd is not a directory');
    for (;;) {
      const marker = join(current, '.git');
      let entry;
      try {
        entry = lstatSync(marker);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      if (entry) {
        if (entry.isDirectory()) validateAdmin(marker, false);
        else if (entry.isFile()) {
          const text = readRegularFile(marker);
          // oxlint-disable-next-line no-control-regex -- A gitfile path cannot contain a NUL byte.
          const match = /^gitdir: ([^\r\n\x00]+)\r?\n?$/.exec(text);
          if (!match?.[1]?.trim()) throw new Error('invalid gitfile');
          const target = match[1].trim();
          validateAdmin(realpathSync(isAbsolute(target) ? target : resolve(current, target)), true);
        } else throw new Error('invalid marker');
        return current;
      }
      // Do not mistake a bare repository nested in a worktree for that worktree.
      try {
        if (
          lstatSync(join(current, 'HEAD')).isFile() &&
          validHead(readRegularFile(join(current, 'HEAD')).trim()) &&
          directory(join(current, 'objects')) &&
          directory(join(current, 'refs'))
        ) {
          throw new AppError('REPOSITORY_INVALID');
        }
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      const parent = dirname(current);
      if (parent === current) throw new Error('no worktree');
      current = parent;
    }
  } catch {
    throw new AppError('REPOSITORY_INVALID');
  }
}
