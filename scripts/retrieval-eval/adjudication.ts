import { check, hash, object, serialize } from '@/scripts/retrieval-eval/corpus';
import { validateLabels, type Question } from '@/scripts/retrieval-eval/labels';
import type { Excerpt } from '@/scripts/retrieval-eval/scoring';

export type EvidenceReview = {
  questions: Map<string, Question>;
  resolve: (question: string, excerpt: Excerpt) => Excerpt;
};
export const excerptKey = (question: string, source: string, text: string) =>
  hash(serialize([question, source, text]));

export function validateAdjudication(
  value: unknown,
  expected: { corpusHash: string; labelsHash: string },
  original: Question[],
  sources: Map<string, string>,
): EvidenceReview {
  const root = object(value);
  check(
    root.version === 1 &&
      root.corpusHash === expected.corpusHash &&
      root.labelsHash === expected.labelsHash,
    'Adjudication frozen input mismatch',
  );
  const labels = validateLabels(root.labels, sources, 'development');
  check(labels.status === 'reviewed', 'Adjudication requires reviewed labels');
  const questions = new Map(labels.questions.map((q) => [q.id, q]));
  check(questions.size === original.length, 'Adjudication question mismatch');
  for (const q of original) {
    const revised = questions.get(q.id);
    check(revised, 'Adjudication missing question');
    const contract = (item: Question) => ({ ...item, evidence: [], reason: '' });
    check(
      serialize(contract(q)) === serialize(contract(revised)),
      'Adjudication changed question contract',
    );
    for (const evidence of q.evidence)
      check(
        revised.evidence.some((e) => serialize(e) === serialize(evidence)),
        'Adjudication changed original evidence',
      );
  }
  check(Array.isArray(root.mappings), 'Missing adjudication mappings');
  const mappings = new Map<string, Excerpt>();
  for (const item of root.mappings) {
    const row = object(item);
    check(typeof row.question === 'string', 'Invalid mapping question');
    const question = questions.get(row.question);
    check(question, 'Unknown mapping question');
    check(
      typeof row.source === 'string' &&
        typeof row.text === 'string' &&
        row.text.length > 0 &&
        typeof row.reason === 'string' &&
        row.reason.trim(),
      'Invalid mapping evidence',
    );
    const source = row.source as string,
      text = row.text as string,
      body = sources.get(`${question.project}/${source}`);
    check(body !== undefined, 'Unknown mapping source');
    check(
      row.misleading === null || typeof row.misleading === 'boolean',
      'Invalid misleading judgment',
    );
    const unresolved = row.start === null && row.end === null;
    if (!unresolved)
      check(
        Number.isSafeInteger(row.start) &&
          Number.isSafeInteger(row.end) &&
          Number(row.start) >= 0 &&
          Number(row.end) > Number(row.start) &&
          Number(row.end) <= Array.from(body).length &&
          Array.from(body).slice(Number(row.start), Number(row.end)).join('') === text,
        'Adjudicated span does not reproduce presented text',
      );
    const key = excerptKey(row.question, source, text);
    check(!mappings.has(key), 'Duplicate adjudication mapping');
    mappings.set(key, {
      source,
      text,
      start: unresolved ? null : Number(row.start),
      end: unresolved ? null : Number(row.end),
      mapping: unresolved ? 'adjudication' : 'exact',
      misleading: row.misleading as boolean | null,
    });
  }
  return {
    questions,
    resolve: (question, excerpt) =>
      mappings.get(excerptKey(question, excerpt.source, excerpt.text)) ?? excerpt,
  };
}
