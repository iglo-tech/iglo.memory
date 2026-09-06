import { check, object } from '@/scripts/retrieval-eval/corpus';
import { formattedInput } from '@/src/chunks';
import type { Config } from '@/src/config';
import { DEFAULT_RERANK_MODEL } from '@/src/config';
import { BASE_URL, embed } from '@/src/embedding';
import { expansionRequest, parseExpansion } from '@/src/expansion';
import { excerpt } from '@/src/presentation';
import { parseRerank, rerankRequest } from '@/src/rerank';
import { fuseCandidates, originalCandidates } from '@/src/search';
import type { Snapshot, StoredChunk } from '@/src/store';
import { budgetFor } from '@/src/token-budget';

type Candidate = { chunk: StoredChunk; score: number };
const normalized = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
const tokens = (text: string) =>
  new Set(normalized(text).match(/[\p{L}\p{N}_]+(?:[./:@-][\p{L}\p{N}_]+)*/gu) ?? []);
const norm = (values: ArrayLike<number>) =>
  Math.sqrt(Array.from(values).reduce((sum, n) => sum + n * n, 0));

/** Pinned baseline scoring on shared v2 passages/Qwen inputs; not native baseline. */
export function adaptedBaseline(
  snapshot: Snapshot,
  vectors: ReadonlyMap<string, ArrayLike<number>>,
  query: string,
  queryVector: number[],
): Candidate[] {
  const queryNorm = norm(queryVector),
    queryTokens = tokens(query),
    phrase = normalized(query);
  const coverage = (text: string) => {
    const present = tokens(text);
    return queryTokens.size
      ? [...queryTokens].filter((token) => present.has(token)).length / queryTokens.size
      : 0;
  };
  const candidates = snapshot.chunks
    .map((chunk) => {
      const vector = vectors.get(chunk.vector)!;
      let dot = 0;
      for (let i = 0; i < vector.length; i++) dot += vector[i]! * queryVector[i]!;
      const score =
        (dot / (norm(vector) * queryNorm)) * 0.8 +
        (phrase && normalized(chunk.text).includes(phrase) ? 0.1 : 0) +
        coverage(chunk.text) * 0.06 +
        coverage(chunk.heading) * 0.03 +
        coverage(chunk.source) * 0.01;
      return { chunk, score };
    })
    .filter((item) => item.score >= 0.25)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Buffer.compare(Buffer.from(a.chunk.source), Buffer.from(b.chunk.source)) ||
        a.chunk.startLine - b.chunk.startLine ||
        a.chunk.endLine - b.chunk.endLine ||
        a.chunk.chunkHash.localeCompare(b.chunk.chunkHash),
    );
  const seen = new Set<string>();
  return candidates
    .filter(({ chunk }) => {
      if (seen.has(chunk.source)) return false;
      seen.add(chunk.source);
      return true;
    })
    .slice(0, 8);
}

export function presentAblation(snapshot: Snapshot, query: string, candidates: Candidate[]) {
  return {
    query,
    preparedAt: snapshot.preparedAt,
    responseVersion: 2,
    scoreKind: 'ordinal',
    retrievalRevision: 'qwen-luna-voyage-v2',
    results: candidates.slice(0, 8).map(({ chunk }, rank) => ({
      score: Math.round((1 / (rank + 1)) * 1e6) / 1e6,
      passageId: chunk.passageId,
      source: chunk.source,
      heading: chunk.heading,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      ...excerpt(snapshot, chunk, query),
    })),
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

/** Admit only exact saved payloads; all current production parsers remain authoritative. */
export async function controlledInputs(
  snapshot: Snapshot,
  config: Config,
  query: string,
  requests: unknown,
) {
  check(Array.isArray(requests), 'Missing captured requests');
  const rows = requests.map((value) => ({ row: object(value), used: false }));
  const take = (endpoint: string, payload: unknown) => {
    const match = rows.find(
      ({ row, used }) =>
        !used &&
        row.endpoint === `${BASE_URL}/${endpoint}` &&
        canonical(row.payload) === canonical(payload),
    );
    check(
      match && Number(match.row.status) >= 200 && Number(match.row.status) < 300,
      'Missing successful exact captured request',
    );
    match.used = true;
    return match.row.response;
  };
  const budget = budgetFor(config.embedding.model);
  const embeddings = (input: string[]) =>
    embed(
      input,
      config.embedding.model,
      'offline',
      snapshot.profile.dimensions!,
      Object.assign(
        async (_url: RequestInfo | URL, init?: RequestInit) =>
          Response.json(take('embeddings', JSON.parse(String(init?.body)))),
        { preconnect: () => {} },
      ),
      undefined,
      { deadline: performance.now() + 30000 },
    );
  const [queryVector] = await embeddings([budget.formatQuery(query)]);
  const expansion = parseExpansion(take('chat/completions', expansionRequest(query)), query);
  const inputs = [...expansion.vec.map((value) => budget.formatQuery(value)), ...expansion.hyde];
  const generatedVectors: number[][] = [];
  for (const batch of budget.batches(inputs)) generatedVectors.push(...(await embeddings(batch)));
  return {
    queryVector: queryVector!,
    expansion,
    generatedVectors,
    savedRerank(documents: string[]) {
      const model = config.retrieval?.model ?? DEFAULT_RERANK_MODEL;
      const scores = parseRerank(
        take('rerank', rerankRequest(query, documents, model)),
        documents,
        model,
      );
      check(
        rows.every((row) => row.used),
        'Unused captured request',
      );
      return scores;
    },
  };
}

export function controlledCandidates(
  snapshot: Snapshot,
  vectors: ReadonlyMap<string, ArrayLike<number>>,
  query: string,
  inputs: Awaited<ReturnType<typeof controlledInputs>>,
) {
  const originals = originalCandidates(snapshot, vectors, query, inputs.queryVector);
  const expanded = [
    ...inputs.expansion.lex.map(
      (variant) => originalCandidates(snapshot, vectors, variant, inputs.queryVector).lexical,
    ),
    ...inputs.generatedVectors.map(
      (vector) => originalCandidates(snapshot, vectors, query, vector).vector,
    ),
  ];
  return {
    baseline: adaptedBaseline(snapshot, vectors, query, inputs.queryVector),
    original: fuseCandidates(originals),
    expanded: fuseCandidates(originals, expanded),
  };
}

export function ablationDocuments(config: Config, candidates: Candidate[]) {
  return candidates.map(({ chunk }) =>
    formattedInput(config.project, chunk, config.embedding.model),
  );
}

export function rerankedAblation(
  snapshot: Snapshot,
  query: string,
  candidates: Candidate[],
  scores: { index: number; score: number }[],
  minimumScore = 0.435546875,
) {
  check(
    scores.length === candidates.length &&
      new Set(scores.map((item) => item.index)).size === candidates.length &&
      scores.every(
        (item) =>
          Number.isSafeInteger(item.index) &&
          item.index >= 0 &&
          item.index < candidates.length &&
          Number.isFinite(item.score),
      ),
    'Invalid complete ablation scores',
  );
  const ordered = [...scores]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((item) => item.score >= minimumScore)
    .map(({ index }) => candidates[index]!);
  return presentAblation(snapshot, query, ordered);
}
