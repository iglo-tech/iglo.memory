import { AppError } from '@/src/errors';
import { DEFAULT_RERANK_MODEL, type Config } from '@/src/config';
import { formattedInput } from '@/src/chunks';
import { rerank } from '@/src/rerank';
import { excerpt } from '@/src/presentation';
import { embed } from '@/src/embedding';
import { expand } from '@/src/expansion';
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
type Candidate = { chunk: StoredChunk; score: number };
function vectorCandidates(
  snapshot: Snapshot,
  vectors: ReadonlyMap<string, ArrayLike<number>>,
  queryVector: number[],
  vectorNorms?: ReadonlyMap<string, number>,
): Candidate[] {
  const queryNorm = norm(queryVector);
  return snapshot.chunks
    .map((chunk) => {
      const values = vectors.get(chunk.vector)!;
      let dot = 0;
      for (let i = 0; i < values.length; i++) dot += values[i]! * queryVector[i]!;
      return { chunk, score: dot / ((vectorNorms?.get(chunk.vector) ?? norm(values)) * queryNorm) };
    })
    .sort((a, b) => b.score - a.score || comparePassages(a.chunk, b.chunk))
    .slice(0, 40);
}
function lexicalCandidates(
  snapshot: Snapshot,
  byId: ReadonlyMap<string, StoredChunk>,
  query: string,
): Candidate[] {
  return scoreLexical(snapshot.lexical, query)
    .map((item) => ({ chunk: byId.get(item.passageId)!, score: item.score }))
    .sort((a, b) => b.score - a.score || comparePassages(a.chunk, b.chunk))
    .slice(0, 40);
}
export function originalCandidates(
  snapshot: Snapshot,
  vectors: ReadonlyMap<string, ArrayLike<number>>,
  query: string,
  queryVector: number[],
  vectorNorms?: ReadonlyMap<string, number>,
) {
  const byId = new Map(snapshot.chunks.map((chunk) => [chunk.passageId, chunk]));
  return {
    vector: vectorCandidates(snapshot, vectors, queryVector, vectorNorms),
    lexical: lexicalCandidates(snapshot, byId, query),
  };
}
export function fuseCandidates(
  lists: { vector: Candidate[]; lexical: Candidate[] },
  expanded: Candidate[][] = [],
): Candidate[] {
  const scores = new Map<string, Candidate>();
  const protectedIds = new Set<string>();
  const key = (chunk: StoredChunk) => JSON.stringify([chunk.source, chunk.start, chunk.end]);
  const channels = [
    { candidates: lists.vector, original: true },
    { candidates: lists.lexical, original: true },
    ...expanded.map((candidates) => ({ candidates, original: false })),
  ];
  for (const { candidates: list, original } of channels) {
    const seen = new Set<string>();
    let rank = 0;
    for (const { chunk } of list) {
      const id = key(chunk);
      if (seen.has(id)) continue;
      seen.add(id);
      rank++;
      if (rank > 40) break;
      if (original && rank <= 8) protectedIds.add(id);
      const current = scores.get(id) ?? { chunk, score: 0 };
      current.score += (original ? 2 : 1) / (60 + rank);
      scores.set(id, current);
    }
  }
  const ordered = [...scores.values()].sort(
    (a, b) => b.score - a.score || comparePassages(a.chunk, b.chunk),
  );
  const selected = new Set(protectedIds);
  const perFile = new Map<string, number>();
  const add = (item: Candidate) => {
    selected.add(key(item.chunk));
    perFile.set(item.chunk.source, (perFile.get(item.chunk.source) ?? 0) + 1);
  };
  for (const item of ordered) if (protectedIds.has(key(item.chunk))) add(item);
  const deferred: Candidate[] = [];
  for (const item of ordered) {
    if (selected.has(key(item.chunk))) continue;
    if (selected.size >= 40) break;
    if ((perFile.get(item.chunk.source) ?? 0) < 2) add(item);
    else deferred.push(item);
  }
  for (const item of deferred) {
    if (selected.size >= 40) break;
    add(item);
  }
  return ordered.filter((item) => selected.has(key(item.chunk)));
}
export function checkSearchDeadline(deadline: number) {
  if (performance.now() >= deadline) throw new AppError('SEARCH_TIMEOUT');
}
// Intermediate presentation; T05 reranks the complete protected candidate set.
export function rank(
  snapshot: Snapshot,
  vectors: ReadonlyMap<string, ArrayLike<number>>,
  query: string,
  queryVector: number[],
  vectorNorms?: ReadonlyMap<string, number>,
) {
  const lists = originalCandidates(snapshot, vectors, query, queryVector, vectorNorms);
  return presentCandidates(fuseCandidates(lists));
}
function presentCandidates(candidates: Candidate[]) {
  return candidates.slice(0, 8).map(({ chunk }, index) => ({
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
  options: {
    deadline?: number;
    expansion?: typeof expand;
    reranking?: typeof rerank;
    minimumScore?: number;
  } = {},
) {
  const deadline = options.deadline ?? performance.now() + 30_000;
  try {
    checkSearchDeadline(deadline);
    const loaded = await withIndexLock(
      root,
      () => {
        checkSearchDeadline(deadline);
        const snapshot = readSnapshot(root, config);
        checkSearchDeadline(deadline);
        const loaded = { snapshot, ...loadVectors(root, snapshot) };
        checkSearchDeadline(deadline);
        return loaded;
      },
      Math.min(5000, deadline - performance.now()),
    );
    checkSearchDeadline(deadline);
    const { snapshot, vectors, norms } = loaded;
    if (!snapshot.chunks.length)
      return {
        query,
        preparedAt: snapshot.preparedAt,
        responseVersion: 2,
        scoreKind: 'ordinal',
        retrievalRevision: 'qwen-luna-voyage-v2',
        results: [],
      };
    const budget = budgetFor(config.embedding.model);
    const input = budget.formatQuery(query);
    budget.batches([input]);
    checkSearchDeadline(deadline);
    const key = credential();
    checkSearchDeadline(deadline);
    const controller = new AbortController();
    const transport = { deadline, signal: controller.signal };
    let firstFailure: { error: unknown } | undefined;
    const observe = async <T>(operation: () => Promise<T>): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        firstFailure ??= { error };
        controller.abort();
        throw error;
      }
    };
    const original = observe(() =>
      embedding(
        [input],
        config.embedding.model,
        key,
        snapshot.profile.dimensions!,
        undefined,
        undefined,
        transport,
      ),
    );
    const generated = observe(async () => {
      const expansion = await (options.expansion ?? expand)(query, key, transport);
      checkSearchDeadline(deadline);
      const inputs = [
        ...expansion.vec.map((variant) => budget.formatQuery(variant)),
        ...expansion.hyde,
      ];
      const generatedVectors: number[][] = [];
      for (const batch of budget.batches(inputs)) {
        checkSearchDeadline(deadline);
        if (controller.signal.aborted)
          throw new AppError('EMBEDDING_FAILED', {
            stage: 'embedding',
            reason: 'transport',
          });
        generatedVectors.push(
          ...(await embedding(
            batch,
            config.embedding.model,
            key,
            snapshot.profile.dimensions!,
            undefined,
            undefined,
            transport,
          )),
        );
      }
      return { expansion, generatedVectors };
    });
    await Promise.allSettled([original, generated]);
    checkSearchDeadline(deadline);
    if (firstFailure) throw firstFailure.error;
    const [queryVector] = await original;
    const { expansion, generatedVectors } = await generated;
    const byId = new Map(snapshot.chunks.map((chunk) => [chunk.passageId, chunk]));
    const lists = {
      vector: vectorCandidates(snapshot, vectors, queryVector!, norms),
      lexical: lexicalCandidates(snapshot, byId, query),
    };
    const expanded: Candidate[][] = [];
    for (const variant of expansion.lex) {
      checkSearchDeadline(deadline);
      expanded.push(lexicalCandidates(snapshot, byId, variant));
    }
    for (const vector of generatedVectors) {
      checkSearchDeadline(deadline);
      expanded.push(vectorCandidates(snapshot, vectors, vector, norms));
    }
    const candidates = fuseCandidates(lists, expanded);
    checkSearchDeadline(deadline);
    const scores = await (options.reranking ?? rerank)(
      query,
      candidates.map(({ chunk }) => formattedInput(config.project, chunk, config.embedding.model)),
      config.retrieval?.model ?? DEFAULT_RERANK_MODEL,
      key,
      { deadline },
    );
    // Development-selected cutoff; scores are not calibrated probabilities.
    // See docs/retrieval-v2-design.md for sensitivity and rollout limits.
    const minimumScore = options.minimumScore ?? 0.435546875;
    const results = scores
      .filter(({ score }) => score >= minimumScore)
      .slice(0, 8)
      .map(({ index }, rank) => {
        const chunk = candidates[index]!.chunk;
        return {
          score: Math.round((1 / (rank + 1)) * 1e6) / 1e6,
          passageId: chunk.passageId,
          source: chunk.source,
          heading: chunk.heading,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          ...excerpt(snapshot, chunk, query),
        };
      });
    checkSearchDeadline(deadline);
    return {
      query,
      responseVersion: 2,
      scoreKind: 'ordinal',
      retrievalRevision: 'qwen-luna-voyage-v2',
      preparedAt: snapshot.preparedAt,
      results,
    };
  } catch (error) {
    checkSearchDeadline(deadline);
    throw error;
  }
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
      schemaVersion: snapshot.schemaVersion,
      lexicalProfile: snapshot.lexical.profile,
      profile: snapshot.profile.profile,
    };
  });
}
export async function gc(root: string, config: Config) {
  return withIndexLock(root, () => collect(root, readSnapshot(root, config)));
}
