import { describe, expect, test } from 'bun:test';
import { parseArguments } from '../src/arguments';
import { AppError, errorResponse } from '../src/errors';

describe('command contract', () => {
  test('only the five commands and explicit reset are accepted', () => {
    expect(parseArguments(['init'])).toEqual({ name: 'init', resetCredentials: false });
    expect(parseArguments(['init', '--reset-credentials'])).toEqual({ name: 'init', resetCredentials: true });
    for (const name of ['prepare', 'status', 'gc'] as const) expect(parseArguments([name])).toEqual({ name });
    expect(parseArguments(['search', '  auth tokens  '])).toEqual({ name: 'search', query: '  auth tokens  ' });
  });
  test('invalid arguments are rejected without reflecting them', () => {
    for (const args of [[], ['help'], ['init', '--api-key', 'DUMMY_SECRET'], ['prepare', '--reset-credentials'], ['search'], ['search', '  '], ['search', '--api-key'], ['search', 'a', 'b'], ['DUMMY_SECRET']]) {
      try { parseArguments(args); throw new Error('unexpected success'); }
      catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const response = errorResponse(error);
        expect(response.error.code).toBe('ARGUMENT_INVALID');
        expect(JSON.stringify(response)).not.toContain('DUMMY_SECRET');
      }
    }
  });
  test('unexpected failures never expose the exception message', () => {
    expect(errorResponse(new Error('DUMMY_SECRET'))).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'The operation failed.' } });
  });
});
