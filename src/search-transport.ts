import { AppError } from '@/src/errors';

export type SearchTransportOptions = {
  deadline: number;
  maxBytes: number;
  code: 'EMBEDDING_FAILED' | 'RERANK_FAILED' | 'EXPANSION_FAILED';
  signal?: AbortSignal;
};
type Reason = 'transport' | 'rate_limit' | 'provider' | 'invalid_response' | 'budget';

function checkDeadline(deadline: number) {
  if (performance.now() >= deadline) throw new AppError('SEARCH_TIMEOUT');
}
function retryAfter(header: string | null): number {
  if (header === null) return 250;
  const seconds = Number(header);
  const duration =
    header.trim() !== '' && Number.isFinite(seconds) && seconds >= 0
      ? seconds * 1000
      : Date.parse(header) - Date.now();
  return Number.isFinite(duration) ? Math.max(250, duration) : 250;
}
function cancel(body: ReadableStream<Uint8Array> | null) {
  if (body && !body.locked) void body.cancel().catch(() => {});
}

// The timer races body reads as well as fetch: an uncooperative stream cannot
// keep search alive after the attempt deadline. No provider text escapes here.
export async function requestSearchJson(
  url: string,
  init: RequestInit,
  options: SearchTransportOptions,
  request: typeof fetch = fetch,
  sleep?: (ms: number) => Promise<unknown>,
): Promise<unknown> {
  const { deadline, maxBytes, code, signal } = options;
  const failure = (reason: Reason) =>
    new AppError(code, {
      stage:
        code === 'EMBEDDING_FAILED'
          ? 'embedding'
          : code === 'EXPANSION_FAILED'
            ? 'expansion'
            : 'rerank',
      reason,
    });
  const checkActive = () => {
    checkDeadline(deadline);
    if (signal?.aborted) throw failure('transport');
  };
  checkActive();
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw failure('budget');
  for (let attempt = 0; attempt < 2; attempt++) {
    checkActive();
    const controller = new AbortController();
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reason: Reason = 'transport';
    let delay = 250;
    let onAbort: (() => void) | undefined;
    try {
      const work = async () => {
        response = await request(url, { ...init, redirect: 'error', signal: controller.signal });
        if (controller.signal.aborted) {
          cancel(response.body);
          throw failure('transport');
        }
        if (!response.ok) {
          cancel(response.body);
          if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
            reason = response.status === 429 ? 'rate_limit' : 'provider';
            delay = retryAfter(response.headers.get('Retry-After'));
            return { retry: true as const };
          }
          throw failure('provider');
        }
        const declared = response.headers.get('Content-Length');
        if (declared !== null && Number(declared) > maxBytes) throw failure('budget');
        const parts: Uint8Array[] = [];
        let length = 0;
        reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const part = await reader.read();
            if (controller.signal.aborted) throw failure('transport');
            if (part.done) break;
            length += part.value.byteLength;
            if (length > maxBytes) throw failure('budget');
            parts.push(part.value);
          }
        }
        checkActive();
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const part of parts) {
          bytes.set(part, offset);
          offset += part.byteLength;
        }
        let value: unknown;
        try {
          value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        } catch {
          throw failure('invalid_response');
        }
        checkActive();
        return { retry: false as const, value };
      };
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            controller.abort();
            reject(new Error('Search attempt expired'));
          },
          Math.ceil(Math.min(10_000, deadline - performance.now())),
        );
      });
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => {
          controller.abort();
          reject(failure('transport'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      });
      checkActive();
      const result = await Promise.race([work(), timeout, aborted]);
      checkActive();
      if (!result.retry) return result.value;
    } catch (error) {
      checkActive();
      if (error instanceof AppError) throw error;
      reason = 'transport';
    } finally {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      else if (response) cancel(response.body);
    }
    checkActive();
    if (attempt === 1 || delay >= deadline - performance.now()) throw failure(reason);
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    let sleepTimer: ReturnType<typeof setTimeout> | undefined;
    let onDelayAbort: (() => void) | undefined;
    try {
      await Promise.race([
        sleep
          ? sleep(delay)
          : new Promise<void>((resolve) => {
              sleepTimer = setTimeout(resolve, delay);
            }),
        new Promise<never>((_, reject) => {
          onDelayAbort = () => reject(failure('transport'));
          signal?.addEventListener('abort', onDelayAbort, { once: true });
          if (signal?.aborted) onDelayAbort();
        }),
        new Promise<never>((_, reject) => {
          delayTimer = setTimeout(
            () => reject(new AppError('SEARCH_TIMEOUT')),
            Math.ceil(deadline - performance.now()),
          );
        }),
      ]);
    } catch (error) {
      checkActive();
      if (error instanceof AppError) throw error;
      throw failure('transport');
    } finally {
      clearTimeout(delayTimer);
      clearTimeout(sleepTimer);
      if (onDelayAbort) signal?.removeEventListener('abort', onDelayAbort);
    }
  }
  throw failure('transport');
}
