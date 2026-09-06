import { readConfig } from '@/src/config';
import { AppError } from '@/src/errors';
import { search } from '@/src/search';
import { embed } from '@/src/embedding';
import { expand } from '@/src/expansion';
import { rerank } from '@/src/rerank';
import { requireCredential } from '@/src/credentials';

type Attempt = {
  endpoint: string;
  payload: unknown;
  outcome: 'PENDING' | 'TRANSPORT_FAILED' | 'RESPONSE';
  status?: number;
  response?: unknown;
  elapsedMs: number;
  cost: number | null;
};

/** Observe only bytes the production consumer reads, with no read-ahead. */
export function proposalObserver(originalFetch: typeof fetch) {
  const requests: Attempt[] = [];
  const observedFetch = Object.assign(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const began = performance.now();
      const attempt: Attempt = {
        endpoint: String(url),
        payload: JSON.parse(String(init?.body)),
        outcome: 'PENDING',
        elapsedMs: 0,
        cost: null,
      };
      requests.push(attempt);
      let response: Response;
      try {
        response = await originalFetch(url, init);
      } catch (error) {
        attempt.outcome = 'TRANSPORT_FAILED';
        attempt.elapsedMs = performance.now() - began;
        throw error;
      }
      attempt.outcome = 'RESPONSE';
      attempt.status = response.status;
      attempt.elapsedMs = performance.now() - began;
      if (!response.body) return response;
      const reader = response.body.getReader();
      let parts: Uint8Array[] = [];
      let size = 0;
      let discarded = false;
      const discard = () => {
        discarded = true;
        parts = [];
      };
      const body = new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            try {
              const part = await reader.read();
              if (part.done) {
                if (!discarded) {
                  try {
                    const bytes = new Uint8Array(size);
                    let offset = 0;
                    for (const chunk of parts) {
                      bytes.set(chunk, offset);
                      offset += chunk.byteLength;
                    }
                    const value = JSON.parse(
                      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
                    );
                    attempt.response = value;
                    const cost = value?.usage?.cost;
                    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0)
                      attempt.cost = cost;
                  } catch {
                    // Incomplete or invalid usage stays explicitly unknown.
                  }
                }
                discard();
                controller.close();
              } else {
                size += part.value.byteLength;
                // Largest production response budget; never retain an oversized body.
                if (size > 2 * 1024 * 1024) discard();
                if (!discarded) parts.push(part.value.slice());
                controller.enqueue(part.value);
              }
            } catch (error) {
              discard();
              controller.error(error);
            }
          },
          cancel(reason) {
            discard();
            return reader.cancel(reason);
          },
        },
        { highWaterMark: 0 },
      );
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
    { preconnect: originalFetch.preconnect },
  );
  return {
    requests,
    fetch: observedFetch,
    costs: () => ({
      knownCost: requests.reduce((sum, attempt) => sum + (attempt.cost ?? 0), 0),
      unknownCosts: requests.filter((attempt) => attempt.cost === null).length,
    }),
  };
}

/** One real production search, with evaluation-only transport/usage observation. */
export async function observeProposal(
  root: string,
  question: string,
  originalFetch: typeof fetch = fetch,
  credential = requireCredential,
) {
  const { requests, fetch: observedFetch, costs } = proposalObserver(originalFetch);
  const started = performance.now();
  try {
    const result = await search(
      root,
      readConfig(root),
      question,
      (inputs, model, key, dimensions, _request, _sleep, options) =>
        embed(inputs, model, key, dimensions, observedFetch, undefined, options),
      credential,
      {
        expansion: (query, key, options) => expand(query, key, options, observedFetch),
        reranking: (query, documents, model, key, options) =>
          rerank(query, documents, model, key, options, observedFetch),
      },
    );
    return {
      status: 'PASS',
      failure: undefined,
      result,
      requests,
      ...costs(),
      elapsedMs: performance.now() - started,
    };
  } catch (error) {
    return {
      status: 'FAIL',
      result: undefined,
      failure: { code: error instanceof AppError ? error.code : 'EVALUATION_FAILED' },
      requests,
      ...costs(),
      elapsedMs: performance.now() - started,
    };
  }
}

if (import.meta.main) {
  const [root, question] = Bun.argv.slice(2);
  if (!root || !question || Bun.argv.length !== 4) {
    process.stderr.write('Usage: bun proposal-observation.ts ROOT QUESTION\n');
    process.exitCode = 1;
  } else {
    const observation = await observeProposal(root, question);
    process.stdout.write(JSON.stringify(observation) + '\n');
    process.exitCode = observation.status === 'PASS' ? 0 : 1;
  }
}
