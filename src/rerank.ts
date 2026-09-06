import { DEFAULT_RERANK_MODEL } from '@/src/config';
import { BASE_URL } from '@/src/embedding';
import { AppError } from '@/src/errors';
import { record } from '@/src/files';
import { requestSearchJson } from '@/src/search-transport';
import { voyageTokens } from '@/src/token-budget';

const MAX_BYTES = 2 * 1024 * 1024;
const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
const failure = (reason: 'provider' | 'budget' | 'invalid_response' = 'invalid_response') =>
  new AppError('RERANK_FAILED', { stage: 'rerank', reason });
function supported(model: string) {
  if (model !== DEFAULT_RERANK_MODEL) throw failure('provider');
}

export function rerankRequest(
  query: string,
  documents: string[],
  model: string = DEFAULT_RERANK_MODEL,
) {
  supported(model);
  if (!query.isWellFormed() || !query.trim() || bytes(JSON.stringify(query)) > 16384)
    throw new AppError('QUERY_TOO_LARGE');
  const queryTokens = voyageTokens(query);
  if (queryTokens > 2048) throw new AppError('QUERY_TOO_LARGE');
  if (!documents.length || documents.length > 40) throw failure('budget');
  let total = queryTokens * documents.length;
  for (const document of documents) {
    if (!document.isWellFormed() || !document.length || bytes(JSON.stringify(document)) > 32768)
      throw failure('budget');
    const tokens = voyageTokens(document);
    if (tokens > 4096 || tokens + queryTokens > 6144) throw failure('budget');
    total += tokens;
  }
  if (total > 245760) throw failure('budget');
  const payload = { model, query, documents, top_n: documents.length };
  if (bytes(JSON.stringify(payload)) > MAX_BYTES) throw failure('budget');
  return payload;
}

export function parseRerank(
  body: unknown,
  documents: string[],
  model: string = DEFAULT_RERANK_MODEL,
): { index: number; score: number }[] {
  supported(model);
  if (
    !documents.length ||
    documents.length > 40 ||
    !record(body) ||
    Object.hasOwn(body, 'error') ||
    (body.model !== model && body.model !== 'rerank-2.5') ||
    !Array.isArray(body.results) ||
    body.results.length !== documents.length
  )
    throw failure();
  const seen = new Set<number>();
  const scores: { index: number; score: number }[] = [];
  for (const entry of body.results) {
    const result: unknown = entry;
    if (
      !record(result) ||
      typeof result.index !== 'number' ||
      !Number.isSafeInteger(result.index) ||
      result.index < 0 ||
      result.index >= documents.length ||
      seen.has(result.index) ||
      typeof result.relevance_score !== 'number' ||
      !Number.isFinite(result.relevance_score) ||
      !record(result.document) ||
      result.document.text !== documents[result.index]
    )
      throw failure();
    seen.add(result.index);
    scores.push({ index: result.index, score: result.relevance_score });
  }
  if (body.usage !== undefined) {
    if (!record(body.usage)) throw failure();
    for (const key of ['total_tokens', 'search_units']) {
      const value = body.usage[key];
      if (
        value !== undefined &&
        (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
      )
        throw failure();
    }
    const cost = body.usage.cost;
    if (cost !== undefined && (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0))
      throw failure();
  }
  return scores.sort((a, b) => b.score - a.score || a.index - b.index);
}

export async function rerank(
  query: string,
  documents: string[],
  model: string,
  key: string,
  options: { deadline: number },
  request: typeof fetch = fetch,
): Promise<{ index: number; score: number }[]> {
  try {
    if (performance.now() >= options.deadline) throw new AppError('SEARCH_TIMEOUT');
    const payload = rerankRequest(query, documents, model);
    const body = await requestSearchJson(
      `${BASE_URL}/rerank`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      { ...options, maxBytes: MAX_BYTES, code: 'RERANK_FAILED' },
      request,
    );
    const result = parseRerank(body, documents, model);
    if (performance.now() >= options.deadline) throw new AppError('SEARCH_TIMEOUT');
    return result;
  } catch (error) {
    if (performance.now() >= options.deadline) throw new AppError('SEARCH_TIMEOUT');
    throw error;
  }
}
