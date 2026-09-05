import { parseArguments } from '@/src/arguments';
import { errorResponse } from '@/src/errors';
import { resolveWorktree } from '@/src/repository';
import { initialize } from '@/src/init';
import { readConfig } from '@/src/config';
import { prepare } from '@/src/prepare';
import { search, status, gc, checkSearchDeadline } from '@/src/search';

const dispatchedAt = performance.now();
let searchDeadline: number | undefined;
try {
  const command = parseArguments(process.argv.slice(2));
  if (command.name === 'search') searchDeadline = dispatchedAt + 30_000;
  const root = resolveWorktree(process.cwd());
  let result: unknown;
  if (command.name === 'init') result = await initialize(root, command.resetCredentials);
  else {
    const config = readConfig(root);
    switch (command.name) {
      case 'prepare':
        result = await prepare(root, config);
        break;
      case 'search':
        result = await search(root, config, command.query, undefined, undefined, {
          deadline: searchDeadline,
        });
        break;
      case 'status':
        result = await status(root, config);
        break;
      case 'gc':
        result = await gc(root, config);
        break;
    }
  }
  const output = JSON.stringify(result) + '\n';
  if (searchDeadline !== undefined) checkSearchDeadline(searchDeadline);
  process.stdout.write(output);
} catch (error) {
  let failure = error;
  if (searchDeadline !== undefined) {
    try {
      checkSearchDeadline(searchDeadline);
    } catch (timeout) {
      failure = timeout;
    }
  }
  process.stdout.write(JSON.stringify(errorResponse(failure)) + '\n');
  process.exitCode = 1;
}
