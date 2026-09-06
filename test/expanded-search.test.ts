import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '@/src/config';
import type { embed } from '@/src/embedding';
import { AppError } from '@/src/errors';
import type { expand } from '@/src/expansion';
import { prepare } from '@/src/prepare';
import { fuseCandidates, search } from '@/src/search';
import { requestSearchJson } from '@/src/search-transport';
import { readSnapshot } from '@/src/store';
import { budgetFor, QWEN_MODEL } from '@/src/token-budget';
import { cleanup, repository } from '@/test/helpers';

const config: Config = { project: 'expanded fixture', embedding: { model: QWEN_MODEL } };
const vector = () => [1, ...Array<number>(4095).fill(0)];
const noOp: typeof expand = async () => ({ lex: [], vec: [], hyde: [] });
afterEach(cleanup);
async function prepared() {
  const root = repository();
  const source = join(root, '.agent/knowledge');
  mkdirSync(source, { recursive: true });
  await Bun.write(
    join(source, 'settings.md'),
    '# Settings\nConfiguration lives in the prepared index.',
  );
  await Bun.write(
    join(source, 'language.md'),
    '# Polish\nWyszukiwanie dokumentacji obsługuje pytania.',
  );
  await prepare(
    root,
    config,
    async (inputs) => inputs.map(vector),
    () => 'fixture',
  );
  rmSync(source, { recursive: true });
  return root;
}

test('typed expansion embeds semantic queries with instructions and HyDE as plain text', async () => {
  const root = await prepared();
  const calls: string[][] = [];
  let credentials = 0;
  const result = await search(
    root,
    config,
    'Gdzie są ustawienia?',
    async (inputs, model, key) => {
      expect(model).toBe(QWEN_MODEL);
      expect(key).toBe('fixture');
      calls.push(inputs);
      return inputs.map(vector);
    },
    () => {
      credentials++;
      return 'fixture';
    },
    {
      reranking: async (_query, documents) => documents.map((_, index) => ({ index, score: 1 })),
      minimumScore: 0,
      expansion: async (query, key, options) => {
        expect(query).toBe('Gdzie są ustawienia?');
        expect(key).toBe('fixture');
        expect(options.signal).toBeDefined();
        return {
          lex: ['Settings'],
          vec: ['Where are settings?'],
          hyde: ['Documentation about configuration location.'],
        };
      },
    },
  );
  expect(credentials).toBe(1);
  expect(calls).toEqual([
    [budgetFor(QWEN_MODEL).formatQuery('Gdzie są ustawienia?')],
    [
      budgetFor(QWEN_MODEL).formatQuery('Where are settings?'),
      'Documentation about configuration location.',
    ],
  ]);
  expect(result.query).toBe('Gdzie są ustawienia?');
  expect(result.results).toHaveLength(2);
  expect(JSON.stringify(result.results)).not.toContain(
    'Documentation about configuration location.',
  );
});

test('lex-only and all-empty expansion require only the original embedding', async () => {
  const root = await prepared();
  for (const expansion of [noOp, async () => ({ lex: ['Settings'], vec: [], hyde: [] })]) {
    let calls = 0;
    const result = await search(
      root,
      config,
      'configuration',
      async (inputs) => {
        calls++;
        expect(inputs).toEqual([budgetFor().formatQuery('configuration')]);
        return inputs.map(vector);
      },
      () => 'fixture',
      {
        expansion,
        reranking: async (_query, documents) => documents.map((_, index) => ({ index, score: 1 })),
        minimumScore: 0,
      },
    );
    expect(calls).toBe(1);
    expect(result.results.some((item) => item.source.endsWith('settings.md'))).toBe(true);
  }
});

function untilAborted(signal: AbortSignal | undefined, settled: () => void): Promise<number[][]> {
  if (!signal) throw new Error('missing sibling cancellation signal');
  return new Promise((_, reject) => {
    const abort = () => {
      settled();
      reject(new AppError('EMBEDDING_FAILED'));
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

test('expansion failure cancels and settles original embedding, preserving causal error', async () => {
  const root = await prepared();
  let settled = false;
  const cause = new AppError('EXPANSION_FAILED', {
    stage: 'expansion',
    reason: 'invalid_response',
  });
  const embedding: typeof embed = async (
    _inputs,
    _model,
    _key,
    _dimensions,
    _request,
    _sleep,
    options,
  ) =>
    untilAborted(options?.signal, () => {
      settled = true;
    });
  await expect(
    search(root, config, 'settings', embedding, () => 'fixture', {
      expansion: async () => {
        throw cause;
      },
    }),
  ).rejects.toBe(cause);
  expect(settled).toBe(true);
});

test('original embedding failure cancels and settles expansion, preserving causal error', async () => {
  const root = await prepared();
  let settled = false;
  const cause = new AppError('EMBEDDING_FAILED', { stage: 'embedding', reason: 'provider' });
  const expansion: typeof expand = async (_query, _key, options) => {
    await untilAborted(options.signal, () => {
      settled = true;
    });
    return { lex: [], vec: [], hyde: [] };
  };
  await expect(
    search(
      root,
      config,
      'settings',
      async () => {
        throw cause;
      },
      () => 'fixture',
      {
        expansion,
        reranking: async (_query, documents) => documents.map((_, index) => ({ index, score: 1 })),
        minimumScore: 0,
      },
    ),
  ).rejects.toBe(cause);
  expect(settled).toBe(true);
});

test('total deadline aborts both inference branches and settles before search rejects', async () => {
  const root = await prepared();
  let settled = 0;
  const stalledRequest: typeof fetch = Object.assign(
    async () => new Response(new ReadableStream<Uint8Array>()),
    { preconnect: fetch.preconnect },
  );
  const wait = async (options: { deadline: number; signal?: AbortSignal } | undefined) => {
    if (!options) throw new Error('missing shared deadline');
    try {
      await requestSearchJson(
        'https://fixture.invalid',
        {},
        { ...options, maxBytes: 1024, code: 'EMBEDDING_FAILED' },
        stalledRequest,
      );
    } finally {
      settled++;
    }
  };
  const embedding: typeof embed = async (
    _inputs,
    _model,
    _key,
    _dimensions,
    _request,
    _sleep,
    options,
  ) => {
    await wait(options);
    return [vector()];
  };
  const expansion: typeof expand = async (_query, _key, options) => {
    await wait(options);
    return { lex: [], vec: [], hyde: [] };
  };
  await expect(
    search(root, config, 'settings', embedding, () => 'fixture', {
      expansion,
      deadline: performance.now() + 100,
    }),
  ).rejects.toMatchObject({ code: 'SEARCH_TIMEOUT' });
  expect(settled).toBe(2);
});

test('weighted fusion protects original top-eight union against expansion-only votes', async () => {
  const root = await prepared();
  const base = readSnapshot(root, config).chunks[0]!;
  const candidate = (id: number) => ({
    chunk: { ...base, source: `file-${id}.md`, passageId: `passage-${id}` },
    score: 1,
  });
  const vectorList = Array.from({ length: 40 }, (_, i) => candidate(i));
  const lexical = Array.from({ length: 40 }, (_, i) => candidate(i + 40));
  const additions = Array.from({ length: 40 }, (_, i) => candidate(i + 80));
  const fused = fuseCandidates({ vector: vectorList, lexical }, [additions, additions, additions]);
  expect(fused).toHaveLength(40);
  for (const item of [...vectorList.slice(0, 8), ...lexical.slice(0, 8)]) {
    expect(fused.some((value) => value.chunk.passageId === item.chunk.passageId)).toBe(true);
  }
  const weighted = fuseCandidates({ vector: [candidate(1)], lexical: [] }, [[candidate(2)]]);
  expect(weighted.map((item) => item.chunk.passageId)).toEqual(['passage-1', 'passage-2']);
  expect(weighted[0]!.score).toBeCloseTo(2 / 61);
  expect(weighted[1]!.score).toBeCloseTo(1 / 61);
});
