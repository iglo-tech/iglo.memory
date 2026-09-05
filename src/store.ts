import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config';
import { CHUNKER, formattedInput, sha256, type Chunk } from './chunks';
import { BASE_URL, validVector } from './embedding';
import { AppError } from './errors';
import { atomicWrite, directory, exists, missing, readBytes, record } from './files';

export type Profile = { profile: string; baseUrl: string; model: string; dimensions: number | null; encodingFormat: 'float'; chunker: string; inputFormatting: string; normalization: string };
export type StoredChunk = Chunk & { vector: string; vectorHash: string };
export type Snapshot = { schemaVersion: 1; project: string; preparedAt: string; profile: Profile; documents: number; chunks: StoredChunk[] };
export type Receipt = { profile: Profile; chunkHash: string; vector: string; vectorHash: string };
export const indexPath = (root: string) => join(root, '.agent', 'memory-index');
export const vectorName = (profile: Profile, hash: string) => `sha256-${sha256(JSON.stringify([profile.profile, CHUNKER, hash]))}.f32`;
const digest = (v: unknown): v is string => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v);
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function profileFor(model: string, dimensions: number | null): Profile {
  const p = { baseUrl: BASE_URL, model, dimensions, encodingFormat: 'float' as const, chunker: CHUNKER, inputFormatting: 'project-file-section-v1', normalization: 'lf-v1' };
  return { ...p, profile: 'sha256:' + sha256(JSON.stringify([p.baseUrl,p.model,p.dimensions,p.encodingFormat,p.inputFormatting,p.chunker,p.normalization])) };
}
function parseProfile(v: unknown, config: Config): Profile {
  if (!record(v) || typeof v.model !== 'string' || !digest(v.profile) || !(v.dimensions === null || whole(v.dimensions) && v.dimensions > 0)) throw new AppError('INDEX_INVALID');
  const expected = profileFor(config.embedding.model, v.dimensions as number | null);
  for (const key of ['baseUrl','model','encodingFormat','chunker','inputFormatting','normalization'] as const) {
    if (v[key] !== expected[key]) throw new AppError('INDEX_INCOMPATIBLE');
  }
  if (v.profile !== expected.profile) throw new AppError('INDEX_INVALID');
  return expected;
}
function safeSource(v: unknown): v is string {
  return typeof v === 'string' && /^\.agent\/(knowledge|decisions)\/.+\.md$/.test(v)
    && !/[\\\x00]/.test(v) && v.split('/').every(x => x !== '..' && x !== '.' && x !== '');
}
function parseReceipt(v: unknown, config: Config): Receipt {
  if (!record(v) || !digest(v.chunkHash) || !digest(v.vectorHash)) throw new AppError('INDEX_INVALID');
  const profile = parseProfile(v.profile, config);
  if (profile.dimensions === null || v.vector !== vectorName(profile, v.chunkHash)) throw new AppError('INDEX_INVALID');
  return { profile, chunkHash: v.chunkHash, vector: v.vector as string, vectorHash: v.vectorHash };
}
export function parseSnapshot(v: unknown, config: Config): Snapshot {
  if (!record(v)) throw new AppError('INDEX_INVALID');
  if (v.schemaVersion !== 1) throw new AppError('INDEX_INCOMPATIBLE');
  if (v.project !== config.project) throw new AppError('INDEX_INCOMPATIBLE');
  if (!whole(v.documents) || !Array.isArray(v.chunks) || typeof v.preparedAt !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.preparedAt) || !Number.isFinite(Date.parse(v.preparedAt))) throw new AppError('INDEX_INVALID');
  const profile = parseProfile(v.profile, config); const chunks: StoredChunk[] = [];
  const identities = new Set<string>(); const vectors = new Map<string,string>(); const sources = new Set<string>();
  for (const item of v.chunks as unknown[]) {
    if (!record(item) || !safeSource(item.source) || typeof item.heading !== 'string' || /[\r\n\x00]/.test(item.heading)
      || typeof item.text !== 'string' || !item.text.trim() || item.text.includes('\r')
      || !whole(item.startLine) || item.startLine === 0 || !whole(item.endLine) || item.endLine < item.startLine
      || item.text.split('\n').length !== item.endLine - item.startLine + 1 || !digest(item.chunkHash) || !digest(item.vectorHash)) throw new AppError('INDEX_INVALID');
    const chunk: Chunk = { source: item.source, heading: item.heading, text: item.text, startLine: item.startLine, endLine: item.endLine, chunkHash: item.chunkHash };
    if (item.chunkHash !== 'sha256:' + sha256(formattedInput(config.project, chunk)) || item.vector !== vectorName(profile, item.chunkHash)) throw new AppError('INDEX_INVALID');
    const vector = item.vector as string;
    const identity = JSON.stringify([chunk.source, chunk.startLine, chunk.endLine]);
    if (identities.has(identity) || vectors.has(vector) && vectors.get(vector) !== item.vectorHash) throw new AppError('INDEX_INVALID');
    identities.add(identity); vectors.set(vector, item.vectorHash); sources.add(chunk.source);
    chunks.push({ ...chunk, vector, vectorHash: item.vectorHash });
  }
  if (sources.size > v.documents || chunks.length > 0 && profile.dimensions === null) throw new AppError('INDEX_INVALID');
  return { schemaVersion: 1, project: config.project, preparedAt: v.preparedAt, profile, documents: v.documents, chunks };
}
export function readSnapshot(root: string, config: Config): Snapshot {
  try {
    directory(join(root, '.agent')); directory(indexPath(root));
    return parseSnapshot(JSON.parse(readBytes(join(indexPath(root), 'snapshot.json')).toString('utf8')), config);
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
export function readVector(root: string, receipt: Receipt): number[] {
  try {
    directory(join(indexPath(root), 'vectors'));
    const bytes = readBytes(join(indexPath(root), 'vectors', receipt.vector));
    if (bytes.length !== receipt.profile.dimensions! * 4 || 'sha256:' + sha256(bytes) !== receipt.vectorHash) throw new AppError('INDEX_INVALID');
    const values: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) values.push(bytes.readFloatLE(i));
    return validVector(values, receipt.profile.dimensions!);
  } catch (error) { if (missing(error)) throw error; throw new AppError('INDEX_INVALID'); }
}
export function loadVectors(root: string, snapshot: Snapshot, allowMissing = false) {
  const vectors = new Map<string, number[]>(); const absent = new Set<string>();
  for (const chunk of snapshot.chunks) {
    if (vectors.has(chunk.vector) || absent.has(chunk.vector)) continue;
    try { vectors.set(chunk.vector, readVector(root, { ...chunk, profile: snapshot.profile })); }
    catch (error) { if (allowMissing && missing(error)) absent.add(chunk.vector); else throw new AppError('INDEX_INVALID'); }
  }
  return { vectors, missingVectors: absent.size };
}
export function ensureIndex(root: string) {
  try { directory(join(root,'.agent')); directory(indexPath(root),true); directory(join(indexPath(root),'vectors'),true); }
  catch { throw new AppError('INDEX_WRITE_FAILED'); }
}
export function cacheReceipts(root: string, config: Config): Receipt[] {
  const receipts: Receipt[] = [];
  for (const name of readdirSync(join(indexPath(root),'vectors')).sort()) {
    if (!/^sha256-[a-f0-9]{64}\.f32\.json$/.test(name)) continue;
    try {
      const receipt = parseReceipt(JSON.parse(readBytes(join(indexPath(root),'vectors',name)).toString('utf8')),config);
      if (name === receipt.vector + '.json') receipts.push(receipt);
    } catch { /* Untrusted cache artifacts are rebuilt, never used as authority. */ }
  }
  return receipts;
}
export function saveVector(root: string, profile: Profile, chunkHash: string, values: number[]): Receipt {
  const bytes = vectorBytes(values);
  const receipt = { profile, chunkHash, vector: vectorName(profile,chunkHash), vectorHash:'sha256:'+sha256(bytes) };
  try {
    atomicWrite(join(indexPath(root),'vectors',receipt.vector),bytes);
    atomicWrite(join(indexPath(root),'vectors',receipt.vector+'.json'),JSON.stringify(receipt)+'\n');
    return receipt;
  } catch { throw new AppError('INDEX_WRITE_FAILED'); }
}
export function publish(root: string, snapshot: Snapshot, config: Config) {
  parseSnapshot(snapshot, config); loadVectors(root,snapshot);
  try { atomicWrite(join(indexPath(root),'snapshot.json'),JSON.stringify(snapshot)+'\n'); }
  catch { throw new AppError('INDEX_WRITE_FAILED'); }
}
export function collect(root: string, snapshot: Snapshot) {
  loadVectors(root,snapshot);
  const retained = new Set(snapshot.chunks.map(c=>c.vector)); let removed = 0;
  const path = join(indexPath(root),'vectors');
  if (!exists(path)) return { project:snapshot.project, removedVectors:0, retainedVectors:0 };
  try {
    directory(path);
    for (const name of readdirSync(path)) {
      const match = /^(sha256-[a-f0-9]{64}\.f32)(\.json)?$/.exec(name);
      if (!match || retained.has(match[1]!)) continue;
      // Unlink never follows the final symlink; unknown files and sources remain untouched.
      unlinkSync(join(path,name)); if (!match[2]) removed++;
    }
  } catch { throw new AppError('INDEX_WRITE_FAILED'); }
  return { project:snapshot.project, removedVectors:removed, retainedVectors:retained.size };
}
