import { afterEach, expect, test } from 'bun:test';
import { resolve, join } from 'node:path';
import { readdirSync, writeFileSync } from 'node:fs';
import { withIndexLock } from '@/src/lock';
import { fixture, cleanup } from '@/test/helpers';
afterEach(cleanup);

test('bounded contention, different directory independence, kill recovery and no persistent lock writes', async () => {
  const root = fixture();
  const other = fixture();
  const config = join(other, 'trusted.toml');
  writeFileSync(config, '');
  const script = `import {withIndexLock} from '@/src/lock'; await withIndexLock(${JSON.stringify(root)},async()=>{console.log('LOCKED');await Bun.sleep(60000);});`;
  const process = Bun.spawn(
    [
      globalThis.process.execPath,
      '--no-env-file',
      `--config=${config}`,
      `--tsconfig-override=${resolve('tsconfig.json')}`,
      '-e',
      script,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  try {
    const reader = process.stdout.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('LOCKED');
    reader.releaseLock();
    const before = performance.now();
    await expect(withIndexLock(root, () => {}, 75)).rejects.toThrow('busy');
    expect(performance.now() - before).toBeLessThan(500);
    expect(await withIndexLock(other, () => 'independent', 75)).toBe('independent');
    expect(readdirSync(root)).toEqual([]);
  } finally {
    process.kill('SIGKILL');
    await process.exited;
  }
  expect(await withIndexLock(root, () => 'recovered', 75)).toBe('recovered');
  expect(readdirSync(root)).toEqual([]);
});
