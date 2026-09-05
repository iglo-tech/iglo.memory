import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { chunkMarkdown, scanSources, sha256 } from '@/src/chunks';
import { fixture, cleanup } from '@/test/helpers';
afterEach(cleanup);

test('Bun SHA-256 preserves existing string and binary cache identities', () => {
  const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  expect(sha256('abc')).toBe(expected);
  expect(sha256(new TextEncoder().encode('abc'))).toBe(expected);
});

test('all lengths share the same block pipeline with intact giant blocks and source lines', () => {
  const long = '界'.repeat(18000);
  const code = '```ts\n# not a heading\n' + long + '\n\n```';
  const text = '# Setup\r\nfirst paragraph\r\n\r\n' + code + '\r\n\r\nlast paragraph\r\n';
  const chunks = chunkMarkdown('p', '.agent/knowledge/test.md', text);
  expect(chunks).toHaveLength(3);
  expect(chunks[1]!.text).toBe(code);
  expect(chunks[1]!.heading).toBe('Setup');
  expect(chunks[0]!.startLine).toBe(2);
  expect(chunks[1]!.startLine).toBe(4);
  expect(chunks[1]!.endLine).toBe(8);
  expect(chunks.map((c) => c.text).join('\n\n')).toContain(long);
  expect(chunks).toEqual(
    chunkMarkdown('p', '.agent/knowledge/test.md', text.replace(/\r\n/g, '\n')),
  );
  expect(chunkMarkdown('p', '.agent/knowledge/test.md', long)[0]!.text).toBe(long);
});

test('headings, preamble, fenced/indented code and empty documents', () => {
  expect(chunkMarkdown('p', '.agent/knowledge/a.md', '')).toEqual([]);
  const chunks = chunkMarkdown(
    'p',
    '.agent/knowledge/a.md',
    'preamble\n\nTitle\n=====\nbody\n\n    # code\n\n    more code\n\n## Empty',
  );
  expect(chunks.map((c) => c.heading)).toEqual(['', 'Title']);
  expect(chunks[1]!.text).toContain('    # code\n\n    more code');
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
