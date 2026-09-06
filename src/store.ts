import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { endianness } from 'node:os';
import { DEFAULT_MODEL, type Config } from '@/src/config';
import { CHUNKER, formattedInput, sha256, type Chunk, type SourceDocument } from '@/src/chunks';
import { budgetFor, DOCUMENT_FORMAT } from '@/src/token-budget';
import { validateLexical, type LexicalIndex } from '@/src/lexical';
import { BASE_URL } from '@/src/embedding';
import { AppError } from '@/src/errors';
import { atomicWrite, directory, exists, missing, readBytes, record } from '@/src/files';

export type Profile = {
  profile: string;
  baseUrl: string;
  model: string;
  dimensions: number | null;
  encodingFormat: 'float';
  chunker: string;
  inputFormatting: string;
  normalization: string;
  tokenizer: string;
  queryFormatting: string;
};
export type StoredChunk = Chunk & { vector: string; vectorHash: string };
export type Snapshot = {
  schemaVersion: 2;
  project: string;
  preparedAt: string;
  profile: Profile;
  documents: number;
  chunks: StoredChunk[];
  sources: SourceDocument[];
  lexical: LexicalIndex;
};
export type Receipt = {
  schemaVersion?: 2;
  profile: Profile;
  chunkHash: string;
  vector: string;
  vectorHash: string;
};
export const indexPath = (root: string) => join(root, '.agent', 'memory-index');
export const vectorName = (profile: Profile, hash: string) =>
  `sha256-${sha256(JSON.stringify([profile.profile, CHUNKER, hash]))}.f32`;
const digest = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v);
const whole = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function profileFor(model: string, dimensions: number | null): Profile {
  const p = {
    baseUrl: BASE_URL,
    model,
    dimensions,
    encodingFormat: 'float' as const,
    chunker: CHUNKER,
    inputFormatting: DOCUMENT_FORMAT,
    tokenizer: budgetFor(model).tokenizerVersion,
    queryFormatting: budgetFor(model).queryFormatVersion,
    normalization: 'lf-v1',
  };
  return {
    ...p,
    profile:
      'sha256:' +
      sha256(
        JSON.stringify([
          p.baseUrl,
          p.model,
          p.dimensions,
          p.encodingFormat,
          p.inputFormatting,
          p.chunker,
          p.normalization,
          p.tokenizer,
          p.queryFormatting,
        ]),
      ),
  };
}
function parseProfile(v: unknown, config: Config): Profile {
  if (
    !record(v) ||
    typeof v.model !== 'string' ||
    !digest(v.profile) ||
    !(v.dimensions === null || (whole(v.dimensions) && v.dimensions > 0))
  )
    throw new AppError('INDEX_INVALID');
  if (config.embedding.model === DEFAULT_MODEL && v.dimensions !== null && v.dimensions !== 4096)
    throw new AppError('INDEX_INVALID');
  const expected = profileFor(config.embedding.model, v.dimensions as number | null);
  for (const key of [
    'baseUrl',
    'model',
    'encodingFormat',
    'chunker',
    'inputFormatting',
    'normalization',
    'tokenizer',
    'queryFormatting',
  ] as const) {
    if (v[key] !== expected[key]) throw new AppError('INDEX_INCOMPATIBLE');
  }
  if (v.profile !== expected.profile) throw new AppError('INDEX_INVALID');
  return expected;
}
function safeSource(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.isWellFormed() &&
    /^\.agent\/(knowledge|decisions)\/.+\.md$/.test(v) &&
    // oxlint-disable-next-line no-control-regex -- Persisted paths cannot contain NUL bytes.
    !/[\\\x00]/.test(v) &&
    v.split('/').every((x) => x !== '..' && x !== '.' && x !== '')
  );
}
function parseReceipt(v: unknown, config: Config): Receipt {
  if (!record(v) || v.schemaVersion !== 2 || !digest(v.chunkHash) || !digest(v.vectorHash))
    throw new AppError('INDEX_INVALID');
  const profile = parseProfile(v.profile, config);
  if (profile.dimensions === null || v.vector !== vectorName(profile, v.chunkHash))
    throw new AppError('INDEX_INVALID');
  return {
    schemaVersion: 2,
    profile,
    chunkHash: v.chunkHash,
    vector: v.vector as string,
    vectorHash: v.vectorHash,
  };
}
function cleanText(value: unknown): value is string {
  return typeof value === 'string' && value.isWellFormed() && !value.includes('\r');
}
function headingText(value: unknown): value is string {
  return cleanText(value) && !value.includes('\n') && !value.includes('\0');
}
export function sourcePosition(source: SourceDocument, offset: number) {
  let low = 0,
    high = source.lineStarts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (source.lineStarts[middle]! <= offset) low = middle;
    else high = middle;
  }
  return { line: low + 1, column: offset - source.lineStarts[low]! + 1 };
}
function parseSources(value: unknown, chunks: StoredChunk[], count: number): SourceDocument[] {
  if (!Array.isArray(value) || value.length !== count) throw new AppError('INDEX_INVALID');
  const passages = new Map(chunks.map((chunk) => [chunk.passageId, chunk]));
  const used = new Set<string>(),
    names = new Set<string>();
  const sources: SourceDocument[] = [];
  for (const item of value as unknown[]) {
    if (
      !record(item) ||
      !safeSource(item.source) ||
      names.has(item.source) ||
      !digest(item.sourceHash) ||
      !whole(item.length) ||
      !Array.isArray(item.lineStarts) ||
      !Array.isArray(item.spans)
    )
      throw new AppError('INDEX_INVALID');
    names.add(item.source);
    const spans: SourceDocument['spans'] = [];
    const parts: string[] = [];
    let offset = 0;
    for (const span of item.spans as unknown[]) {
      if (
        !record(span) ||
        !whole(span.start) ||
        !whole(span.end) ||
        span.start !== offset ||
        span.end <= span.start ||
        span.end > item.length
      )
        throw new AppError('INDEX_INVALID');
      let text: string;
      if (Object.hasOwn(span, 'passageId')) {
        if (!digest(span.passageId) || Object.hasOwn(span, 'text') || used.has(span.passageId))
          throw new AppError('INDEX_INVALID');
        const passage = passages.get(span.passageId);
        if (
          !passage ||
          passage.source !== item.source ||
          passage.start !== span.start ||
          passage.end !== span.end
        )
          throw new AppError('INDEX_INVALID');
        used.add(span.passageId);
        text = passage.text;
        spans.push({ start: span.start, end: span.end, passageId: span.passageId });
      } else {
        if (
          !cleanText(span.text) ||
          span.text.trim() ||
          Array.from(span.text).length !== span.end - span.start
        )
          throw new AppError('INDEX_INVALID');
        text = span.text;
        spans.push({ start: span.start, end: span.end, text });
      }
      parts.push(text);
      offset = span.end;
    }
    const text = parts.join('');
    if (offset !== item.length || 'sha256:' + sha256(text) !== item.sourceHash)
      throw new AppError('INDEX_INVALID');
    const lineStarts = [0];
    let index = 0;
    for (const char of text) {
      index++;
      if (char === '\n') lineStarts.push(index);
    }
    if (
      item.lineStarts.length !== lineStarts.length ||
      item.lineStarts.some((position: unknown, i: number) => position !== lineStarts[i])
    )
      throw new AppError('INDEX_INVALID');
    const source = {
      source: item.source,
      sourceHash: item.sourceHash,
      length: item.length,
      lineStarts,
      spans,
    };
    for (const span of spans) {
      if (!('passageId' in span)) continue;
      const passage = passages.get(span.passageId)!;
      if (
        passage.startLine !== sourcePosition(source, span.start).line ||
        passage.endLine !== sourcePosition(source, span.end - 1).line
      )
        throw new AppError('INDEX_INVALID');
    }
    sources.push(source);
  }
  if (used.size !== chunks.length) throw new AppError('INDEX_INVALID');
  return sources;
}
export function parseSnapshot(v: unknown, config: Config): Snapshot {
  if (!record(v)) throw new AppError('INDEX_INVALID');
  if (v.schemaVersion !== 2) throw new AppError('INDEX_INCOMPATIBLE');
  if (v.project !== config.project) throw new AppError('INDEX_INCOMPATIBLE');
  if (
    !whole(v.documents) ||
    !Array.isArray(v.chunks) ||
    typeof v.preparedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.preparedAt) ||
    !Number.isFinite(Date.parse(v.preparedAt))
  )
    throw new AppError('INDEX_INVALID');
  const profile = parseProfile(v.profile, config);
  const chunks: StoredChunk[] = [];
  const identities = new Set<string>(),
    vectors = new Map<string, string>();
  for (const item of v.chunks as unknown[]) {
    if (
      !record(item) ||
      !safeSource(item.source) ||
      !headingText(item.heading) ||
      !Array.isArray(item.headings) ||
      !item.headings.every(headingText) ||
      item.heading !== (item.headings.at(-1) ?? '') ||
      !cleanText(item.text) ||
      !item.text.trim() ||
      !whole(item.start) ||
      !whole(item.end) ||
      item.end <= item.start ||
      Array.from(item.text).length !== item.end - item.start ||
      !whole(item.startLine) ||
      item.startLine < 1 ||
      !whole(item.endLine) ||
      item.endLine < item.startLine ||
      !digest(item.chunkHash) ||
      !digest(item.passageId) ||
      !digest(item.vectorHash)
    )
      throw new AppError('INDEX_INVALID');
    const chunk: Chunk = {
      source: item.source,
      heading: item.heading,
      headings: item.headings,
      text: item.text,
      start: item.start,
      end: item.end,
      startLine: item.startLine,
      endLine: item.endLine,
      chunkHash: item.chunkHash,
      passageId: item.passageId,
    };
    if (
      chunk.chunkHash !==
        'sha256:' + sha256(formattedInput(config.project, chunk, config.embedding.model)) ||
      chunk.passageId !==
        'sha256:' +
          sha256(JSON.stringify([chunk.source, chunk.start, chunk.end, sha256(chunk.text)])) ||
      item.vector !== vectorName(profile, chunk.chunkHash) ||
      identities.has(chunk.passageId) ||
      (vectors.has(item.vector as string) && vectors.get(item.vector as string) !== item.vectorHash)
    )
      throw new AppError('INDEX_INVALID');
    identities.add(chunk.passageId);
    vectors.set(item.vector as string, item.vectorHash);
    chunks.push({ ...chunk, vector: item.vector as string, vectorHash: item.vectorHash });
  }
  if (chunks.length && profile.dimensions === null) throw new AppError('INDEX_INVALID');
  const sources = parseSources(v.sources, chunks, v.documents);
  const lexical = validateLexical(v.lexical, chunks);
  return {
    schemaVersion: 2,
    project: config.project,
    preparedAt: v.preparedAt,
    profile,
    documents: v.documents,
    chunks,
    sources,
    lexical,
  };
}
export function readSnapshot(root: string, config: Config): Snapshot {
  try {
    directory(join(root, '.agent'));
    directory(indexPath(root));
    return parseSnapshot(
      JSON.parse(readBytes(join(indexPath(root), 'snapshot.json')).toString('utf8')),
      config,
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (missing(error)) throw new AppError('INDEX_NOT_READY');
    throw new AppError('INDEX_INVALID');
  }
}
export function vectorBytes(vector: number[]): Buffer {
  const bytes = Buffer.alloc(vector.length * 4);
  vector.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes;
}
const littleEndian = endianness() === 'LE';
function readVectorData(root: string, receipt: Receipt): { values: Float32Array; norm: number } {
  try {
    directory(join(indexPath(root), 'vectors'));
    const bytes = readBytes(join(indexPath(root), 'vectors', receipt.vector));
    if (
      bytes.length !== receipt.profile.dimensions! * 4 ||
      'sha256:' + sha256(bytes) !== receipt.vectorHash
    )
      throw new AppError('INDEX_INVALID');
    // Keep the validated binary storage instead of allocating boxed-number
    // arrays and copying them again. Fall back to explicit LE decoding when
    // the platform or buffer alignment cannot support a direct view.
    const direct = littleEndian && bytes.byteOffset % 4 === 0;
    const values = direct
      ? new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4)
      : new Float32Array(bytes.length / 4);
    let nonzero = false;
    let sumSquares = 0;
    for (let i = 0; i < values.length; i++) {
      if (!direct) values[i] = bytes.readFloatLE(i * 4);
      if (!Number.isFinite(values[i]!)) throw new AppError('INDEX_INVALID');
      if (values[i] !== 0) nonzero = true;
      sumSquares += values[i]! * values[i]!;
    }
    if (!nonzero) throw new AppError('INDEX_INVALID');
    return { values, norm: Math.sqrt(sumSquares) };
  } catch (error) {
    if (missing(error)) throw error;
    throw new AppError('INDEX_INVALID');
  }
}
export function readVector(root: string, receipt: Receipt): Float32Array {
  return readVectorData(root, receipt).values;
}
export function loadVectors(root: string, snapshot: Snapshot, allowMissing = false) {
  const vectors = new Map<string, Float32Array>();
  const absent = new Set<string>();
  const norms = new Map<string, number>();
  for (const chunk of snapshot.chunks) {
    if (vectors.has(chunk.vector) || absent.has(chunk.vector)) continue;
    try {
      const loaded = readVectorData(root, { ...chunk, profile: snapshot.profile });
      vectors.set(chunk.vector, loaded.values);
      norms.set(chunk.vector, loaded.norm);
    } catch (error) {
      if (allowMissing && missing(error)) absent.add(chunk.vector);
      else throw new AppError('INDEX_INVALID');
    }
  }
  return { vectors, norms, missingVectors: absent.size };
}
export function ensureIndex(root: string) {
  try {
    directory(join(root, '.agent'));
    directory(indexPath(root), true);
    directory(join(indexPath(root), 'vectors'), true);
  } catch {
    throw new AppError('INDEX_WRITE_FAILED');
  }
}
export function cacheReceipts(root: string, config: Config): Receipt[] {
  const receipts: Receipt[] = [];
  for (const name of readdirSync(join(indexPath(root), 'vectors')).sort()) {
    if (!/^sha256-[a-f0-9]{64}\.f32\.json$/.test(name)) continue;
    try {
      const receipt = parseReceipt(
        JSON.parse(readBytes(join(indexPath(root), 'vectors', name)).toString('utf8')),
        config,
      );
      if (name === receipt.vector + '.json') receipts.push(receipt);
    } catch {
      /* Untrusted cache artifacts are rebuilt, never used as authority. */
    }
  }
  return receipts;
}
export function saveVector(
  root: string,
  profile: Profile,
  chunkHash: string,
  values: number[],
): Receipt {
  const bytes = vectorBytes(values);
  const receipt: Receipt = {
    schemaVersion: 2,
    profile,
    chunkHash,
    vector: vectorName(profile, chunkHash),
    vectorHash: 'sha256:' + sha256(bytes),
  };
  try {
    atomicWrite(join(indexPath(root), 'vectors', receipt.vector), bytes);
    atomicWrite(
      join(indexPath(root), 'vectors', receipt.vector + '.json'),
      JSON.stringify(receipt) + '\n',
    );
    return receipt;
  } catch {
    throw new AppError('INDEX_WRITE_FAILED');
  }
}
export function publish(root: string, snapshot: Snapshot, config: Config) {
  parseSnapshot(snapshot, config);
  loadVectors(root, snapshot);
  try {
    atomicWrite(join(indexPath(root), 'snapshot.json'), JSON.stringify(snapshot) + '\n');
  } catch {
    throw new AppError('INDEX_WRITE_FAILED');
  }
}
export function collect(root: string, snapshot: Snapshot) {
  loadVectors(root, snapshot);
  const retained = new Set(snapshot.chunks.map((c) => c.vector));
  let removed = 0;
  const path = join(indexPath(root), 'vectors');
  if (!exists(path)) return { project: snapshot.project, removedVectors: 0, retainedVectors: 0 };
  try {
    directory(path);
    for (const name of readdirSync(path)) {
      const match = /^(sha256-[a-f0-9]{64}\.f32)(\.json)?$/.exec(name);
      if (!match || retained.has(match[1]!)) continue;
      // Unlink never follows the final symlink; unknown files and sources remain untouched.
      unlinkSync(join(path, name));
      if (!match[2]) removed++;
    }
  } catch {
    throw new AppError('INDEX_WRITE_FAILED');
  }
  return { project: snapshot.project, removedVectors: removed, retainedVectors: retained.size };
}
