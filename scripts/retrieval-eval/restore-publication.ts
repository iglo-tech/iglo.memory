import { mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { check, hash, object } from '@/scripts/retrieval-eval/corpus';

// Immutable publication before generated benchmark files left the maintained tree.
const commit = '90fbb443acc78a24679a6b0bf7ba4839efacabca';
const manifestHash = '5f5db97737d6bb544241ff4816b321dd8b8ebad0e70aa44fbe215cd402284067';
const files = [
  'labels.json',
  'common.json',
  'observations.json',
  'adjudications.json',
  'expected.json',
];
const repository = resolve(dirname(import.meta.path), '../..');

async function archived(name: string): Promise<Uint8Array> {
  const process = Bun.spawn(
    ['git', 'show', `${commit}:docs/evaluation/retrieval-v2-final/${name}`],
    {
      cwd: repository,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [bytes, error, exit] = await Promise.all([
    new Response(process.stdout).bytes(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  check(
    exit === 0,
    `Cannot restore benchmark from ${commit}; fetch repository history first. ${error.trim()}`,
  );
  return bytes;
}

async function publish(path: string, bytes: Uint8Array) {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await Bun.write(temporary, bytes, { createPath: false });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function restorePublication(
  destination = join(repository, '.cache/retrieval-v2-benchmark'),
) {
  const manifestPath = join(destination, 'manifest.json');
  const cachedManifest = Bun.file(manifestPath);
  const cachedBytes = (await cachedManifest.exists()) ? await cachedManifest.bytes() : null;
  const manifestBytes =
    cachedBytes && hash(cachedBytes) === manifestHash
      ? cachedBytes
      : await archived('manifest.json');
  check(hash(manifestBytes) === manifestHash, 'Archived benchmark manifest hash mismatch');
  const manifest = object(JSON.parse(new TextDecoder().decode(manifestBytes)));
  const hashes = object(manifest.files);
  const pending: { name: string; bytes: Uint8Array }[] = [];
  for (const name of files) {
    const cached = Bun.file(join(destination, name));
    if ((await cached.exists()) && hash(await cached.bytes()) === hashes[name]) continue;
    const bytes = await archived(name);
    check(hash(bytes) === hashes[name], `Archived benchmark hash mismatch: ${name}`);
    pending.push({ name, bytes });
  }
  // Validate every missing input before publishing any replacement.
  await mkdir(destination, { recursive: true });
  for (const { name, bytes } of pending) await publish(join(destination, name), bytes);
  await publish(manifestPath, manifestBytes);
  return destination;
}

if (import.meta.main) {
  check(
    process.argv.length <= 3,
    'Usage: bun scripts/retrieval-eval/restore-publication.ts [DESTINATION]',
  );
  console.log(await restorePublication(process.argv[2] ? resolve(process.argv[2]) : undefined));
}
