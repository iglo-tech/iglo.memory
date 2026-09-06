import { check, object } from '@/scripts/retrieval-eval/corpus';
import type { Excerpt } from '@/scripts/retrieval-eval/scoring';
import type { Config } from '@/src/config';
import { embed } from '@/src/embedding';
import { expand } from '@/src/expansion';
import { rerank } from '@/src/rerank';
import { search } from '@/src/search';
import { sourcePosition, type Snapshot } from '@/src/store';

/** Validate source-owned v2 evidence. Presentation markers never become evidence. */
export function proposalExcerpts(
  value: unknown,
  snapshot: Snapshot,
  sources: Map<string, string>,
): Excerpt[] {
  const root = object(value);
  check(
    root.responseVersion === 2 &&
      root.scoreKind === 'ordinal' &&
      root.retrievalRevision === 'qwen-luna-voyage-v2' &&
      Array.isArray(root.results) &&
      root.results.length <= 8,
    'Invalid proposal response',
  );
  const seen = new Set<string>();
  return root.results.map((value) => {
    const result = object(value);
    check(
      typeof result.passageId === 'string' && !seen.has(result.passageId),
      'Invalid passage ID',
    );
    seen.add(result.passageId);
    const chunk = snapshot.chunks.find((item) => item.passageId === result.passageId);
    check(chunk && chunk.source === result.source, 'Proposal passage/source mismatch');
    check(
      result.heading === chunk.heading &&
        result.startLine === chunk.startLine &&
        result.endLine === chunk.endLine,
      'Proposal passage metadata mismatch',
    );
    const source = snapshot.sources.find((item) => item.source === chunk.source);
    const body = sources.get(`${snapshot.project}/${chunk.source}`);
    check(source && body !== undefined, 'Unknown proposal source');
    const points = Array.from(body);
    const lineStarts = [
      0,
      ...points.flatMap((character, index) => (character === '\n' ? [index + 1] : [])),
    ];
    check(
      source.length === points.length &&
        JSON.stringify(source.lineStarts) === JSON.stringify(lineStarts),
      'Proposal source positions mismatch',
    );
    check(
      Array.from(body).slice(chunk.start, chunk.end).join('') === chunk.text,
      'Proposal chunk/source mismatch',
    );
    const span = object(result.snippetSpan);
    check(
      Number.isSafeInteger(span.start) &&
        Number.isSafeInteger(span.end) &&
        Number(span.start) >= chunk.start &&
        Number(span.end) <= chunk.end &&
        Number(span.end) > Number(span.start) &&
        Number(span.end) - Number(span.start) <= 400,
      'Invalid proposal span',
    );
    const start = Number(span.start),
      end = Number(span.end);
    const from = sourcePosition(source, start),
      to = sourcePosition(source, end);
    check(
      span.startLine === from.line &&
        span.startColumn === from.column &&
        span.endLine === to.line &&
        span.endColumn === to.column,
      'Proposal position mismatch',
    );
    const text = Array.from(body).slice(start, end).join('');
    const displayed = (start > chunk.start ? '…' : '') + text + (end < chunk.end ? '…' : '');
    check(result.snippet === displayed, 'Proposal snippet mismatch');
    return { source: chunk.source, text, start, end, mapping: 'exact', misleading: null };
  });
}

// Object key order is irrelevant; array order and every payload value remain exact.
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

/** No network fallback. Matching ignores concurrency completion order, never payload content. */
export function savedTransport(value: unknown) {
  check(Array.isArray(value), 'Missing captured requests');
  const rows = value.map((item) => {
    const row = object(item);
    check(
      typeof row.endpoint === 'string' &&
        Number.isSafeInteger(row.status) &&
        Number(row.status) >= 200 &&
        Number(row.status) < 300 &&
        row.response !== undefined,
      'Replay requires successful captured HTTP responses',
    );
    return {
      endpoint: row.endpoint,
      payload: canonical(row.payload),
      response: row.response,
      status: Number(row.status),
      used: false,
    };
  });
  const mismatches: string[] = [];
  const request: typeof fetch = Object.assign(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const endpoint = String(url);
      const payload = canonical(JSON.parse(String(init?.body)));
      const row = rows.find(
        (item) => !item.used && item.endpoint === endpoint && item.payload === payload,
      );
      if (!row) {
        mismatches.push(`Unmatched saved request: ${endpoint}`);
        throw new Error(mismatches.at(-1));
      }
      row.used = true;
      return Response.json(row.response, { status: row.status });
    },
    { preconnect: () => {} },
  );
  return {
    request,
    assertConsumed() {
      check(!mismatches.length, mismatches.join('; '));
      check(
        rows.every((row) => row.used),
        'Unused captured requests',
      );
    },
  };
}

/** Run the real current pipeline against exact captured requests, including current cutoff. */
export async function replayProposal(
  root: string,
  config: Config,
  query: string,
  requests: unknown,
  minimumScore?: number,
) {
  const saved = savedTransport(requests);
  const result = await search(
    root,
    config,
    query,
    (inputs, model, key, dimensions, _request, sleep, options) =>
      embed(inputs, model, key, dimensions, saved.request, sleep, options),
    () => 'offline-replay',
    {
      minimumScore,
      expansion: (question, key, options) => expand(question, key, options, saved.request),
      reranking: (question, documents, model, key, options) =>
        rerank(question, documents, model, key, options, saved.request),
    },
  );
  saved.assertConsumed();
  return result;
}
