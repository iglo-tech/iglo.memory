import { readConfig } from '@/src/config';
import { AppError } from '@/src/errors';
import { search } from '@/src/search';
import { embed } from '@/src/embedding';
import { expand } from '@/src/expansion';
import { rerank } from '@/src/rerank';
import { requireCredential } from '@/src/credentials';

/** One real production search, with evaluation-only transport/usage observation. */
export async function observeProposal(
  root: string,
  question: string,
  originalFetch: typeof fetch = fetch,
  credential = requireCredential,
) {
  const requests: unknown[] = [];
  let knownCost = 0;
  let unknownCosts = 0;
  const started = performance.now();
  const observedFetch = Object.assign(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const began = performance.now();
      let response: Response;
      try {
        response = await originalFetch(url, init);
      } catch (error) {
        unknownCosts++;
        requests.push({
          endpoint: String(url),
          payload: JSON.parse(String(init?.body)),
          outcome: 'TRANSPORT_FAILED',
          elapsedMs: performance.now() - began,
        });
        throw error;
      }
      const value: unknown = await response
        .clone()
        .json()
        .catch(() => null);
      const usage =
        value !== null && typeof value === 'object' && 'usage' in value ? value.usage : null;
      const cost =
        usage !== null && typeof usage === 'object' && 'cost' in usage ? usage.cost : null;
      if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) knownCost += cost;
      else unknownCosts++;
      requests.push({
        endpoint: String(url),
        payload: JSON.parse(String(init?.body)),
        status: response.status,
        response: value,
        elapsedMs: performance.now() - began,
      });
      return response;
    },
    { preconnect: originalFetch.preconnect },
  );
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
      result,
      requests,
      knownCost,
      unknownCosts,
      elapsedMs: performance.now() - started,
    };
  } catch (error) {
    return {
      status: 'FAIL',
      failure: { code: error instanceof AppError ? error.code : 'EVALUATION_FAILED' },
      requests,
      knownCost,
      unknownCosts,
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
