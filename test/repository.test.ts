import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveWorktree } from '../src/repository';
import { readConfig, validateConfig } from '../src/config';

const fixtures: string[] = [];
function fixture() { const path = mkdtempSync('/tmp/iglo-t01-'); fixtures.push(path); return path; }
function admin(path: string) {
  mkdirSync(join(path, 'objects'), { recursive: true });
  mkdirSync(join(path, 'refs'));
  writeFileSync(join(path, 'HEAD'), 'ref: refs/heads/main\n');
}
function repo() { const root = fixture(); admin(join(root, '.git')); return root; }
afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }); });

test('physical nested cwd resolves the nearest normal worktree', () => {
  const root = repo(); const nested = join(root, 'a', 'b'); mkdirSync(nested, { recursive: true });
  expect(resolveWorktree(nested)).toBe(root);
  admin(join(root, 'a', '.git'));
  expect(resolveWorktree(nested)).toBe(join(root, 'a'));
  const alias = join(fixture(), 'alias'); symlinkSync(nested, alias);
  expect(resolveWorktree(alias)).toBe(join(root, 'a'));
});

test('relative linked gitfile uses worktree root, not common administration', () => {
  const root = repo(); const linked = join(root, 'linked'); mkdirSync(linked);
  const metadata = join(root, '.git', 'worktrees', 'linked'); mkdirSync(metadata, { recursive: true });
  writeFileSync(join(metadata, 'HEAD'), 'ref: refs/heads/topic\n');
  writeFileSync(join(metadata, 'commondir'), '../..\n');
  writeFileSync(join(linked, '.git'), 'gitdir: ../.git/worktrees/linked\n');
  expect(resolveWorktree(linked)).toBe(linked);
});

test('malformed nearest markers never fall through to enclosing repository', () => {
  for (const text of ['', 'gitdir: \n', 'gitdir: /missing\n', 'gitdir: foo\nextra']) {
    const root = repo(); const nested = join(root, 'child'); mkdirSync(nested);
    writeFileSync(join(nested, '.git'), text);
    expect(() => resolveWorktree(nested)).toThrow('valid Git worktree');
  }
});

test('bare, absent, malformed and symlink markers fail', () => {
  const enclosing = repo(); const bare = join(enclosing, 'bare'); admin(bare); expect(() => resolveWorktree(bare)).toThrow();
  expect(() => resolveWorktree(fixture())).toThrow();
  const root = repo(); writeFileSync(join(root, '.git', 'HEAD'), 'invalid'); expect(() => resolveWorktree(root)).toThrow();
  const linked = fixture(); symlinkSync(join(root, '.git'), join(linked, '.git')); expect(() => resolveWorktree(linked)).toThrow();
});

test('configuration read preserves bytes and ignores unsupported fields', () => {
  const root = repo(); mkdirSync(join(root, '.agent'));
  const path = join(root, '.agent', 'memory.json');
  const bytes = '{ "project": "custom", "embedding": {"model":"custom/model"}, "future": true }\n';
  writeFileSync(path, bytes);
  expect(readConfig(root)).toEqual({ project: 'custom', embedding: { model: 'custom/model' } });
  expect(readFileSync(path, 'utf8')).toBe(bytes);
});

test('invalid configuration values fail', () => {
  for (const value of [null, [], {}, { project: 'p' }, { project: ' ', embedding: { model: 'm' } }, { project: 'p\ninjected', embedding: { model: 'm' } }, { project: 'p', embedding: { model: '' } }, { project: 'p', embedding: { model: 'm\0' } }]) {
    expect(() => validateConfig(value)).toThrow('configuration');
  }
});

test('missing, malformed and static symlink configuration paths fail', () => {
  const root = repo(); expect(() => readConfig(root)).toThrow(); mkdirSync(join(root, '.agent'));
  const path = join(root, '.agent', 'memory.json'); writeFileSync(path, '{'); expect(() => readConfig(root)).toThrow();
  rmSync(path); const target = join(fixture(), 'config'); writeFileSync(target, '{"project":"p","embedding":{"model":"m"}}');
  symlinkSync(target, path); expect(() => readConfig(root)).toThrow();
  rmSync(join(root, '.agent'), { recursive: true }); symlinkSync(fixture(), join(root, '.agent')); expect(() => readConfig(root)).toThrow();
});

test('ordinary source folders with administrative-looking names remain inside the worktree', () => {
  const root = repo(); const source = join(root, 'fixtures'); admin(source);
  writeFileSync(join(source, 'HEAD'), 'ordinary source text');
  expect(resolveWorktree(source)).toBe(root);
});

test('HEAD reference grammar rejects malformed names and preserves valid detached heads', () => {
  const root = repo(); const path = join(root, '.git', 'HEAD');
  for (const name of ['bad..name', '.hidden', 'topic.lock', 'bad@{name', 'bad/name.', 'bad//name', 'bad name', 'bad~name', 'bad^name', 'bad:name', 'bad?name', 'bad*name', 'bad[name', 'bad\\name', 'bad\x7fname']) {
    writeFileSync(path, `ref: refs/heads/${name}\n`);
    expect(() => resolveWorktree(root)).toThrow();
  }
  for (const head of ['a'.repeat(40), 'b'.repeat(64), 'ref: refs/heads/topic/subtopic']) {
    writeFileSync(path, head + '\n'); expect(resolveWorktree(root)).toBe(root);
  }
});
