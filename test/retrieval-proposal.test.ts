import { expect, test } from 'bun:test';
import { savedTransport } from '@/scripts/retrieval-eval/proposal';

test('saved transport matches exact values despite concurrency order and JSON key order', async () => {
  const replay = savedTransport([
    {
      endpoint: 'https://example.test/a',
      status: 200,
      payload: { a: 1, b: [2] },
      response: { value: 1 },
    },
    { endpoint: 'https://example.test/b', status: 200, payload: { a: 2 }, response: { value: 2 } },
  ]);
  expect(
    await (await replay.request('https://example.test/b', { body: '{"a":2}' })).json(),
  ).toEqual({ value: 2 });
  expect(
    await (await replay.request('https://example.test/a', { body: '{"b":[2],"a":1}' })).json(),
  ).toEqual({ value: 1 });
  replay.assertConsumed();
});

test('saved transport never falls back or silently drops observations', async () => {
  const replay = savedTransport([
    { endpoint: 'https://example.test/a', status: 200, payload: { a: [1, 2] }, response: {} },
  ]);
  expect(() => replay.assertConsumed()).toThrow('Unused');
  await expect(replay.request('https://example.test/a', { body: '{"a":[2,1]}' })).rejects.toThrow(
    'Unmatched',
  );
  expect(() => replay.assertConsumed()).toThrow('Unmatched');
  expect(() =>
    savedTransport([{ endpoint: 'x', status: 429, payload: {}, response: {} }]),
  ).toThrow();
});

import { proposalExcerpts } from '@/scripts/retrieval-eval/proposal';
import { chunkSource } from '@/src/chunks';
import { buildLexical } from '@/src/lexical';
import { profileFor, type Snapshot } from '@/src/store';
import { excerpt } from '@/src/presentation';

test('proposal evidence preserves Unicode source coordinates and rejects invented markers or ownership', () => {
  const body = '😀 '.repeat(230) + '\nżółw refreshToken…';
  const parsed = chunkSource('fixture', 'doc.md', body);
  const chunks = parsed.chunks.map((chunk) => ({ ...chunk, vector: '', vectorHash: '' }));
  const snapshot: Snapshot = {
    schemaVersion: 2,
    project: 'fixture',
    preparedAt: '',
    profile: profileFor('fixture', 2),
    documents: 1,
    chunks,
    sources: [parsed.document],
    lexical: buildLexical(chunks),
  };
  const chunk = chunks[0]!;
  const displayed = excerpt(snapshot, chunk, 'refreshToken');
  const result = {
    passageId: chunk.passageId,
    source: chunk.source,
    heading: chunk.heading,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    ...displayed,
  };
  const response = {
    responseVersion: 2,
    scoreKind: 'ordinal',
    retrievalRevision: 'qwen-luna-voyage-v2',
    results: [result],
  };
  const sources = new Map([['fixture/doc.md', body]]);
  const mapped = proposalExcerpts(response, snapshot, sources)[0]!;
  expect(mapped.text).toBe(Array.from(body).slice(mapped.start!, mapped.end!).join(''));
  expect(mapped.text.length).toBeGreaterThan(0);
  for (const changed of [
    { ...result, source: 'other.md' },
    { ...result, snippet: result.snippet + '…' },
    { ...result, snippetSpan: { ...result.snippetSpan, startColumn: 0 } },
    { ...result, snippetSpan: { ...result.snippetSpan, start: -1 } },
  ])
    expect(() =>
      proposalExcerpts({ ...response, results: [changed] }, snapshot, sources),
    ).toThrow();
  expect(() =>
    proposalExcerpts({ ...response, results: [result, result] }, snapshot, sources),
  ).toThrow();
});
