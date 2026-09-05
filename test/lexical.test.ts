import { describe, expect, test } from 'bun:test';
import type { Chunk } from '@/src/chunks';
import { buildLexical, scoreLexical, tokenize, validateLexical } from '@/src/lexical';

function chunk(passageId: string, text: string, source = '', headings: string[] = []): Chunk {
  return {
    passageId,
    text,
    source,
    headings,
    heading: headings.at(-1) ?? '',
    start: 0,
    end: text.length,
    startLine: 1,
    endLine: 1,
    chunkHash: passageId,
  };
}

describe('prepared BM25', () => {
  test('hand-calculated rare term, document lengths, unique queries and zero matches', () => {
    const chunks = [
      chunk('a', 'rare common common'),
      chunk('b', 'common'),
      chunk('c', 'other other'),
    ];
    const index = validateLexical(JSON.parse(JSON.stringify(buildLexical(chunks))), chunks);
    // N=3, df(rare)=1, length(a)=3, average=2, tf=1.
    const expected = (Math.log(1 + 2.5 / 1.5) * 2.2) / (1 + 1.2 * (0.25 + (0.75 * 3) / 2));
    expect(scoreLexical(index, 'rare').map((item) => item.passageId)).toEqual(['a']);
    expect(scoreLexical(index, 'rare')[0]!.score).toBeCloseTo(expected, 12);
    expect(scoreLexical(index, 'rare rare')).toEqual(scoreLexical(index, 'rare'));
    expect(scoreLexical(index, 'absent')).toEqual([]);
    expect(scoreLexical(index, 'rare')[0]!.score).toBeGreaterThan(
      scoreLexical(index, 'common').find((item) => item.passageId === 'a')!.score,
    );
  });

  test('field weights and empty fields use all passages in N', () => {
    const chunks = [
      chunk('body', 'target'),
      chunk('heading', '', '', ['target']),
      chunk('path', '', 'target'),
    ];
    const scores = scoreLexical(buildLexical(chunks), 'target');
    expect(scores.map((item) => item.passageId)).toEqual(['heading', 'path', 'body']);
    expect(scores[0]!.score).toBeCloseTo(scores[2]!.score * 2, 12);
    expect(scoreLexical(buildLexical([]), 'target')).toEqual([]);
  });

  test('identifier aliases are unique per occurrence with Unicode casing', () => {
    expect(
      tokenize('API_KEY_MISSING readSnapshot HTTPServer .agent/knowledge/auth.md E_AUTH_403'),
    ).toEqual([
      'api_key_missing',
      'api',
      'key',
      'missing',
      'readsnapshot',
      'read',
      'snapshot',
      'httpserver',
      'http',
      'server',
      'agent/knowledge/auth.md',
      'agent',
      'knowledge',
      'auth',
      'md',
      'e_auth_403',
      'e',
      'auth',
      '403',
    ]);
    expect(tokenize('foo_foo foo_foo Łódź ŻółtySerwer HTTPŻądanie')).toEqual([
      'foo_foo',
      'foo',
      'foo_foo',
      'foo',
      'łódź',
      'żółtyserwer',
      'żółty',
      'serwer',
      'httpżądanie',
      'http',
      'żądanie',
    ]);
  });

  test('hostile object keys survive serialization without prototype reads', () => {
    const chunks = [
      chunk('__proto__', 'constructor prototype toString'),
      chunk('constructor', 'other'),
    ];
    const index = validateLexical(JSON.parse(JSON.stringify(buildLexical(chunks))), chunks);
    expect(scoreLexical(index, 'constructor').map((item) => item.passageId)).toEqual(['__proto__']);
    expect(scoreLexical(index, 'valueOf')).toEqual([]);
  });

  test('prepared validation needs no source body tokenization', () => {
    const chunks = [chunk('a', 'test')];
    const index = buildLexical(chunks);
    Object.defineProperty(chunks[0], 'text', {
      get() {
        throw new Error('body read');
      },
    });
    expect(validateLexical(index, chunks)).toBe(index);
    expect(scoreLexical(index, 'test')).toHaveLength(1);
  });

  test('rejects inconsistent persisted statistics and postings', () => {
    const chunks = [chunk('a', 'rare rare'), chunk('b', 'common')];
    const mutations: ((value: ReturnType<typeof buildLexical>) => void)[] = [
      (value) => {
        value.count++;
      },
      (value) => {
        value.fields.body.totalLength++;
      },
      (value) => {
        value.fields.body.lengths.a = 1;
      },
      (value) => {
        value.fields.body.terms.rare!.df = 2;
      },
      (value) => {
        value.fields.body.terms.rare!.postings[0]![1] = 0;
      },
      (value) => {
        value.fields.body.terms.rare!.postings[0]![1] = 1.5;
      },
      (value) => {
        value.fields.body.terms.rare!.postings[0]![0] = 'unknown';
      },
      (value) => {
        value.fields.body.terms.rare!.df = 2;
        value.fields.body.terms.rare!.postings.push(['a', 2]);
      },
      (value) => {
        delete value.fields.body.lengths.b;
      },
      (value) => {
        value.fields.body.lengths.extra = 0;
      },
      (value) => {
        value.fields.body.terms.rare!.postings[0]![1] = Number.MAX_SAFE_INTEGER;
      },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(buildLexical(chunks));
      mutate(value);
      expect(() => validateLexical(value, chunks)).toThrow('The prepared index is invalid');
    }
  });
});
