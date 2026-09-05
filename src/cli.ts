import { parseArguments } from './arguments';
import { errorResponse } from './errors';
import { resolveWorktree } from './repository';
import { initialize } from './init';
import { readConfig } from './config';
import { prepare } from './prepare';
import { search, status, gc } from './search';

try {
  const command = parseArguments(process.argv.slice(2));
  const root = resolveWorktree(process.cwd());
  let result: unknown;
  if (command.name === 'init') result = await initialize(root, command.resetCredentials);
  else {
    const config = readConfig(root);
    switch(command.name) {
      case 'prepare': result = await prepare(root, config); break;
      case 'search': result = await search(root, config, command.query); break;
      case 'status': result = await status(root, config); break;
      case 'gc': result = await gc(root, config); break;
    }
  }
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify(errorResponse(error)) + '\n');
  process.exitCode = 1;
}
