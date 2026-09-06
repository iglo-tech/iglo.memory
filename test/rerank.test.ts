import { expect, test } from 'bun:test';
import { DEFAULT_RERANK_MODEL } from '@/src/config';
import { errorResponse } from '@/src/errors';
import { parseRerank, rerank, rerankRequest } from '@/src/rerank';

const documents = ['Context: ["docs/a.md"]\n\nŻółć 😀 unchanged.', 'Second complete passage'];
const response = () => ({
  model: 'rerank-2.5',
  results: documents
    .map((text, index) => ({ index, relevance_score: 0.7, document: { text } }))
    .reverse(),
  usage: { total_tokens: 42, search_units: 1, cost: 0.00001 },
});
function request(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return Object.assign(handler, { preconnect: fetch.preconnect });
}

test('rerank preserves full query/documents, complete permutation and stable ties', () => {
  const query = 'Czy `initialConfig` używa --cache?';
  expect(rerankRequest(query, documents)).toEqual({
    model: DEFAULT_RERANK_MODEL,
    query,
    documents,
    top_n: 2,
  });
  expect(parseRerank(response(), documents)).toEqual([
    { index: 0, score: 0.7 },
    { index: 1, score: 0.7 },
  ]);
  const body = response();
  body.model = DEFAULT_RERANK_MODEL;
  body.results[0]!.relevance_score = 8;
  body.results[1]!.relevance_score = -2;
  expect(parseRerank(body, documents)).toEqual([
    { index: 1, score: 8 },
    { index: 0, score: -2 },
  ]);
  expect(parseRerank({ model: 'rerank-2.5', results: body.results }, documents)).toHaveLength(2);
});

test('rerank rejects malformed indices, changed evidence, models, scores and usage', () => {
  const body = response();
  const invalid: unknown[] = [
    null,
    [],
    {},
    { ...body, error: {} },
    { ...body, model: 'custom' },
    { ...body, results: [] },
    { ...body, results: [body.results[0]] },
    { ...body, results: [body.results[0], body.results[0]] },
    { ...body, usage: null },
    { ...body, usage: { total_tokens: 1.5 } },
    { ...body, usage: { search_units: -1 } },
    { ...body, usage: { cost: NaN } },
    { ...body, usage: { cost: -1 } },
    { ...body, usage: { total_tokens: Number.MAX_SAFE_INTEGER + 1 } },
  ];
  for (const index of [-1, 2, 0.5, NaN, '1'])
    invalid.push({ ...body, results: [{ ...body.results[0], index }, body.results[1]] });
  for (const relevance_score of [NaN, Infinity, '0.7', null])
    invalid.push({ ...body, results: [{ ...body.results[0], relevance_score }, body.results[1]] });
  for (const document of [{ text: documents[1] + ' altered' }, {}, null])
    invalid.push({ ...body, results: [{ ...body.results[0], document }, body.results[1]] });
  for (const value of invalid) expect(() => parseRerank(value, documents)).toThrow();
});

test('local rerank bounds reject excess input without clipping or custom-route inference', () => {
  for (const query of ['', ' ', '\ud800', 'word '.repeat(2050), '\n'.repeat(8200)])
    expect(() => rerankRequest(query, documents)).toThrow();
  for (const docs of [
    [],
    Array(41).fill('body'),
    [''],
    ['\ud800'],
    ['word '.repeat(4100)],
    ['\n'.repeat(16400)],
  ])
    expect(() => rerankRequest('question', docs)).toThrow();
  expect(() => rerankRequest('question', documents, 'custom/model')).toThrow();
  expect(() => parseRerank(response(), documents, 'custom/model')).toThrow();
});

test('transport posts exact envelope and rejects provider corruption without retry', async () => {
  let calls = 0;
  const stub = request(async (url, init) => {
    calls++;
    expect(String(url)).toBe('https://openrouter.ai/api/v1/rerank');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual(rerankRequest('question', documents));
    return Response.json(calls === 1 ? response() : { ...response(), results: [] });
  });
  expect(
    await rerank(
      'question',
      documents,
      DEFAULT_RERANK_MODEL,
      'test-key',
      { deadline: performance.now() + 30000 },
      stub,
    ),
  ).toHaveLength(2);
  await expect(
    rerank(
      'question',
      documents,
      DEFAULT_RERANK_MODEL,
      'test-key',
      { deadline: performance.now() + 30000 },
      stub,
    ),
  ).rejects.toMatchObject({ code: 'RERANK_FAILED' });
  expect(calls).toBe(2);
});

test('rerank body cap, local failures and total deadline are safe and terminal', async () => {
  let calls = 0;
  const stub = request(async () => {
    calls++;
    return new Response('secret-provider-body'.repeat(120000));
  });
  await expect(
    rerank(
      'question',
      documents,
      DEFAULT_RERANK_MODEL,
      'secret-key',
      { deadline: performance.now() + 30000 },
      stub,
    ),
  ).rejects.toMatchObject({ code: 'RERANK_FAILED', details: { reason: 'budget' } });
  expect(calls).toBe(1);
  for (const model of [DEFAULT_RERANK_MODEL, 'custom']) {
    try {
      await rerank(
        'question',
        documents,
        model,
        'secret-key',
        { deadline: performance.now() - 1 },
        stub,
      );
      throw new Error('Expected timeout');
    } catch (error) {
      expect(errorResponse(error).error.code).toBe('SEARCH_TIMEOUT');
      expect(JSON.stringify(errorResponse(error))).not.toContain('secret');
    }
  }
  await expect(
    rerank(
      'question',
      documents,
      'custom',
      'secret-key',
      { deadline: performance.now() + 30000 },
      stub,
    ),
  ).rejects.toMatchObject({ code: 'RERANK_FAILED', details: { reason: 'provider' } });
  expect(calls).toBe(1);
});
