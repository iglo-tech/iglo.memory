import type { Config } from '@/src/config';
import { embed } from '@/src/embedding';
import { budgetFor } from '@/src/token-budget';
import { scoreLexical } from '@/src/lexical';
import type { StoredChunk } from '@/src/store';
import { requireCredential } from '@/src/credentials';
import { withIndexLock } from '@/src/lock';
import { collect, loadVectors, readSnapshot, type Snapshot } from '@/src/store';

function norm(values: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]! * values[i]!;
  return Math.sqrt(sum);
}
export function comparePassages(a: StoredChunk, b: StoredChunk) {
  return (
    Buffer.compare(Buffer.from(a.source), Buffer.from(b.source)) ||
    a.start - b.start ||
    a.end - b.end ||
    Buffer.compare(Buffer.from(a.passageId), Buffer.from(b.passageId))
  );
}
export function originalCandidates(
  snapshot: Snapshot,
  vectors: ReadonlyMap<string, ArrayLike<number>>,
  query: string,
  queryVector: number[],
  vectorNorms?: ReadonlyMap<string, number>,
) {
  const byId = new Map(snapshot.chunks.map((chunk) => [chunk.passageId, chunk]));
  const queryNorm = norm(queryVector);
  const vector = snapshot.chunks
    .map((chunk) => {
      const values = vectors.get(chunk.vector)!;
      let dot = 0;
      for (let i = 0; i < values.length; i++) dot += values[i]! * queryVector[i]!;
      return { chunk, score: dot / ((vectorNorms?.get(chunk.vector) ?? norm(values)) * queryNorm) };
    })
    .sort((a, b) => b.score - a.score || comparePassages(a.chunk, b.chunk))
    .slice(0, 40);
  const lexical = scoreLexical(snapshot.lexical, query)
    .map((item) => ({ chunk: byId.get(item.passageId)!, score: item.score }))
    .sort((a, b) => b.score - a.score || comparePassages(a.chunk, b.chunk))
    .slice(0, 40);
  return { vector, lexical };
}
// Intermediate original-query ranking. T04/T05 add protected candidate selection
// and dedicated reranking before the release gate can be evaluated.
export function rank(
  snapshot: Snapshot,
  vectors: ReadonlyMap<string, ArrayLike<number>>,
  query: string,
  queryVector: number[],
  vectorNorms?: ReadonlyMap<string, number>,
) {
  const lists = originalCandidates(snapshot, vectors, query, queryVector, vectorNorms);
  const scores = new Map<string, { chunk: StoredChunk; score: number }>();
  for (const list of [lists.vector, lists.lexical])
    list.forEach(({ chunk }, index) => {
      const current = scores.get(chunk.passageId) ?? { chunk, score: 0 };
      current.score += 1 / (60 + index + 1);
      scores.set(chunk.passageId, current);
    });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || comparePassages(a.chunk, b.chunk))
    .slice(0, 8)
    .map(({ chunk }, index) => ({
      score: Math.round((1 / (index + 1)) * 1e6) / 1e6,
      passageId: chunk.passageId,
      source: chunk.source,
      heading: chunk.heading,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      snippet:
        Array.from(chunk.text).slice(0, 400).join('') +
        (Array.from(chunk.text).length > 400 ? '…' : ''),
    }));
}
export async function search(
  root: string,
  config: Config,
  query: string,
  embedding = embed,
  credential = requireCredential,
) {
  const loaded = await withIndexLock(root, () => {
    const snapshot = readSnapshot(root, config);
    return { snapshot, ...loadVectors(root, snapshot) };
  });
  const { snapshot, vectors, norms } = loaded;
  if (!snapshot.chunks.length)
    return {
      query,
      preparedAt: snapshot.preparedAt,
      responseVersion: 2,
      scoreKind: 'ordinal',
      retrievalRevision: 'original-hybrid-v2',
      results: [],
    };
  const budget = budgetFor(config.embedding.model);
  const input = budget.formatQuery(query);
  budget.batches([input]);
  const [queryVector] = await embedding(
    [input],
    config.embedding.model,
    credential(),
    snapshot.profile.dimensions!,
  );
  return {
    query,
    responseVersion: 2,
    scoreKind: 'ordinal',
    retrievalRevision: 'original-hybrid-v2',
    preparedAt: snapshot.preparedAt,
    results: rank(snapshot, vectors, query, queryVector!, norms),
  };
}
export async function status(root: string, config: Config) {
  return withIndexLock(root, () => {
    const snapshot = readSnapshot(root, config);
    const loaded = loadVectors(root, snapshot, true);
    return {
      project: config.project,
      preparedAt: snapshot.preparedAt,
      documents: snapshot.documents,
      chunks: snapshot.chunks.length,
      vectors: loaded.vectors.size,
      missingVectors: loaded.missingVectors,
      profile: snapshot.profile.profile,
    };
  });
}
export async function gc(root: string, config: Config) {
  return withIndexLock(root, () => collect(root, readSnapshot(root, config)));
}
