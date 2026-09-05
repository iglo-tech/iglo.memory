import { AppError } from './errors';

export type Command =
  | { name: 'init'; resetCredentials: boolean }
  | { name: 'prepare' | 'status' | 'gc' }
  | { name: 'search'; query: string };

export function parseArguments(args: readonly string[]): Command {
  const [name, value] = args;
  if (name === 'init' && (args.length === 1 || (args.length === 2 && value === '--reset-credentials'))) {
    return { name, resetCredentials: args.length === 2 };
  }
  if ((name === 'prepare' || name === 'status' || name === 'gc') && args.length === 1) {
    return { name };
  }
  if (name === 'search' && args.length === 2 && value !== undefined && value.trim() && !value.startsWith('-')) {
    return { name, query: value };
  }
  throw new AppError('ARGUMENT_INVALID');
}
