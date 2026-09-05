import { afterEach, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';
import { cleanup, fixture } from '@/test/helpers';

afterEach(cleanup);

test.each([
  "import './side-effect';",
  "import type { Config } from '../src/config'; export type { Config };",
  "export { value } from './sibling';",
  "export * from '../parent';",
  "await import('./dynamic'); export {};",
  "const value = require('../native.node'); console.log(value);",
])('lint rejects relative module syntax: %s', async (source) => {
  const file = join(fixture(), 'invalid.ts');
  await Bun.write(file, source);
  const result = Bun.spawnSync(
    [resolve('node_modules/.bin/oxlint'), '-c', resolve('.oxlintrc.json'), file],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString() + result.stderr.toString()).toMatch(
    /no-restricted-imports|no-require-imports/,
  );
});

test('lint permits root aliases, builtins and the exact embedded addon import', async () => {
  const file = join(fixture(), 'valid.ts');
  await Bun.write(
    file,
    `export { parseArguments } from '@/src/arguments';
     export { join } from 'node:path';
     export const addon = require('@/dist/lock.node');
     export const deferred = () => import('@/src/config');`,
  );
  const result = Bun.spawnSync(
    [resolve('node_modules/.bin/oxlint'), '-c', resolve('.oxlintrc.json'), file],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(result.exitCode).toBe(0);
});
