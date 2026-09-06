import { afterEach, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { observeProposal, proposalObserver } from '@/scripts/retrieval-eval/proposal-observation';
import { requestSearchJson } from '@/src/search-transport';
import { prepare } from '@/src/prepare';
import { cleanup, repository } from '@/test/helpers';
const config = { project: 'fixture', embedding: { model: 'fixture' } };
afterEach(cleanup);
async function setup(populated = true) {
  const root = repository();
  mkdirSync(join(root, '.agent/knowledge'), { recursive: true });
  await Bun.write(join(root, '.agent/memory.json'), JSON.stringify(config));
  if (populated)
    await Bun.write(join(root, '.agent/knowledge/a.md'), '# Refresh\nPrepare explicitly.');
  await prepare(
    root,
    config,
    async (input) => input.map(() => [1, 0]),
    () => 'unused',
  );
  return root;
}
const request = (failure = false): typeof fetch =>
  Object.assign(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (String(url).endsWith('/embeddings')) {
        if (failure) throw new Error('PRIVATE_TRANSPORT_DETAIL');
        return Response.json({ data: [{ index: 0, embedding: [1, 0] }], usage: { cost: 0.001 } });
      }
      if (String(url).endsWith('/chat/completions'))
        return Response.json({
          model: body.model,
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: JSON.stringify({ lex: [], vec: [], hyde: [] }),
              },
            },
          ],
          usage: { cost: 0.002 },
        });
      return Response.json({
        model: body.model,
        results: body.documents.map((text: string, index: number) => ({
          index,
          relevance_score: 0.9,
          document: { text },
        })),
      });
    },
    { preconnect: () => {} },
  );

test('observed production search retains unknown usage without recording credentials', async () => {
  const root = await setup();
  const observation = await observeProposal(root, 'prepare', request(), () => 'PRIVATE_KEY');
  expect(observation.status).toBe('PASS');
  expect(observation.result?.results).toHaveLength(1);
  expect(observation.requests).toHaveLength(3);
  expect(observation.knownCost).toBeCloseTo(0.003, 12);
  expect(observation.unknownCosts).toBe(1);
  expect(JSON.stringify(observation)).not.toContain('PRIVATE_KEY');
});
test('transport failures remain failed observations with unknown attempt costs', async () => {
  const root = await setup();
  const observation = await observeProposal(root, 'prepare', request(true), () => 'PRIVATE_KEY');
  expect(observation.status).toBe('FAIL');
  expect(observation.failure?.code).toBe('EMBEDDING_FAILED');
  expect(observation.unknownCosts).toBeGreaterThan(0);
  expect(JSON.stringify(observation.requests)).toContain('TRANSPORT_FAILED');
  expect(JSON.stringify(observation)).not.toContain('PRIVATE_TRANSPORT_DETAIL');
});
test('empty snapshot observation needs neither credentials nor requests', async () => {
  const root = await setup(false);
  const observation = await observeProposal(root, 'prepare', request(true), () => {
    throw new Error('CREDENTIAL_READ');
  });
  expect(observation.status).toBe('PASS');
  expect(observation.result?.results).toEqual([]);
  expect(observation.requests).toEqual([]);
  expect(observation.knownCost).toBe(0);
  expect(observation.unknownCosts).toBe(0);
});

test('stalled HTTP 400 bodies are cancelled without reading or retrying', async () => {
  const root = await setup();
  let calls = 0;
  let pulls = 0;
  let cancels = 0;
  const injected = Object.assign(
    async () => {
      calls++;
      return new Response(
        new ReadableStream<Uint8Array>(
          {
            pull() {
              pulls++;
              return new Promise(() => {});
            },
            cancel() {
              cancels++;
            },
          },
          { highWaterMark: 0 },
        ),
        { status: 400 },
      );
    },
    { preconnect: () => {} },
  );
  const observation = await observeProposal(root, 'prepare', injected, () => 'unused');
  expect(observation.status).toBe('FAIL');
  expect(calls).toBe(2); // Concurrent original embedding and expansion, one attempt each.
  expect(pulls).toBe(0);
  expect(cancels).toBe(2);
  expect(observation.requests).toHaveLength(2);
  expect(observation.unknownCosts).toBe(2);
  expect(observation.knownCost).toBe(0);
});

test('oversized success stops at the production byte budget and retains an unknown attempt', async () => {
  let pulls = 0;
  let cancels = 0;
  let calls = 0;
  const observer = proposalObserver(
    Object.assign(
      async () => {
        calls++;
        return new Response(
          new ReadableStream<Uint8Array>(
            {
              pull(controller) {
                pulls++;
                controller.enqueue(new Uint8Array(300 * 1024));
              },
              cancel() {
                cancels++;
              },
            },
            { highWaterMark: 0 },
          ),
        );
      },
      { preconnect: () => {} },
    ),
  );
  await expect(
    requestSearchJson(
      'https://fixture/embeddings',
      { body: '{}' },
      {
        code: 'EMBEDDING_FAILED',
        deadline: performance.now() + 500,
        maxBytes: 512 * 1024,
      },
      observer.fetch,
    ),
  ).rejects.toMatchObject({ code: 'EMBEDDING_FAILED', details: { reason: 'budget' } });
  expect(calls).toBe(1);
  expect(pulls).toBe(2);
  expect(cancels).toBe(1);
  expect(observer.requests).toHaveLength(1);
  expect(observer.requests[0]?.response).toBeUndefined();
  expect(observer.costs()).toEqual({ knownCost: 0, unknownCosts: 1 });
});

test('deadline cancellation keeps partially consumed attempts with unknown usage', async () => {
  let pulls = 0;
  let cancels = 0;
  const observer = proposalObserver(
    Object.assign(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>(
            {
              pull(controller) {
                if (++pulls === 1)
                  controller.enqueue(new TextEncoder().encode('{"usage":{"cost":1}'));
                else return new Promise(() => {});
              },
              cancel() {
                cancels++;
              },
            },
            { highWaterMark: 0 },
          ),
        ),
      { preconnect: () => {} },
    ),
  );
  await expect(
    requestSearchJson(
      'https://fixture/embeddings',
      { body: '{}' },
      {
        code: 'EMBEDDING_FAILED',
        deadline: performance.now() + 50,
        maxBytes: 512 * 1024,
      },
      observer.fetch,
    ),
  ).rejects.toMatchObject({ code: 'SEARCH_TIMEOUT' });
  expect(cancels).toBe(1);
  expect(observer.requests).toHaveLength(1);
  expect(observer.requests[0]?.response).toBeUndefined();
  expect(observer.costs()).toEqual({ knownCost: 0, unknownCosts: 1 });
});
