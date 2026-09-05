import { Tokenizer } from '@huggingface/tokenizers';
import { Tiktoken } from 'js-tiktoken/lite';
import cl100k from 'js-tiktoken/ranks/cl100k_base';
import tokenizerJSON from '@/assets/tokenizers/qwen3-embedding/tokenizer.json';
import tokenizerConfig from '@/assets/tokenizers/qwen3-embedding/tokenizer_config.json';
import { AppError } from '@/src/errors';

export const QWEN_MODEL = 'qwen/qwen3-embedding-8b';
export const DOCUMENT_FORMAT = 'context-json-v2';
const revision = '1d8ad4ca9b3dd8059ad90a75d4983776a23d44af';
let qwen: Tokenizer | undefined;
let voyage: Tokenizer | undefined;
let openai: Tiktoken | undefined;
const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
function valid(text: string) {
  if (!text.isWellFormed()) throw new AppError('SOURCE_INVALID');
}
export function voyageTokens(text: string): number {
  valid(text);
  voyage ??= new Tokenizer(
    {
      ...tokenizerJSON,
      post_processor: {
        type: 'ByteLevel',
        add_prefix_space: false,
        trim_offsets: false,
        use_regex: false,
      },
    },
    tokenizerConfig,
  );
  return voyage.encode(text, { add_special_tokens: true }).ids.length;
}
export function budgetFor(model: string = QWEN_MODEL) {
  const isQwen = model === QWEN_MODEL;
  const isOpenAI = ['openai/text-embedding-3-small', 'openai/text-embedding-3-large'].includes(
    model,
  );
  const known = isQwen || isOpenAI;
  const count = (text: string): number => {
    valid(text);
    if (isQwen) {
      qwen ??= new Tokenizer(tokenizerJSON, tokenizerConfig);
      return qwen.encode(text, { add_special_tokens: true }).ids.length;
    }
    if (isOpenAI) {
      openai ??= new Tiktoken(cl100k);
      return openai.encode(text, [], []).length;
    }
    return bytes(text);
  };
  const limit = known ? 8192 : 2048;
  const context = (project: string, source: string, headings: string[]): string => {
    const full = [project, source, ...headings];
    full.forEach(valid);
    const format = (fields: string[]) => `Context: ${JSON.stringify(fields)}\n\n`;
    const complete = format(full);
    // ASCII byte-level BPE cannot emit more tokens than bytes, plus Qwen EOS.
    // This proves short metadata fits without repeating tokenizer work per passage.
    // Non-ASCII must use the counter because NFC can change its byte length.
    if (
      complete.length + (isQwen ? 1 : 0) <= 256 &&
      Array.from(complete).every((char) => char.charCodeAt(0) < 128)
    )
      return complete;
    if (complete.length <= 4096 && count(complete) <= 256) return complete;
    const digest = new Bun.CryptoHasher('sha256').update(JSON.stringify(full)).digest('hex');
    const previews = [project, source, headings.at(-1) ?? ''].map((value, index) => {
      const chars = Array.from(value);
      if (chars.length <= 1024) return value;
      return index === 1 ? '…' + chars.slice(-1024).join('') : chars.slice(0, 1024).join('') + '…';
    });
    for (;;) {
      const prefix = format([`context-sha256:${digest}`, ...previews]);
      if (count(prefix) <= 256) return prefix;
      const lengths = previews.map((value) => Array.from(value).length);
      const longest = Math.max(...lengths);
      if (!longest) throw new AppError('SOURCE_INVALID');
      const index = lengths.indexOf(longest);
      const chars = Array.from(previews[index]!);
      previews[index] =
        index === 1
          ? chars.slice(Math.ceil(chars.length / 2)).join('')
          : chars.slice(0, Math.floor(chars.length / 2)).join('');
    }
  };
  return {
    count,
    context,
    tokenizerVersion: isQwen
      ? `qwen3-${revision}-eos-v1`
      : isOpenAI
        ? 'cl100k-base-js-tiktoken-1.0.21'
        : 'utf8-byte-budget-v1',
    queryFormatVersion: isQwen ? 'qwen-documentation-query-v1' : 'plain-query-v1',
    formatQuery(question: string): string {
      if (!question.isWellFormed() || !question.trim()) throw new AppError('QUERY_TOO_LARGE');
      const input = isQwen
        ? 'Instruct: Given a question about project documentation, retrieve relevant passages that answer the question\nQuery: ' +
          question
        : question;
      if (
        count(input) > limit ||
        voyageTokens(question) > 2048 ||
        bytes(JSON.stringify(question)) > 16384
      )
        throw new AppError('QUERY_TOO_LARGE');
      return input;
    },
    fitsDocument(prefix: string, body: string): boolean {
      const input = prefix + body;
      valid(input);
      return (
        count(input) <= limit &&
        bytes(JSON.stringify(input)) <= 32768 &&
        voyageTokens(input) <= 4096
      );
    },
    batches(inputs: string[]): string[][] {
      const batches: string[][] = [];
      let batch: string[] = [],
        total = 0;
      for (const input of inputs) {
        if (!input.isWellFormed() || !input.length) throw new AppError('EMBEDDING_FAILED');
        const tokens = count(input);
        if (tokens > limit) throw new AppError('EMBEDDING_FAILED');
        if (
          batch.length &&
          (batch.length >= (isQwen ? 32 : isOpenAI ? 64 : 1) ||
            total + tokens > (isQwen ? 32768 : isOpenAI ? 300000 : 2048))
        ) {
          batches.push(batch);
          batch = [];
          total = 0;
        }
        batch.push(input);
        total += tokens;
      }
      if (batch.length) batches.push(batch);
      return batches;
    },
  };
}
