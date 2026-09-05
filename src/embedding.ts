import { AppError } from '@/src/errors';
import { record } from '@/src/files';
import { requestSearchJson } from '@/src/search-transport';
export const BASE_URL = 'https://openrouter.ai/api/v1';
export function validVector(value: unknown, dimensions?: number): number[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    (dimensions !== undefined && value.length !== dimensions) ||
    !value.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))
  )
    throw new AppError('EMBEDDING_FAILED');
  const vector: number[] = value.map((v) => Math.fround(v));
  if (!vector.every(Number.isFinite) || !vector.some((v) => v !== 0))
    throw new AppError('EMBEDDING_FAILED');
  return vector;
}
export function retryDelay(header: string | null, attempt: number, now = Date.now()): number {
  let server = 0;
  if (header !== null) {
    if (/^\d+$/.test(header.trim())) server = Number(header) * 1000;
    else {
      const date = Date.parse(header);
      if (Number.isFinite(date)) server = Math.max(0, date - now);
    }
  }
  return Math.max(1000 * 2 ** attempt, server);
}
export async function embed(
  inputs: string[],
  model: string,
  key: string,
  dimensions?: number,
  request: typeof fetch = fetch,
  sleep: (ms: number) => Promise<unknown> = (ms) => Bun.sleep(ms),
  options?: { deadline: number },
): Promise<number[][]> {
  if (options) {
    const body = await requestSearchJson(
      `${BASE_URL}/embeddings`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: inputs, encoding_format: 'float' }),
      },
      { ...options, maxBytes: 512 * 1024, code: 'EMBEDDING_FAILED' },
      request,
      sleep,
    );
    try {
      const vectors = parseEmbeddings(body, inputs.length, dimensions);
      if (performance.now() >= options.deadline) throw new AppError('SEARCH_TIMEOUT');
      return vectors;
    } catch (error) {
      if (performance.now() >= options.deadline) throw new AppError('SEARCH_TIMEOUT');
      if (error instanceof AppError && error.code === 'SEARCH_TIMEOUT') throw error;
      throw new AppError('EMBEDDING_FAILED', { stage: 'embedding', reason: 'invalid_response' });
    }
  }
  const deadline = performance.now() + 120_000;
  for (let attempt = 0; attempt < 4; attempt++) {
    let response: Response;
    let body: unknown;
    let retry = false;
    let delay = 1000 * 2 ** attempt;
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    try {
      response = await request(`${BASE_URL}/embeddings`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(Math.ceil(Math.min(30_000, remaining))),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: inputs, encoding_format: 'float' }),
      });
      if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
        retry = true;
        delay = retryDelay(response.headers.get('Retry-After'), attempt);
        await response.body?.cancel();
      } else if (!response.ok) {
        await response.body?.cancel();
        throw new AppError('EMBEDDING_FAILED');
      } else {
        try {
          body = await response.json();
        } catch (error) {
          if (
            error instanceof Error &&
            (error.name === 'TimeoutError' || error.name === 'AbortError')
          )
            throw error;
          throw new AppError('EMBEDDING_FAILED');
        }
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      retry = true;
    }
    if (!retry) {
      return parseEmbeddings(body, inputs.length, dimensions);
    }
    if (attempt === 3 || delay >= deadline - performance.now()) break;
    await sleep(delay);
  }
  throw new AppError('EMBEDDING_FAILED');
}

function parseEmbeddings(body: unknown, count: number, dimensions?: number): number[][] {
  if (!record(body) || !Array.isArray(body.data) || body.data.length !== count)
    throw new AppError('EMBEDDING_FAILED');
  // oxlint-disable-next-line unicorn/no-new-array -- Populate slots by validated response index.
  const vectors: number[][] = new Array(count);
  let expected = dimensions;
  for (const item of body.data as unknown[]) {
    if (
      !record(item) ||
      !Number.isInteger(item.index) ||
      (item.index as number) < 0 ||
      (item.index as number) >= count ||
      vectors[item.index as number]
    )
      throw new AppError('EMBEDDING_FAILED');
    const vector = validVector(item.embedding, expected);
    expected ??= vector.length;
    vectors[item.index as number] = vector;
  }
  return vectors;
}
