import { constants, closeSync, openSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DEFAULT_MODEL, readConfig } from '@/src/config';
import { setupCredentials } from '@/src/credentials';
import { AppError } from '@/src/errors';
import { directory, exists } from '@/src/files';

export async function initialize(root: string, reset: boolean) {
  try {
    directory(join(root, '.agent'), true);
    const path = join(root, '.agent', 'memory.json');
    if (!exists(path)) {
      const value = { project: basename(root), embedding: { model: DEFAULT_MODEL } };
      try {
        const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644);
        try {
          await Bun.write(Bun.file(fd), JSON.stringify(value, null, 2) + '\n');
        } finally {
          closeSync(fd);
        }
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      }
    }
    const config = readConfig(root);
    for (const name of ['knowledge', 'decisions', 'inbox', 'memory-index'])
      directory(join(root, '.agent', name), true);
    const credentials = await setupCredentials(reset);
    process.stderr.write(
      'Run iglo.mem prepare before first search, and again when Markdown changes.\n',
    );
    return { project: config.project, ...credentials };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('CONFIG_INVALID');
  }
}
