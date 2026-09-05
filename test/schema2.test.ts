import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '@/src/chunks';
import { prepare } from '@/src/prepare';
import { search, status, gc } from '@/src/search';
import { readSnapshot, parseSnapshot, indexPath } from '@/src/store';
import { repository, cleanup } from '@/test/helpers';
import type { Config } from '@/src/config';
const config: Config = {
  project: 'coverage',
  embedding: { model: 'openai/text-embedding-3-small' },
};
afterEach(cleanup);
function setup() {
  const root = repository();
  mkdirSync(join(root, '.agent/knowledge'), { recursive: true });
  writeFileSync(join(root, '.agent/memory.json'), JSON.stringify(config));
  return root;
}
const embed = async (inputs: string[]) => inputs.map(() => [1, 0]);
const key = () => 'fixture';
const noNetwork = () => {
  throw new Error('UNEXPECTED_NETWORK');
};

test('source coverage includes empty and whitespace sources; corrupted coordinates cannot load', async () => {
  const root = setup();
  const original = '\r\n# Zażółć\r\ne\u0301 👩‍💻\r\n\r\n## Suffix\r\n';
  writeFileSync(join(root, '.agent/knowledge/a.md'), original);
  writeFileSync(join(root, '.agent/knowledge/empty.md'), '');
  writeFileSync(join(root, '.agent/knowledge/space.md'), ' \n\t\n');
  await prepare(root, config, embed, key);
  const snapshot = readSnapshot(root, config);
  expect(snapshot.schemaVersion).toBe(2);
  expect(snapshot.documents).toBe(3);
  const source = snapshot.sources[0]!;
  const byId = new Map(snapshot.chunks.map((chunk) => [chunk.passageId, chunk]));
  expect(
    source.spans
      .map((span) => ('passageId' in span ? byId.get(span.passageId)!.text : span.text))
      .join(''),
  ).toBe(original.replace(/\r\n?/g, '\n'));
  expect(snapshot.chunks.some((chunk) => chunk.heading === 'Suffix')).toBe(true);
  for (const mutate of [
    (s: typeof snapshot) => {
      s.sources[0]!.lineStarts[1] = 999;
    },
    (s: typeof snapshot) => {
      s.sources[0]!.spans[0]!.end++;
    },
    (s: typeof snapshot) => {
      s.sources[0]!.sourceHash = 'sha256:' + '0'.repeat(64);
    },
    (s: typeof snapshot) => {
      s.chunks[0]!.start++;
    },
    (s: typeof snapshot) => {
      s.chunks[0]!.passageId = 'sha256:' + '0'.repeat(64);
    },
  ]) {
    const changed = structuredClone(snapshot);
    mutate(changed);
    expect(() => parseSnapshot(changed, config)).toThrow('index is invalid');
  }
});

test('moving an unchanged contextual passage reuses its vector but updates source identity', async () => {
  const root = setup();
  const file = join(root, '.agent/knowledge/a.md');
  writeFileSync(file, '# Heading\nUnchanged body.\n');
  await prepare(root, config, embed, key);
  const before = readSnapshot(root, config).chunks[0]!;
  writeFileSync(file, '\n\n# Heading\nUnchanged body.\n');
  const result = await prepare(root, config, noNetwork, noNetwork);
  const after = readSnapshot(root, config).chunks[0]!;
  expect(result.embeddedVectors).toBe(0);
  expect(after.vector).toBe(before.vector);
  expect(after.passageId).not.toBe(before.passageId);
  expect(after.startLine).toBe(before.startLine + 2);
});

test('schema-1 commands do not mutate; failed migration preserves bytes and explicit prepare migrates', async () => {
  const root = setup();
  const file = join(root, '.agent/knowledge/a.md');
  writeFileSync(file, '# Before\nOriginal source.');
  await prepare(root, config, embed, key);
  const snapshot = readSnapshot(root, config);
  const legacy = JSON.stringify({ ...snapshot, schemaVersion: 1 });
  const path = join(indexPath(root), 'snapshot.json');
  writeFileSync(path, legacy);
  const vectors = readdirSync(join(indexPath(root), 'vectors'));
  for (const operation of [
    () => search(root, config, 'before', noNetwork, noNetwork),
    () => status(root, config),
    () => gc(root, config),
  ]) {
    await expect(operation()).rejects.toThrow('incompatible');
    expect(readFileSync(path, 'utf8')).toBe(legacy);
    expect(readdirSync(join(indexPath(root), 'vectors'))).toEqual(vectors);
  }
  writeFileSync(file, '# After\nChanged source.');
  await expect(prepare(root, config, noNetwork, key)).rejects.toThrow('UNEXPECTED_NETWORK');
  expect(readFileSync(path, 'utf8')).toBe(legacy);
  await prepare(root, config, embed, key);
  expect(readSnapshot(root, config).schemaVersion).toBe(2);
});

test('unknown custom models use single-input conservative batches without hidden configuration changes', async () => {
  const root = setup();
  writeFileSync(join(root, '.agent/knowledge/a.md'), '# One\nFirst body.\n\n# Two\nSecond body.');
  const custom = { ...config, embedding: { model: 'custom-model' } };
  const sizes: number[] = [];
  await prepare(
    root,
    custom,
    async (inputs) => {
      sizes.push(inputs.length);
      return embed(inputs);
    },
    key,
  );
  expect(sizes).toEqual([1, 1]);
  expect(readSnapshot(root, custom).profile.model).toBe('custom-model');
});

test('filesystem preparation preserves a UTF-8 BOM in source coverage and coordinates', async () => {
  const root = setup();
  const original = '\uFEFF# Heading\r\nPolish dokument.\r\n';
  const normalized = original.replace(/\r\n?/g, '\n');
  await Bun.write(join(root, '.agent/knowledge/bom.md'), original);
  await prepare(root, config, embed, key);
  const snapshot = readSnapshot(root, config);
  const source = snapshot.sources[0]!;
  const byId = new Map(snapshot.chunks.map((chunk) => [chunk.passageId, chunk]));
  const restored = source.spans
    .map((span) => ('passageId' in span ? byId.get(span.passageId)!.text : span.text))
    .join('');
  expect(restored).toBe(normalized);
  expect(source.length).toBe(Array.from(normalized).length);
  expect(source.sourceHash).toBe('sha256:' + sha256(normalized));
  expect(source.lineStarts).toEqual([0, 11, 28]);
  for (const chunk of snapshot.chunks) {
    expect(Array.from(normalized).slice(chunk.start, chunk.end).join('')).toBe(chunk.text);
  }
});
