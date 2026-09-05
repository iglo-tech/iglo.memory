import { expect, test } from 'bun:test';
import { embed, retryDelay, validVector } from '@/src/embedding';
function request(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return Object.assign(handler, { preconnect: fetch.preconnect });
}

test('OpenRouter body, index mapping and float32 validation', async () => {
  const result = await embed(
    ['a', 'b'],
    'model',
    'dummy',
    undefined,
    request(async (url, init) => {
      expect(String(url)).toBe('https://openrouter.ai/api/v1/embeddings');
      expect(init?.redirect).toBe('error');
      expect(JSON.parse(init!.body as string)).toEqual({
        model: 'model',
        input: ['a', 'b'],
        encoding_format: 'float',
      });
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer dummy');
      return Response.json({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      });
    }),
  );
  expect(result).toEqual([
    [1, 0],
    [0, 1],
  ]);
  for (const v of [[], [0, 0], [Infinity, 1], [NaN, 1], [1e80, 1], [1e-80, 0], ['1', 0]])
    expect(() => validVector(v)).toThrow();
});

test('duplicate/missing indices, wrong dimensions and malformed payload fail without retries', async () => {
  for (const data of [
    [
      { index: 0, embedding: [1, 0] },
      { index: 0, embedding: [0, 1] },
    ],
    [{ index: 0, embedding: [1, 0] }],
    [
      { index: 0, embedding: [1, 0] },
      { index: 2, embedding: [0, 1] },
    ],
    [
      { index: 0, embedding: [1] },
      { index: 1, embedding: [0, 1] },
    ],
  ]) {
    let calls = 0;
    await expect(
      embed(
        ['a', 'b'],
        'm',
        'dummy',
        2,
        request(async () => {
          calls++;
          return Response.json({ data });
        }),
      ),
    ).rejects.toThrow('embedding request');
    expect(calls).toBe(1);
  }
});

test('bounded transient retries, Retry-After and permanent failure redaction', async () => {
  const waits: number[] = [];
  let calls = 0;
  const vectors = await embed(
    ['a'],
    'm',
    'dummy',
    undefined,
    request(async () => {
      calls++;
      return calls < 3
        ? new Response('secret', { status: 429, headers: { 'Retry-After': '2' } })
        : Response.json({ data: [{ index: 0, embedding: [1, 0] }] });
    }),
    async (ms) => {
      waits.push(ms);
    },
  );
  expect(vectors).toEqual([[1, 0]]);
  expect(waits).toEqual([2000, 2000]);
  for (const status of [400, 401, 402, 403, 404, 408, 422]) {
    calls = 0;
    await expect(
      embed(
        ['a'],
        'm',
        'dummy',
        undefined,
        request(async () => {
          calls++;
          return new Response('PROVIDER_SECRET', { status });
        }),
        async () => {},
      ),
    ).rejects.toThrow('embedding request');
    expect(calls).toBe(1);
  }
  calls = 0;
  await expect(
    embed(
      ['a'],
      'm',
      'dummy',
      undefined,
      request(async () => {
        calls++;
        throw new TypeError('SECRET_NETWORK');
      }),
      async () => {},
    ),
  ).rejects.toThrow('embedding request');
  expect(calls).toBe(4);
  const now = Date.parse('2026-01-01T00:00:00Z');
  expect(retryDelay('Thu, 01 Jan 2026 00:00:04 GMT', 0, now)).toBe(4000);
  expect(retryDelay('bad', 1, now)).toBe(2000);
});
