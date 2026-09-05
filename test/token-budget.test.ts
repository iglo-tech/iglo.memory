import { expect, test } from 'bun:test';
import { budgetFor, voyageTokens } from '@/src/token-budget';

test('pinned Qwen EOS and derived Voyage counts preserve literal inputs', () => {
  const budget = budgetFor();
  expect(voyageTokens('Zażółć gęślą jaźń')).toBe(11);
  for (const text of [
    'Hello World',
    'Zażółć gęślą jaźń',
    'é e\u0301 漢字 😀',
    '<|endoftext|>',
    '```ts\nBun.spawn([]);\n```',
  ]) {
    expect(budget.count(text)).toBe(voyageTokens(text) + 1);
  }
  expect(() => budget.count('\ud800')).toThrow();
});

test('complete input limits and batch caps never clip or omit inputs', () => {
  const budget = budgetFor();
  const input = ' a'.repeat(8191);
  expect(budget.count(input)).toBe(8192);
  expect(budget.batches(Array(5).fill(input)).map((batch) => batch.length)).toEqual([4, 1]);
  expect(() => budget.batches([input + ' a'])).toThrow();
  expect(budget.batches(Array(33).fill('hello')).map((batch) => batch.length)).toEqual([32, 1]);
  expect(budget.batches([])).toEqual([]);
  expect(() => budget.batches([''])).toThrow();
  expect(budgetFor('custom/model').batches(['one', 'two'])).toEqual([['one'], ['two']]);
  expect(budgetFor('custom/model').count('😀')).toBe(4);
});

test('bounded context, original query and complete Voyage document envelope', () => {
  const budget = budgetFor();
  const prefix = budget.context('project'.repeat(2000), 'path/'.repeat(2000) + 'file.md', [
    'heading'.repeat(2000),
  ]);
  expect(budget.count(prefix)).toBeLessThanOrEqual(256);
  expect(prefix).toContain('context-sha256:');
  expect(prefix).toContain('file.md');
  expect(prefix).toBe(
    budget.context('project'.repeat(2000), 'path/'.repeat(2000) + 'file.md', [
      'heading'.repeat(2000),
    ]),
  );
  const question = '  Kto ma dostęp do użytkownika? e\u0301';
  expect(budget.formatQuery(question)).toEndWith('Query: ' + question);
  expect(() => budget.formatQuery(' a'.repeat(2049))).toThrow();
  expect(budget.fitsDocument('', ' a'.repeat(4096))).toBe(true);
  expect(budget.fitsDocument('', ' a'.repeat(4097))).toBe(false);
  expect(budgetFor('openai/text-embedding-3-small').count('<|endoftext|>')).toBeGreaterThan(1);
});

test('known OpenAI models retain the verified 64-input batch contract', () => {
  expect(
    budgetFor('openai/text-embedding-3-small')
      .batches(Array(65).fill('hello'))
      .map((batch) => batch.length),
  ).toEqual([64, 1]);
});
