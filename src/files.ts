import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';

export function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
export function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (missing(error)) return false;
    throw error;
  }
}
export function directory(path: string, create = false, mode = 0o755): void {
  if (create) {
    try {
      mkdirSync(path, { mode });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
  }
  if (!lstatSync(path).isDirectory()) throw new Error('Invalid directory');
}
// Ordinary path validation, not protection against a malicious same-user race.
export function checkAncestors(path: string): void {
  const absolute = resolve(path);
  let part = parse(absolute).root;
  for (const segment of absolute.slice(part.length).split('/').filter(Boolean)) {
    part = join(part, segment);
    if (exists(part) && !lstatSync(part).isDirectory()) throw new Error('Invalid ancestor');
  }
}
export function readBytes(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('Invalid file');
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function atomicWrite(path: string, bytes: string | Uint8Array, mode = 0o644): void {
  const temp = join(dirname(path), `.iglo-${crypto.randomUUID()}.tmp`);
  let created = false;
  try {
    const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
    created = true;
    try {
      writeFileSync(fd, bytes);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
    created = false;
  } finally {
    if (created) {
      try {
        unlinkSync(temp);
      } catch {
        /* Preserve original failure. */
      }
    }
  }
}
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
