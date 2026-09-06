import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { chunkMarkdown, chunkSource, formattedInput, scanSources, sha256 } from '@/src/chunks';
import { budgetFor } from '@/src/token-budget';
import { fixture, cleanup } from '@/test/helpers';
afterEach(cleanup);

test('Bun SHA-256 preserves existing string and binary cache identities', () => {
  const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  expect(sha256('abc')).toBe(expected);
  expect(sha256(new TextEncoder().encode('abc'))).toBe(expected);
});

test('fixed roots, exclusions, deterministic paths and source symlink rejection', () => {
  const root = fixture();
  mkdirSync(join(root, '.agent/knowledge'), { recursive: true });
  mkdirSync(join(root, '.agent/inbox'));
  writeFileSync(join(root, '.agent/knowledge/a.md'), 'hello');
  writeFileSync(join(root, '.agent/inbox/ignored.md'), 'ignored');
  mkdirSync(join(root, '.agent/knowledge/node_modules'));
  writeFileSync(join(root, '.agent/knowledge/node_modules/ignored.md'), 'ignored');
  expect(scanSources(root, 'p').documents).toBe(1);
  mkdirSync(join(root, '.agent/knowledge/inbox'));
  writeFileSync(join(root, '.agent/knowledge/inbox/valid.md'), 'canonical nested content');
  expect(scanSources(root, 'p').documents).toBe(2);
  symlinkSync(join(root, '.agent/inbox/ignored.md'), join(root, '.agent/knowledge/escape.md'));
  expect(() => scanSources(root, 'p')).toThrow('Markdown sources');
});

function reconstruct(markdown: string, model?: string) {
  const result = chunkSource('p', '.agent/knowledge/a.md', markdown, model);
  const byId = new Map(result.chunks.map((chunk) => [chunk.passageId, chunk]));
  let position = 0;
  const text = result.document.spans
    .map((span) => {
      expect(span.start).toBe(position);
      const body = 'text' in span ? span.text : byId.get(span.passageId)!.text;
      expect(Array.from(body).length).toBe(span.end - span.start);
      position = span.end;
      return body;
    })
    .join('');
  expect(text).toBe(markdown.replace(/\r\n?/g, '\n'));
  expect(position).toBe(result.document.length);
  expect(result.document.sourceHash).toBe('sha256:' + sha256(text));
  for (const chunk of result.chunks)
    expect(budgetFor(model).fitsDocument('', formattedInput('p', chunk, model))).toBe(true);
  return result;
}

test('lossless Unicode, headings, empty sections and whitespace coverage', () => {
  const input =
    '\r\npreamble e\u0301 😀\r\n\r\nTitle\r\n=====\r\nbody\r\n\r\n## Child\r\ntext\r\n\r\n## Empty\r\n';
  const { chunks } = reconstruct(input);
  expect(chunks.map((chunk) => chunk.headings)).toEqual([
    [],
    ['Title'],
    ['Title', 'Child'],
    ['Title', 'Empty'],
  ]);
  expect(chunks[1]!.text).toStartWith('Title\n=====');
  expect(chunks[3]!.text).toContain('## Empty');
  expect(chunkSource('p', 'a', '').document).toMatchObject({
    length: 0,
    spans: [],
    lineStarts: [0],
  });
  expect(reconstruct(' \n\t\n').chunks).toEqual([]);
  expect(() => chunkMarkdown('p', 'a', '\ud800')).toThrow();
});

test('code blocks stay intact when fitting and split losslessly under hard caps', () => {
  const code = '```ts\n# not a heading\n\n' + 'let x = 1;\n'.repeat(120) + '```\n';
  const fitting = reconstruct('# Setup\n\n' + code + '\n    # indented\n\n    more\n');
  expect(fitting.chunks.some((chunk) => chunk.text.includes(code))).toBe(true);
  expect(fitting.chunks.every((chunk) => chunk.heading === 'Setup')).toBe(true);
  const giant = reconstruct('# Setup\n\n```\n' + '界😀e\u0301 '.repeat(4000) + '\n```\n');
  expect(giant.chunks.length).toBeGreaterThan(3);
  expect(giant.chunks.every((chunk) => chunk.heading === 'Setup')).toBe(true);
  reconstruct('😀'.repeat(1500), 'custom/model');
});

test('offset identity differs from reusable input identity and NFC stays literal', () => {
  const a = chunkMarkdown('p', 'a', '# H\n\nbody e\u0301\n');
  const b = chunkMarkdown('p', 'a', '\n# H\n\nbody e\u0301\n');
  expect(a[0]!.chunkHash).toBe(b[0]!.chunkHash);
  expect(a[0]!.passageId).not.toBe(b[0]!.passageId);
  expect(a[0]!.text).toContain('e\u0301');
  expect(a[0]!.chunkHash).not.toBe(chunkMarkdown('p', 'b', '# H\n\nbody e\u0301\n')[0]!.chunkHash);
});

test('ordinary paragraphs use the soft target even when the whole body fits hard caps', () => {
  const { chunks } = reconstruct(' documentation'.repeat(1800));
  expect(chunks.length).toBeGreaterThan(3);
  expect(chunks.every((chunk) => budgetFor().count(chunk.text) <= 500)).toBe(true);
});
