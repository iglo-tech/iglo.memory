import { expect, test } from 'bun:test';
import { excerpt } from '@/src/presentation';
import { buildLexical, tokenize, tokenOccurrences } from '@/src/lexical';
import { profileFor, type Snapshot, type StoredChunk } from '@/src/store';

function fixture(body: string, prefix = '', otherBodies: string[] = []) {
  const chunk: StoredChunk = {
    source: 'deleted.md',
    heading: '',
    headings: [],
    start: Array.from(prefix).length,
    end: Array.from(prefix + body).length,
    startLine: 1,
    endLine: 1,
    text: body,
    chunkHash: '',
    passageId: 'target',
    vector: '',
    vectorHash: '',
  };
  const sourceText = Array.from(prefix + body);
  const snapshot: Snapshot = {
    schemaVersion: 2,
    project: 'fixture',
    preparedAt: '',
    profile: profileFor('fixture', 2),
    documents: 1,
    chunks: [chunk],
    sources: [
      {
        source: chunk.source,
        sourceHash: '',
        length: sourceText.length,
        lineStarts: [
          0,
          ...sourceText.flatMap((character, index) => (character === '\n' ? [index + 1] : [])),
        ],
        spans: [{ start: chunk.start, end: chunk.end, passageId: chunk.passageId }],
      },
    ],
    lexical: buildLexical([
      chunk,
      ...otherBodies.map((text, index) => ({ ...chunk, text, passageId: `other-${index}` })),
    ]),
  };
  return { chunk, snapshot };
}

test('excerpt finds relevant suffix and owns exact end-exclusive source coordinates', () => {
  const body = '😀 '.repeat(230) + '\nżółw refreshToken';
  const { chunk, snapshot } = fixture(body, '😀 title\n');
  const result = excerpt(snapshot, chunk, 'refreshToken');
  const points = Array.from(body);
  const start = points.length - 400;
  expect(result.snippet).toBe('…' + points.slice(start).join(''));
  expect(result.snippetSpan).toEqual({
    start: chunk.start + start,
    end: chunk.end,
    startLine: 2,
    startColumn: start + 1,
    endLine: 3,
    endColumn: 18,
  });
});

test('body IDF and distinct terms outweigh repeated common terms', () => {
  const body = 'common '.repeat(60) + ' '.repeat(401) + 'rare';
  const { chunk, snapshot } = fixture(body, '', ['common', 'common', 'common']);
  const result = excerpt(snapshot, chunk, 'common common rare');
  expect(result.snippetSpan.start).toBe(body.length - 400);
  expect(result.snippet.endsWith('rare')).toBe(true);
});

test('earliest equal-score window wins and snippet decorations stay outside its span', () => {
  const body = ' '.repeat(500) + 'needle ' + ' '.repeat(600) + 'needle';
  const { chunk, snapshot } = fixture(body);
  const result = excerpt(snapshot, chunk, 'needle');
  expect(result.snippetSpan.start).toBe(106);
  expect(result.snippetSpan.end).toBe(506);
  expect(result.snippet).toBe('…' + body.slice(106, 506) + '…');
});

test('partial lexical tokens never count and identifier aliases do', () => {
  const body = 'foobar ' + ' '.repeat(500) + 'HTTPRefreshToken';
  const { chunk, snapshot } = fixture(body);
  expect(excerpt(snapshot, chunk, 'foo').snippetSpan.start).toBe(0);
  const result = excerpt(snapshot, chunk, 'refresh');
  const end = body.indexOf('Refresh') + 'Refresh'.length;
  expect(result.snippetSpan.end).toBe(end);
  expect(result.snippet).toBe('…' + body.slice(end - 400, end) + '…');
  const long = fixture('x'.repeat(401) + ' ' + ' '.repeat(500));
  expect(excerpt(long.snapshot, long.chunk, 'x'.repeat(401)).snippetSpan.start).toBe(0);
});

test('no-match, punctuation-only, empty bodies and short bodies use earliest window', () => {
  for (const body of ['', '😀 żółw\n', '😀'.repeat(500)]) {
    const { chunk, snapshot } = fixture(body);
    for (const query of ['', '?!', 'absent']) {
      const result = excerpt(snapshot, chunk, query);
      expect(result.snippetSpan.start).toBe(0);
      expect(result.snippetSpan.end).toBe(Math.min(400, Array.from(body).length));
      expect(result.snippet).toBe(
        Array.from(body).slice(0, 400).join('') + (Array.from(body).length > 400 ? '…' : ''),
      );
    }
  }
});

test('occurrence aliases preserve tokenizer vocabulary and exact Unicode source ranges', () => {
  for (const token of [
    'HTTPServer',
    'refresh_token',
    'a.b/c:d@e-f',
    'FooFoo',
    '𐐀Test',
    'İConfig',
    'UTF-8',
    '1e-3',
  ]) {
    const text = '😀 ' + token + ' 😀';
    const occurrences = tokenOccurrences(text);
    expect(new Set(occurrences.map((item) => item.term))).toEqual(new Set(tokenize(text)));
    for (const item of occurrences)
      expect(Array.from(text).slice(item.start, item.end).join('').toLowerCase()).toBe(item.term);
  }
  expect(tokenOccurrences('FooFoo').filter((item) => item.term === 'foo')).toEqual([
    { term: 'foo', start: 0, end: 3 },
    { term: 'foo', start: 3, end: 6 },
  ]);
});
