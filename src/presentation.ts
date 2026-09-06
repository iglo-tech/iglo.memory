import { AppError } from '@/src/errors';
import { tokenize, tokenOccurrences } from '@/src/lexical';
import { sourcePosition, type Snapshot, type StoredChunk } from '@/src/store';

export function excerpt(snapshot: Snapshot, chunk: StoredChunk, originalQuery: string) {
  const characters = Array.from(chunk.text);
  const size = Math.min(400, characters.length);
  const lastStart = characters.length - size;
  const weights = new Map<string, number>();
  for (const term of new Set(tokenize(originalQuery))) {
    if (!Object.hasOwn(snapshot.lexical.fields.body.terms, term)) continue;
    const { df } = snapshot.lexical.fields.body.terms[term]!;
    weights.set(term, Math.log(1 + (snapshot.lexical.count - df + 0.5) / (df + 0.5)));
  }
  // An occurrence is contained for every integer start in [end-size, start].
  // Sweep only those boundaries; repeated occurrences count once per query term.
  const events = new Map<number, { term: string; delta: number }[]>();
  const event = (position: number, term: string, delta: number) => {
    const list = events.get(position) ?? [];
    list.push({ term, delta });
    events.set(position, list);
  };
  for (const occurrence of tokenOccurrences(chunk.text)) {
    if (!weights.has(occurrence.term)) continue;
    const low = Math.max(0, occurrence.end - size);
    const high = Math.min(lastStart, occurrence.start);
    if (low > high) continue;
    event(low, occurrence.term, 1);
    event(high + 1, occurrence.term, -1);
  }
  const counts = new Map<string, number>();
  let start = 0,
    best = 0;
  for (const position of [...events.keys()].sort((a, b) => a - b)) {
    if (position > lastStart) break;
    for (const { term, delta } of events.get(position)!)
      counts.set(term, (counts.get(term) ?? 0) + delta);
    // Stable summation makes equal term sets tie exactly, independent of history.
    let score = 0;
    for (const [term, weight] of weights) if ((counts.get(term) ?? 0) > 0) score += weight;
    if (score > best) {
      best = score;
      start = position;
    }
  }
  const end = start + size;
  const source = snapshot.sources.find((item) => item.source === chunk.source);
  if (!source) throw new AppError('INDEX_INVALID');
  const absoluteStart = chunk.start + start,
    absoluteEnd = chunk.start + end;
  const from = sourcePosition(source, absoluteStart),
    to = sourcePosition(source, absoluteEnd);
  return {
    snippet:
      (start > 0 ? '…' : '') +
      characters.slice(start, end).join('') +
      (end < characters.length ? '…' : ''),
    snippetSpan: {
      start: absoluteStart,
      end: absoluteEnd,
      startLine: from.line,
      startColumn: from.column,
      endLine: to.line,
      endColumn: to.column,
    },
  };
}
