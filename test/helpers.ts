import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
export const fixtures: string[] = [];
export function fixture() {
  const root = mkdtempSync('/tmp/iglo-test-');
  fixtures.push(root);
  return root;
}
export function repository() {
  const root = fixture();
  mkdirSync(join(root, '.git', 'objects'), { recursive: true });
  mkdirSync(join(root, '.git', 'refs'));
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  return root;
}
export function cleanup() {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
}
export async function cli(root: string, home: string, args: string[], key?: string) {
  const config = join(home, 'trusted.toml');
  await Bun.write(config, '');
  const env: Record<string, string | undefined> = {
    ...process.env,
    HOME: home,
    OPENROUTER_API_KEY: key,
  };
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '--no-install',
      `--config=${config}`,
      resolve('src/cli.ts'),
      ...args,
    ],
    { cwd: root, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { value: JSON.parse(stdout), stdout, stderr, exit };
}
