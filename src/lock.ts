import { closeSync, constants, openSync } from 'node:fs';
import { AppError } from '@/src/errors';
// Bun requires require() for Node-API addons; the static alias still embeds it.
const native: { tryLock(fd: number): boolean } = require('@/dist/lock.node');

export async function withIndexLock<T>(
  root: string,
  operation: () => Promise<T> | T,
  timeoutMs = 5000,
): Promise<T> {
  let fd: number;
  try {
    fd = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  } catch {
    throw new AppError('INDEX_INVALID');
  }
  try {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      let acquired: boolean;
      try {
        acquired = native.tryLock(fd);
      } catch {
        throw new AppError('INDEX_INVALID');
      }
      if (acquired) break;
      const left = deadline - performance.now();
      if (left <= 0) throw new AppError('INDEX_BUSY');
      await Bun.sleep(Math.min(25, left));
    }
    return await operation();
  } finally {
    closeSync(fd);
  }
}
