import type { Chunk } from '@/src/chunks';
import { AppError } from '@/src/errors';

export const LEXICAL_PROFILE = 'identifier-bm25-v1';
type Term = { df: number; postings: [string, number][] };
type Field = { totalLength: number; lengths: Record<string, number>; terms: Record<string, Term> };
export type LexicalIndex = {
  profile: typeof LEXICAL_PROFILE;
  count: number;
  fields: { body: Field; headings: Field; path: Field };
};
const weights = { body: 1, headings: 2, path: 2 } as const;
const fieldNames = ['body', 'headings', 'path'] as const;
const map = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;
const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** Unicode property escapes and default Unicode lowercasing; no locale or stemming. */
export function tokenize(text: string): string[] {
  const result: string[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}](?:[\p{L}\p{N}_./:@-]*[\p{L}\p{N}])?/gu)) {
    const token = match[0];
    const aliases = new Set([token.toLowerCase()]);
    for (const part of token.split(/[_./:@-]+/u)) {
      aliases.add(part.toLowerCase());
      for (const component of part
        .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
        .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
        .split(' '))
        aliases.add(component.toLowerCase());
    }
    result.push(...aliases);
  }
  return result;
}

export type TokenOccurrence = { term: string; start: number; end: number };

/** Codepoint ranges of complete tokens and their identifier aliases. */
export function tokenOccurrences(text: string): TokenOccurrence[] {
  const offsets = new Map<number, number>();
  let units = 0,
    points = 0;
  offsets.set(0, 0);
  for (const character of text) {
    units += character.length;
    offsets.set(units, ++points);
  }
  const result: TokenOccurrence[] = [];
  const add = (term: string, start: number) => {
    result.push({
      term: term.toLowerCase(),
      start: offsets.get(start)!,
      end: offsets.get(start + term.length)!,
    });
  };
  for (const match of text.matchAll(/[\p{L}\p{N}](?:[\p{L}\p{N}_./:@-]*[\p{L}\p{N}])?/gu)) {
    add(match[0], match.index);
    for (const part of match[0].matchAll(/[^_./:@-]+/gu)) {
      const start = match.index + part.index;
      add(part[0], start);
      let offset = start;
      for (const component of part[0]
        .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
        .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
        .split(' ')) {
        add(component, offset);
        offset += component.length;
      }
    }
  }
  return result;
}

export function buildLexical(chunks: Chunk[]): LexicalIndex {
  const fields = {} as LexicalIndex['fields'];
  const ids = new Set(chunks.map((chunk) => chunk.passageId));
  if (ids.size !== chunks.length) throw new AppError('INDEX_INVALID');
  for (const name of fieldNames) {
    const field: Field = { totalLength: 0, lengths: map(), terms: map() };
    for (const chunk of chunks) {
      const text =
        name === 'body' ? chunk.text : name === 'path' ? chunk.source : chunk.headings.join('\n');
      const tokens = tokenize(text);
      field.lengths[chunk.passageId] = tokens.length;
      field.totalLength += tokens.length;
      const frequencies = new Map<string, number>();
      for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
      for (const [token, frequency] of frequencies) {
        const term = own(field.terms, token) ?? { df: 0, postings: [] };
        term.df++;
        term.postings.push([chunk.passageId, frequency]);
        field.terms[token] = term;
      }
    }
    fields[name] = field;
  }
  return { profile: LEXICAL_PROFILE, count: chunks.length, fields };
}

function invalid(): never {
  throw new AppError('INDEX_INVALID');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
function keys(value: Record<string, unknown>, expected: readonly string[]) {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  )
    invalid();
}

/** Validate persisted statistics, never reconstruct them by tokenizing source bodies. */
export function validateLexical(value: unknown, chunks: Chunk[]): LexicalIndex {
  const index = record(value);
  keys(index, ['profile', 'count', 'fields']);
  if (index.profile !== LEXICAL_PROFILE || integer(index.count) !== chunks.length) invalid();
  const ids = new Set(chunks.map((chunk) => chunk.passageId));
  if (ids.size !== chunks.length) invalid();
  const fields = record(index.fields);
  keys(fields, fieldNames);
  for (const name of fieldNames) {
    const field = record(fields[name]);
    keys(field, ['totalLength', 'lengths', 'terms']);
    const lengths = record(field.lengths);
    keys(lengths, [...ids]);
    let total = 0;
    for (const id of ids) total += integer(lengths[id]);
    if (!Number.isSafeInteger(total) || integer(field.totalLength) !== total) invalid();
    const sums = new Map<string, number>();
    for (const [token, rawTerm] of Object.entries(record(field.terms))) {
      if (!token || token.toLowerCase() !== token) invalid();
      const term = record(rawTerm);
      keys(term, ['df', 'postings']);
      const df = integer(term.df);
      if (!df || df > ids.size || !Array.isArray(term.postings) || term.postings.length !== df)
        invalid();
      const seen = new Set<string>();
      for (const posting of term.postings as unknown[]) {
        if (!Array.isArray(posting) || posting.length !== 2) invalid();
        const [id, rawFrequency] = posting as unknown[];
        const frequency = integer(rawFrequency);
        if (typeof id !== 'string' || !ids.has(id) || seen.has(id) || !frequency) invalid();
        seen.add(id);
        const sum = (sums.get(id) ?? 0) + frequency;
        if (!Number.isSafeInteger(sum)) invalid();
        sums.set(id, sum);
      }
    }
    for (const id of ids) if ((sums.get(id) ?? 0) !== lengths[id]) invalid();
  }
  return value as LexicalIndex;
}

export function scoreLexical(
  index: LexicalIndex,
  query: string,
): { passageId: string; score: number }[] {
  const scores = new Map<string, number>();
  const queryTerms = new Set(tokenize(query));
  for (const name of fieldNames) {
    const field = index.fields[name];
    if (!field.totalLength || !index.count) continue;
    const average = field.totalLength / index.count;
    for (const token of queryTerms) {
      const term = own(field.terms, token);
      if (!term) continue;
      const idf = Math.log(1 + (index.count - term.df + 0.5) / (term.df + 0.5));
      for (const [id, frequency] of term.postings) {
        const length = own(field.lengths, id)!;
        const score =
          weights[name] *
          idf *
          ((frequency * 2.2) / (frequency + 1.2 * (0.25 + (0.75 * length) / average)));
        scores.set(id, (scores.get(id) ?? 0) + score);
      }
    }
  }
  return [...scores]
    .map(([passageId, score]) => ({ passageId, score }))
    .sort(
      (a, b) =>
        b.score - a.score || Buffer.compare(Buffer.from(a.passageId), Buffer.from(b.passageId)),
    );
}
