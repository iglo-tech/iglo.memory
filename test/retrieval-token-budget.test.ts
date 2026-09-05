import { test, expect } from 'bun:test';
import {
  embeddingTokens,
  serializedChatTokens,
  boundedContext,
  splitWrapped,
} from '@/scripts/retrieval-eval/token-budget';

test('exact embedding counts include Unicode and literal tokenizer control strings', () => {
  expect(embeddingTokens('hello world')).toBe(2);
  expect(embeddingTokens('é e\u0301 漢字 😀')).toBe(8);
  expect(embeddingTokens('<|endoftext|> is literal documentation')).toBe(10);
  expect(embeddingTokens(' a'.repeat(8192))).toBe(8192);
  expect(() => embeddingTokens('\ud800')).toThrow('Unicode');
  expect(serializedChatTokens({ question: 'hello world' })).toBeGreaterThan(2);
});
test('bounded context preserves full identity and limits huge metadata deterministically', () => {
  const small = boundedContext('p', 'a.md', ['Heading']);
  expect(small.shortened).toBe(false);
  expect(small.prefix).toBe('Context: ["p","a.md","Heading"]\n\n');
  const args = ['project', 'path/'.repeat(2000) + 'last.md', ['Heading '.repeat(3000)]] as const;
  const a = boundedContext(args[0], args[1], [...args[2]], 128);
  expect(a.shortened).toBe(true);
  expect(embeddingTokens(a.prefix)).toBeLessThanOrEqual(128);
  expect(a.prefix).toContain(a.fullContextHash);
  expect(a).toEqual(boundedContext(args[0], args[1], [...args[2]], 128));
  expect(() => boundedContext(args[0], args[1], [...args[2]], 1)).toThrow('digest');
});
test('wrapped split preserves every code point, fence and separator under exact budgets', () => {
  const cases = [
    '😀 漢字 e\u0301\n'.repeat(20),
    '```ts\n' + 'const value = "a_b";\n'.repeat(40) + '```\n',
    'no-break-'.repeat(500),
    ' \n\t'.repeat(80),
    '<|endoftext|>'.repeat(30),
  ];
  const prefix = boundedContext('p', 'source.md', ['Heading']).prefix;
  for (const text of cases) {
    const spans = splitWrapped(text, prefix, 40);
    expect(spans.map((s) => s.text).join('')).toBe(text);
    let end = 0;
    for (const s of spans) {
      expect(s.start).toBe(end);
      end = s.end;
      expect(s.text).toBe(Array.from(text).slice(s.start, s.end).join(''));
      expect(embeddingTokens(prefix + s.text)).toBeLessThanOrEqual(40);
    }
    expect(end).toBe(Array.from(text).length);
  }
  expect(splitWrapped('', prefix, 40)).toEqual([]);
  expect(() => splitWrapped('body', prefix, 1)).toThrow('Wrapper');
  expect(() => splitWrapped('😀', '', 1)).toThrow('Minimum');
});

test('nonmonotone BPE prefixes and whitespace joins never reject fitting text', () => {
  const prefix = boundedContext('p', 'a', []).prefix;
  expect(embeddingTokens(prefix + '删除')).toBe(8);
  expect(
    splitWrapped('删除', prefix, 8)
      .map((s) => s.text)
      .join(''),
  ).toBe('删除');
  for (const text of ['删除', ' 🙂', '删除'.repeat(30), ' 🙂'.repeat(30)]) {
    const spans = splitWrapped(text, '', 1);
    expect(spans.map((s) => s.text).join('')).toBe(text);
    expect(spans.every((s) => embeddingTokens(s.text) <= 1)).toBe(true);
  }
});
