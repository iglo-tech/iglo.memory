import { expect, test } from 'bun:test';
import {
  adaptedBaseline,
  controlledCandidates,
  controlledInputs,
  rerankedAblation,
} from '@/scripts/retrieval-eval/ablations';
import { chunkSource } from '@/src/chunks';
import { BASE_URL } from '@/src/embedding';
import { expansionRequest, EXPANSION_MODEL } from '@/src/expansion';
import { buildLexical } from '@/src/lexical';
import { profileFor, vectorName, type Snapshot } from '@/src/store';
import type { Config } from '@/src/config';
import { budgetFor } from '@/src/token-budget';

function fixture() {
  const profile = profileFor('fixture', 2);
  const snapshot: Snapshot = {
    schemaVersion: 2,
    project: 'p',
    profile,
    preparedAt: new Date(0).toISOString(),
    documents: 3,
    chunks: [],
    sources: [],
    lexical: buildLexical([]),
  };
  const vectors = new Map<string, number[]>();
  for (const [source, text, vector] of [
    ['one.md', '# Alpha\nalpha\n\n# Second\nalpha', [1, 0]],
    ['two.md', '# Beta\nbeta', [-1, 0]],
    ['three.md', '# Remote\nremote', [0, 1]],
  ] as const) {
    const parsed = chunkSource('p', source, text, 'fixture');
    snapshot.sources.push(parsed.document);
    for (const chunk of parsed.chunks) {
      const name = vectorName(profile, chunk.chunkHash);
      snapshot.chunks.push({ ...chunk, vector: name, vectorHash: 'sha256:' + 'a'.repeat(64) });
      vectors.set(name, [...vector]);
    }
  }
  snapshot.lexical = buildLexical(snapshot.chunks);
  return { snapshot, vectors };
}

test('adapted baseline preserves threshold, exact scoring and per-file dedup', () => {
  const { snapshot, vectors } = fixture();
  const result = adaptedBaseline(snapshot, vectors, 'alpha', [1, 0]);
  expect(result).toHaveLength(1);
  expect(result[0]!.score).toBeCloseTo(0.99, 12);
  expect(result[0]!.chunk.source).toBe('one.md');
  expect(adaptedBaseline(snapshot, vectors, 'unknown', [0, -1])).toEqual([]);
});

test('controlled fusion retains multiple passages and applies complete rerank cutoff with current excerpts', () => {
  const { snapshot, vectors } = fixture();
  const candidates = controlledCandidates(snapshot, vectors, 'alpha', {
    queryVector: [1, 0],
    expansion: { lex: ['remote'], vec: [], hyde: [] },
    generatedVectors: [],
    savedRerank: () => [],
  });
  expect(candidates.original.filter((item) => item.chunk.source === 'one.md')).toHaveLength(2);
  expect(
    candidates.expanded.find((item) => item.chunk.source === 'three.md')!.score,
  ).toBeGreaterThan(candidates.original.find((item) => item.chunk.source === 'three.md')!.score);
  const result = rerankedAblation(
    snapshot,
    'alpha',
    candidates.original,
    candidates.original.map((_, index) => ({ index, score: index === 1 ? 0.8 : 0.1 })),
  );
  expect(result.results).toHaveLength(1);
  expect(result.results[0]!.passageId).toBe(candidates.original[1]!.chunk.passageId);
  expect(result.results[0]!.snippetSpan).toBeDefined();
  expect(() =>
    rerankedAblation(snapshot, 'alpha', candidates.original, [{ index: 0, score: 0.9 }]),
  ).toThrow('complete ablation scores');
});

test('captured shared vectors reject changed inputs and rerank candidate payloads', async () => {
  const { snapshot } = fixture();
  const config = { project: 'p', embedding: { model: 'fixture' } } as Config;
  const rows = [
    {
      endpoint: `${BASE_URL}/embeddings`,
      status: 200,
      payload: {
        model: 'fixture',
        input: [budgetFor('fixture').formatQuery('alpha')],
        encoding_format: 'float',
      },
      response: { data: [{ index: 0, embedding: [1, 0] }] },
    },
    {
      endpoint: `${BASE_URL}/chat/completions`,
      status: 200,
      payload: expansionRequest('alpha'),
      response: {
        model: EXPANSION_MODEL,
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify({ lex: [], vec: [], hyde: [] }) },
          },
        ],
      },
    },
  ];
  const inputs = await controlledInputs(snapshot, config, 'alpha', rows);
  expect(inputs.queryVector).toEqual([1, 0]);
  expect(inputs.generatedVectors).toEqual([]);
  expect(() => inputs.savedRerank(['changed candidates'])).toThrow('exact captured request');
  await expect(controlledInputs(snapshot, config, 'beta', rows)).rejects.toThrow();
});
