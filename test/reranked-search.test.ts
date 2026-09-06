import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { prepare } from '@/src/prepare';
import { search } from '@/src/search';
import { AppError } from '@/src/errors';
import { readSnapshot } from '@/src/store';
import { cleanup, repository } from '@/test/helpers';

afterEach(cleanup);
test('reranking uses original question and complete candidates, returning exact snapshot excerpts or empty', async () => {
  const root = repository();
  const directory = join(root, '.agent/knowledge');
  mkdirSync(directory, { recursive: true });
  const text =
    '# First\n' +
    'ordinary '.repeat(70) +
    'needle at the suffix.\n\n# Second\nComplementary needle detail.\n\n# Irrelevant\nOther content.';
  await Bun.write(join(directory, 'notes.md'), text);
  const config = { project: 'fixture', embedding: { model: 'openai/text-embedding-3-small' } };
  const embedding = async (inputs: string[]) => inputs.map(() => [1, 0]);
  await prepare(root, config, embedding, () => 'fixture');
  const snapshot = readSnapshot(root, config);
  rmSync(directory, { recursive: true });
  const options = {
    expansion: async () => ({ lex: ['detail'], vec: [], hyde: [] }),
    minimumScore: 0.5,
    reranking: async (query: string, documents: string[]) => {
      expect(query).toBe('needle');
      expect(documents).toHaveLength(snapshot.chunks.length);
      expect(documents.some((document) => document.includes('needle at the suffix.'))).toBe(true);
      return documents
        .map((document, index) => ({ index, score: document.includes('needle') ? 0.9 : 0.1 }))
        .sort((a, b) => b.score - a.score || a.index - b.index);
    },
  };
  const result = await search(root, config, 'needle', embedding, () => 'fixture', options);
  expect(result.results).toHaveLength(2);
  expect(new Set(result.results.map((item) => item.source)).size).toBe(1);
  for (const item of result.results) {
    const { start, end } = item.snippetSpan;
    const exact = Array.from(text).slice(start, end).join('');
    expect(exact).toContain('needle');
    expect(item.snippet).toContain(exact);
    expect(end - start).toBeLessThanOrEqual(400);
  }
  const empty = await search(root, config, 'needle', embedding, () => 'fixture', {
    ...options,
    reranking: async (_query, documents) => documents.map((_, index) => ({ index, score: 0 })),
  });
  expect(empty.results).toEqual([]);
  const cause = new AppError('RERANK_FAILED');
  await expect(
    search(root, config, 'needle', embedding, () => 'fixture', {
      ...options,
      reranking: async () => {
        throw cause;
      },
    }),
  ).rejects.toBe(cause);
});
