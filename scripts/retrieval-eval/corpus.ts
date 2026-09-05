import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export const hash = (data: string | Uint8Array) =>
  new Bun.CryptoHasher('sha256').update(data).digest('hex');
export const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
export const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected object');
  return value as Record<string, unknown>;
}
export function safePath(path: string) {
  check(
    path.length > 0 &&
      !path.includes('\\') &&
      !path.includes('\0') &&
      path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'Unsafe path',
  );
  return path;
}
export type SourceFile = {
  original: string;
  mapped: string;
  originalHash: string;
  normalizedHash: string;
  bytes: number;
};
export type Collection = {
  id: string;
  url: string;
  commit: string;
  license: { status: string; files: { path: string; hash: string }[] };
  files: SourceFile[];
};
export type Corpus = { version: 1; projects: Collection[] };
export async function git(cwd: string, args: string[]): Promise<Uint8Array> {
  const proc = Bun.spawn(['git', '-C', cwd, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).bytes(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  check(code === 0, `Git failed (${code}): ${err}`);
  return out;
}
export function parseCorpus(value: unknown): Corpus {
  const root = object(value);
  check(
    root.version === 1 && Array.isArray(root.projects) && root.projects.length >= 3,
    'Corpus needs three projects',
  );
  const ids = new Set<string>();
  for (const item of root.projects) {
    const p = object(item);
    check(
      typeof p.id === 'string' && /^[a-z0-9-]+$/.test(p.id) && !ids.has(p.id),
      'Invalid project ID',
    );
    ids.add(p.id);
    check(
      typeof p.url === 'string' && /^https:\/\/github.com\/[\w.-]+\/[\w.-]+$/.test(p.url),
      'Invalid upstream',
    );
    check(typeof p.commit === 'string' && /^[a-f0-9]{40}$/.test(p.commit), 'Unpinned commit');
    const license = object(p.license);
    check(
      typeof license.status === 'string' && Array.isArray(license.files),
      'Missing license status',
    );
    for (const item of license.files) {
      const notice = object(item);
      check(
        typeof notice.path === 'string' &&
          typeof notice.hash === 'string' &&
          /^[a-f0-9]{64}$/.test(notice.hash),
        'Invalid notice',
      );
      safePath(notice.path);
    }
    check(Array.isArray(p.files) && p.files.length > 0, 'Empty collection');
    const paths = new Set<string>();
    for (const item of p.files) {
      const f = object(item);
      check(typeof f.original === 'string' && typeof f.mapped === 'string', 'Missing paths');
      safePath(f.original);
      safePath(f.mapped);
      check(
        f.mapped === `.agent/knowledge/${f.original}` &&
          f.original.endsWith('.md') &&
          !paths.has(f.mapped),
        'Invalid or duplicate mapping',
      );
      paths.add(f.mapped);
      check(
        typeof f.originalHash === 'string' &&
          /^[a-f0-9]{64}$/.test(f.originalHash) &&
          typeof f.normalizedHash === 'string' &&
          /^[a-f0-9]{64}$/.test(f.normalizedHash),
        'Invalid digest',
      );
      check(Number.isSafeInteger(f.bytes) && Number(f.bytes) > 0, 'Invalid size');
    }
  }
  return value as Corpus;
}
export async function validateSources(corpus: Corpus, root: string) {
  const sources = new Map<string, string>();
  for (const project of corpus.projects) {
    for (const file of project.files) {
      const bytes = await Bun.file(join(root, project.id, file.mapped)).bytes();
      check(hash(bytes) === file.normalizedHash, `Corpus mismatch: ${project.id}/${file.mapped}`);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      check(normalize(text) === text, 'Corpus is not LF normalized');
      sources.set(`${project.id}/${file.mapped}`, text);
    }
  }
  return sources;
}
// Fetches only committed blobs. Worktree modifications never enter the corpus.
export async function materialize(
  corpus: Corpus,
  checkouts: Record<string, string>,
  destination: string,
) {
  const pending: { path: string; bytes: Uint8Array | string }[] = [];
  for (const project of corpus.projects) {
    const checkout = checkouts[project.id];
    check(checkout, `Missing checkout: ${project.id}`);
    for (const notice of project.license.files) {
      const bytes = await git(checkout, ['show', `${project.commit}:${notice.path}`]);
      check(hash(bytes) === notice.hash, 'License mismatch');
      pending.push({ path: join(destination, project.id, 'notices', notice.path), bytes });
    }
    for (const file of project.files) {
      const original = await git(checkout, ['show', `${project.commit}:${file.original}`]);
      check(
        hash(original) === file.originalHash && original.length === file.bytes,
        'Original mismatch',
      );
      const text = normalize(new TextDecoder('utf-8', { fatal: true }).decode(original));
      check(hash(text) === file.normalizedHash, 'Normalized mismatch');
      pending.push({ path: join(destination, project.id, file.mapped), bytes: text });
    }
  }
  // An existing destination is never overwritten (including partial imports).
  await mkdir(resolve(destination));
  for (const entry of pending) await Bun.write(entry.path, entry.bytes);
  return validateSources(corpus, destination);
}
