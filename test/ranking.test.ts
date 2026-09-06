import { expect, test } from 'bun:test';
import { chunkSource } from '@/src/chunks';
import { profileFor, vectorName, type Snapshot } from '@/src/store';
import { rank, originalCandidates, fuseCandidates } from '@/src/search';
import { buildLexical } from '@/src/lexical';

test('original hybrid keeps identifiers and multiple passages with deterministic ties', () => {
  const profile = profileFor('fixture', 2);
  const snapshot: Snapshot = {
    schemaVersion: 2,
    project: 'p',
    profile,
    preparedAt: new Date().toISOString(),
    documents: 12,
    chunks: [],
    sources: [],
    lexical: buildLexical([]),
  };
  const vectors = new Map<string, number[]>();
  for (let i = 0; i < 12; i++) {
    const parsed = chunkSource(
      'p',
      `.agent/knowledge/${i}.md`,
      i === 11
        ? '# Target\nrefresh_token rotation\n\n# Duplicate\nrefresh_token again'
        : '# General\nRelated session information',
      'fixture',
    );
    snapshot.sources.push(parsed.document);
    for (const chunk of parsed.chunks) {
      const vector = vectorName(profile, chunk.chunkHash);
      snapshot.chunks.push({ ...chunk, vector, vectorHash: 'sha256:' + 'a'.repeat(64) });
      vectors.set(vector, [1, 0]);
    }
  }
  snapshot.lexical = buildLexical(snapshot.chunks);
  const result = rank(snapshot, vectors, 'refresh_token', [1, 0]);
  expect(result).toHaveLength(8);
  expect(result[0]!.source).toBe('.agent/knowledge/11.md');
  expect(result.filter((x) => x.source === '.agent/knowledge/11.md')).toHaveLength(2);
  expect(
    rank({ ...snapshot, chunks: [...snapshot.chunks].reverse() }, vectors, 'refresh_token', [1, 0]),
  ).toEqual(result);
  expect(originalCandidates(snapshot, vectors, 'unrelated', [-1, 0]).lexical).toEqual([]);
  expect(originalCandidates(snapshot, vectors, 'unrelated', [-1, 0]).vector).toHaveLength(
    snapshot.chunks.length,
  );
});

test('protected fusion preserves original top eights and fills with soft file diversity', () => {
  const template = chunkSource('p', 'shared.md', 'body', 'fixture').chunks[0]!;
  const make = (i: number, source = 'shared.md') => ({
    chunk: {
      ...template,
      source,
      start: i * 4,
      end: i * 4 + 4,
      passageId: `p${i}`,
      vector: '',
      vectorHash: '',
    },
    score: 100 - i,
  });
  const vector = Array.from({ length: 40 }, (_, i) => make(i));
  const lexical = Array.from({ length: 40 }, (_, i) =>
    make(i + 40, i < 8 ? 'shared.md' : `file${i}.md`),
  );
  const results = fuseCandidates({ vector, lexical });
  expect(results).toHaveLength(40);
  const ids = new Set(results.map((item) => item.chunk.passageId));
  for (const item of [...vector.slice(0, 8), ...lexical.slice(0, 8)])
    expect(ids.has(item.chunk.passageId)).toBe(true);
  expect(results.filter((item) => item.chunk.source === 'shared.md')).toHaveLength(16);
  expect(fuseCandidates({ vector: [...vector, ...vector], lexical })).toEqual(results);
  expect(fuseCandidates({ vector, lexical: vector })).toHaveLength(40);
  expect(fuseCandidates({ vector: [], lexical: [] })).toEqual([]);
});
