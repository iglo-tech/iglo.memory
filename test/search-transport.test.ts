import { expect, test } from 'bun:test';
import { embed } from '@/src/embedding';
import { errorResponse } from '@/src/errors';
import { requestSearchJson } from '@/src/search-transport';

function request(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return Object.assign(handler, { preconnect: fetch.preconnect });
}
const options = () => ({
  deadline: performance.now() + 30_000,
  maxBytes: 1024,
  code: 'EMBEDDING_FAILED' as const,
});

test('query transport retries only transient failures, twice, honoring Retry-After', async () => {
  for (const first of [429, 500, 599, 'network']) {
    let calls = 0;
    const waits: number[] = [];
    const signals: AbortSignal[] = [];
    const result = await requestSearchJson(
      'https://test.invalid',
      {},
      options(),
      request(async (_, init) => {
        signals.push(init!.signal!);
        expect(init!.redirect).toBe('error');
        if (++calls === 1) {
          if (first === 'network') throw new TypeError('SECRET_NETWORK');
          return new Response('SECRET', {
            status: first as number,
            headers: { 'Retry-After': '2' },
          });
        }
        return Response.json({ ok: true });
      }),
      async (ms) => {
        waits.push(ms);
      },
    );
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(waits).toEqual([first === 'network' ? 250 : 2000]);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  }
  let calls = 0;
  await expect(
    requestSearchJson(
      'https://test.invalid',
      {},
      options(),
      request(async () => {
        calls++;
        return new Response('SECRET', { status: 503 });
      }),
      async () => {},
    ),
  ).rejects.toMatchObject({ code: 'EMBEDDING_FAILED', details: { reason: 'provider' } });
  expect(calls).toBe(2);
});

test('permanent responses and malformed JSON are terminal and redact diagnostics', async () => {
  for (const status of [200, 400, 401, 403, 404, 408, 422]) {
    let calls = 0;
    try {
      await requestSearchJson(
        'https://test.invalid',
        {},
        options(),
        request(async () => {
          calls++;
          return new Response('PROVIDER_SECRET', { status });
        }),
      );
      throw new Error('Expected failure');
    } catch (error) {
      const result = errorResponse(error);
      expect(result.error.code).toBe('EMBEDDING_FAILED');
      expect(JSON.stringify(result)).not.toContain('PROVIDER_SECRET');
    }
    expect(calls).toBe(1);
  }
});

test('bounded bodies cancel oversized declared and streamed responses without retry', async () => {
  for (const declared of [true, false]) {
    let cancelled = false;
    let calls = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1025));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      requestSearchJson(
        'https://test.invalid',
        {},
        options(),
        request(async () => {
          calls++;
          return new Response(stream, { headers: declared ? { 'Content-Length': '1025' } : {} });
        }),
      ),
    ).rejects.toMatchObject({ code: 'EMBEDDING_FAILED', details: { reason: 'budget' } });
    expect(calls).toBe(1);
    expect(cancelled).toBe(true);
  }
});

test('total deadline bounds stalled fetch and body, with cancellation and timeout precedence', async () => {
  for (const stalled of ['fetch', 'body']) {
    let signal: AbortSignal | undefined;
    let cancelled = false;
    const started = performance.now();
    await expect(
      requestSearchJson(
        'https://test.invalid',
        {},
        { ...options(), deadline: started + 25 },
        request(async (_, init) => {
          signal = init!.signal!;
          if (stalled === 'fetch') return new Promise<Response>(() => {});
          return new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
          );
        }),
      ),
    ).rejects.toMatchObject({ code: 'SEARCH_TIMEOUT' });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(signal!.aborted).toBe(true);
    if (stalled === 'body') expect(cancelled).toBe(true);
  }
  let calls = 0;
  await expect(
    requestSearchJson(
      'https://test.invalid',
      {},
      { ...options(), deadline: performance.now() - 1 },
      request(async () => {
        calls++;
        return Response.json({});
      }),
    ),
  ).rejects.toMatchObject({ code: 'SEARCH_TIMEOUT' });
  expect(calls).toBe(0);
});

test('retry delay that cannot fit prevents another request; stalled injected sleep is bounded', async () => {
  let calls = 0;
  await expect(
    requestSearchJson(
      'https://test.invalid',
      {},
      options(),
      request(async () => {
        calls++;
        return new Response('', { status: 429, headers: { 'Retry-After': '60' } });
      }),
      async () => {
        throw new Error('Must not sleep');
      },
    ),
  ).rejects.toMatchObject({ code: 'EMBEDDING_FAILED', details: { reason: 'rate_limit' } });
  expect(calls).toBe(1);
  calls = 0;
  await expect(
    requestSearchJson(
      'https://test.invalid',
      {},
      { ...options(), deadline: performance.now() + 300 },
      request(async () => {
        calls++;
        throw new TypeError('SECRET');
      }),
      async () => new Promise(() => {}),
    ),
  ).rejects.toMatchObject({ code: 'SEARCH_TIMEOUT' });
  expect(calls).toBe(1);
});

test('search embedding validates shape once and preserves prepare retry behavior', async () => {
  for (const body of [
    { data: [] },
    { data: [{ index: 0, embedding: [0, 0] }] },
    { data: [{ index: 1, embedding: [1, 0] }] },
  ]) {
    let calls = 0;
    await expect(
      embed(
        ['a'],
        'model',
        'SECRET_KEY',
        2,
        request(async () => {
          calls++;
          return Response.json(body);
        }),
        async () => {},
        { deadline: performance.now() + 30_000 },
      ),
    ).rejects.toMatchObject({
      code: 'EMBEDDING_FAILED',
      details: { stage: 'embedding', reason: 'invalid_response' },
    });
    expect(calls).toBe(1);
  }
  let calls = 0;
  const vectors = await embed(
    ['a'],
    'model',
    'key',
    2,
    request(async () => {
      calls++;
      return calls < 4
        ? new Response('', { status: 500 })
        : Response.json({ data: [{ index: 0, embedding: [1, 0] }] });
    }),
    async () => {},
  );
  expect(calls).toBe(4);
  expect(vectors).toEqual([[1, 0]]);
});

test('caller cancellation settles stalled fetch and body without a second request', async () => {
  for (const stalled of ['fetch', 'body']) {
    const controller = new AbortController();
    let calls = 0;
    let signal: AbortSignal | undefined;
    let cancelled = false;
    const started = performance.now();
    const result = requestSearchJson(
      'https://test.invalid',
      {},
      { ...options(), signal: controller.signal, code: 'EXPANSION_FAILED' },
      request(async (_, init) => {
        calls++;
        signal = init!.signal!;
        if (stalled === 'fetch') return new Promise<Response>(() => {});
        return new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
        );
      }),
    );
    await Bun.sleep(10);
    controller.abort(new Error('PRIVATE_CAUSE'));
    await expect(result).rejects.toMatchObject({
      code: 'EXPANSION_FAILED',
      details: { stage: 'expansion', reason: 'transport' },
    });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(calls).toBe(1);
    expect(signal!.aborted).toBe(true);
    if (stalled === 'body') expect(cancelled).toBe(true);
  }
});

test('caller cancellation interrupts default and uncooperative injected retry waits', async () => {
  for (const injected of [false, true]) {
    const controller = new AbortController();
    let calls = 0;
    const result = requestSearchJson(
      'https://test.invalid',
      {},
      { ...options(), signal: controller.signal },
      request(async () => {
        calls++;
        return new Response('', { status: 429, headers: { 'Retry-After': '9' } });
      }),
      injected ? async () => new Promise(() => {}) : undefined,
    );
    await Bun.sleep(10);
    controller.abort();
    await expect(result).rejects.toMatchObject({
      code: 'EMBEDDING_FAILED',
      details: { reason: 'transport' },
    });
    expect(calls).toBe(1);
  }
});

test('pre-aborted embedding makes no request and an expired deadline wins over cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const fetcher = request(async () => {
    calls++;
    return Response.json({});
  });
  await expect(
    embed(['a'], 'model', 'key', 2, fetcher, undefined, {
      deadline: performance.now() + 30_000,
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ code: 'EMBEDDING_FAILED', details: { reason: 'transport' } });
  await expect(
    requestSearchJson(
      'https://test.invalid',
      {},
      {
        ...options(),
        deadline: performance.now() - 1,
        signal: controller.signal,
      },
      fetcher,
    ),
  ).rejects.toMatchObject({ code: 'SEARCH_TIMEOUT' });
  expect(calls).toBe(0);
});

test('cancelled default retry timer does not keep a CLI process alive', async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      '-e',
      `
    import { requestSearchJson } from '@/src/search-transport';
    const controller = new AbortController();
    const request = async () => new Response('', { status: 429, headers: { 'Retry-After': '9' } });
    const pending = requestSearchJson('https://test.invalid', {}, {
      deadline: performance.now() + 30000, maxBytes: 1024,
      code: 'EMBEDDING_FAILED', signal: controller.signal,
    }, request);
    setTimeout(() => controller.abort(), 20);
    try { await pending; process.exitCode = 1; }
    catch (error) { process.exitCode = error.code === 'EMBEDDING_FAILED' ? 0 : 2; }
  `,
    ],
    { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' },
  );
  const timeout = setTimeout(() => child.kill(), 2000);
  try {
    expect(await child.exited).toBe(0);
  } finally {
    clearTimeout(timeout);
    child.kill();
  }
});
