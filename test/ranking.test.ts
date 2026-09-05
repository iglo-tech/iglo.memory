import { expect, test } from 'bun:test';
import { chunkMarkdown } from '@/src/chunks';
import { profileFor, vectorName, type Snapshot } from '@/src/store';
import { rank } from '@/src/search';

test('exact identifiers break semantic ties; results deduplicate, cap and stay deterministic', () => {
  const profile = profileFor('fixture', 2);
  const snapshot: Snapshot = {
    schemaVersion: 1,
    project: 'p',
    profile,
    preparedAt: new Date().toISOString(),
    documents: 12,
    chunks: [],
  };
  const vectors = new Map<string, number[]>();
  for (let i = 0; i < 12; i++) {
    const chunks = chunkMarkdown(
      'p',
      `.agent/knowledge/${i}.md`,
      i === 11
        ? '# Target\nrefresh_token rotation\n\n# Duplicate\nrefresh_token again'
        : '# General\nRelated session information',
    );
    for (const chunk of chunks) {
      const vector = vectorName(profile, chunk.chunkHash);
      snapshot.chunks.push({ ...chunk, vector, vectorHash: 'sha256:' + 'a'.repeat(64) });
      vectors.set(vector, [1, 0]);
    }
  }
  const result = rank(snapshot, vectors, 'refresh_token', [1, 0]);
  expect(result).toHaveLength(8);
  expect(result[0]!.source).toBe('.agent/knowledge/11.md');
  expect(new Set(result.map((x) => x.source)).size).toBe(8);
  expect(
    rank({ ...snapshot, chunks: [...snapshot.chunks].reverse() }, vectors, 'refresh_token', [1, 0]),
  ).toEqual(result);
  expect(rank(snapshot, vectors, 'unrelated', [-1, 0])).toEqual([]);
});
