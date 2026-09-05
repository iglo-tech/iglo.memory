import { Tiktoken } from 'js-tiktoken/lite';
import cl100k from 'js-tiktoken/ranks/cl100k_base';
import o200k from 'js-tiktoken/ranks/o200k_base';
import { check, hash, serialize } from '@/scripts/retrieval-eval/corpus';

let embedding: Tiktoken | undefined;
let chat: Tiktoken | undefined;
function validText(text: string) {
  for (const char of text) {
    const code = char.charCodeAt(0);
    check(char.length !== 1 || code < 0xd800 || code > 0xdfff, 'Invalid Unicode input');
  }
}
export function embeddingTokens(text: string): number {
  validText(text);
  embedding ??= new Tiktoken(cl100k);
  return embedding.encode(text, [], []).length;
}
// Serialized text only: provider-added chat framing is accounted for separately.
export function serializedChatTokens(value: unknown): number {
  const text = JSON.stringify(value);
  check(typeof text === 'string', 'Invalid serialized request');
  validText(text);
  chat ??= new Tiktoken(o200k);
  return chat.encode(text, [], []).length;
}
export function boundedContext(project: string, path: string, headings: string[], limit = 256) {
  check(Number.isSafeInteger(limit) && limit > 0, 'Invalid context budget');
  const full = [project, path, ...headings];
  full.forEach(validText);
  const digest = hash(serialize(full));
  const format = (fields: string[]) => `Context: ${JSON.stringify(fields)}\n\n`;
  const prefix = format(full);
  // Bound intermediate work for enormous metadata before invoking the tokenizer.
  if (prefix.length <= 4096 && embeddingTokens(prefix) <= limit)
    return { prefix, shortened: false, fullContextHash: digest };
  const previews = [project, path, headings.at(-1) ?? ''].map((value, i) => {
    const chars = Array.from(value);
    if (chars.length <= 1024) return value;
    return i === 1 ? `…${chars.slice(-1024).join('')}` : `${chars.slice(0, 1024).join('')}…`;
  });
  const marker = `context-sha256:${digest}`;
  for (;;) {
    const prefix = format([marker, ...previews]);
    if (embeddingTokens(prefix) <= limit)
      return { prefix, shortened: true, fullContextHash: digest };
    const sizes = previews.map((s) => Array.from(s).length);
    const longest = Math.max(...sizes);
    check(longest > 0, 'Context digest exceeds token budget');
    const index = sizes.indexOf(longest),
      chars = Array.from(previews[index]!);
    // Removing previews eventually leaves the digest and empty fields.
    previews[index] =
      index === 1
        ? chars.slice(Math.ceil(chars.length / 2)).join('')
        : chars.slice(0, Math.floor(chars.length / 2)).join('');
  }
}
export type TokenSpan = { start: number; end: number; text: string; tokens: number };
export function splitWrapped(text: string, prefix: string, limit: number): TokenSpan[] {
  check(Number.isSafeInteger(limit) && limit > 0, 'Invalid input budget');
  validText(text);
  check(embeddingTokens(prefix) <= limit, 'Wrapper exceeds token budget');
  const chars = Array.from(text),
    spans: TokenSpan[] = [];
  let start = 0;
  while (start < chars.length) {
    let low = 1,
      high = Math.min(chars.length - start, limit * 4, 32768),
      fitting = 0;
    // BPE counts need not be monotone. A found prefix is rechecked; maximality is
    // not required for losslessness or safety, and no skipped suffix is inferred.
    while (low <= high) {
      const length = Math.floor((low + high) / 2);
      if (embeddingTokens(prefix + chars.slice(start, start + length).join('')) <= limit) {
        fitting = length;
        low = length + 1;
      } else high = length - 1;
    }
    check(fitting > 0, 'Minimum source span exceeds token budget');
    let end = start + fitting;
    for (const boundary of [(c: string) => c === '\n', (c: string) => /\s/u.test(c)]) {
      let found = false;
      for (let i = end - 1; i >= start; i--)
        if (
          boundary(chars[i]!) &&
          embeddingTokens(prefix + chars.slice(start, i + 1).join('')) <= limit
        ) {
          end = i + 1;
          found = true;
          break;
        }
      if (found) break;
    }
    const body = chars.slice(start, end).join(''),
      tokens = embeddingTokens(prefix + body);
    check(tokens <= limit, 'Wrapped input exceeds token budget');
    spans.push({ start, end, text: body, tokens });
    start = end;
  }
  return spans;
}
