import { check, object } from '@/scripts/retrieval-eval/corpus';

export const allocation = {
  paraphrase: [8, 12],
  identifiers: [6, 9],
  ambiguous: [4, 6],
  suffix: [4, 6],
  facets: [4, 6],
  unanswerable: [4, 11],
} as const;
export type Slice = keyof typeof allocation;
export type Evidence = {
  id: string;
  source: string;
  start: number;
  end: number;
  grade: 0 | 1 | 2;
  facets: string[];
  reason: string;
};
export type Question = {
  id: string;
  project: string;
  question: string;
  family: string;
  slice: Slice;
  secondary: Slice[];
  split: 'development' | 'held-out';
  answerable: boolean;
  facets: string[];
  reason: string;
  evidence: Evidence[];
};
export type Labels = {
  version: 1;
  status: 'draft' | 'reviewed';
  reviews: { reviewer: string; kind: 'human'; revision: string }[];
  adjudication: string | null;
  questions: Question[];
};
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((v) => typeof v === 'string' && v.length > 0) &&
  new Set(value).size === value.length;
export function validateLabels(
  value: unknown,
  sources: Map<string, string>,
  mode: 'development' | 'complete',
): Labels {
  const root = object(value);
  check(
    root.version === 1 &&
      (root.status === 'draft' || root.status === 'reviewed') &&
      Array.isArray(root.questions),
    'Invalid labels',
  );
  check(
    Array.isArray(root.reviews) &&
      (root.adjudication === null || typeof root.adjudication === 'string'),
    'Missing review ledger',
  );
  const reviewers = new Set<string>();
  for (const item of root.reviews) {
    const r = object(item);
    check(
      r.kind === 'human' &&
        typeof r.reviewer === 'string' &&
        r.reviewer.trim() &&
        typeof r.revision === 'string' &&
        r.revision.trim(),
      'Invalid human review record',
    );
    reviewers.add(r.reviewer);
  }
  if (root.status === 'reviewed')
    check(
      reviewers.size >= 2 && typeof root.adjudication === 'string' && root.adjudication.trim(),
      'Two human reviews and adjudication required',
    );
  const ids = new Set<string>();
  const families = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const item of root.questions) {
    const q = object(item);
    for (const key of ['id', 'project', 'question', 'family', 'reason'])
      check(typeof q[key] === 'string' && (q[key] as string).trim(), `Invalid ${key}`);
    check(
      typeof q.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(q.id) && !ids.has(q.id),
      'Duplicate/unsafe question ID',
    );
    ids.add(q.id);
    check(
      typeof q.slice === 'string' &&
        Object.hasOwn(allocation, q.slice) &&
        strings(q.secondary) &&
        q.secondary.every((s) => Object.hasOwn(allocation, s)),
      'Invalid slices',
    );
    check(
      q.split === 'development' || (mode === 'complete' && q.split === 'held-out'),
      'Held-out inputs forbidden in development runner',
    );
    check(
      typeof q.answerable === 'boolean' && strings(q.facets) && Array.isArray(q.evidence),
      'Invalid question',
    );
    check(q.answerable === (q.slice !== 'unanswerable'), 'Answerability/slice mismatch');
    check(
      [...sources.keys()].some((key) => key.startsWith(`${q.project}/`)),
      'Unknown project',
    );
    const family = String(q.family);
    check(
      !families.has(family) || families.get(family) === q.split,
      'Intent family crosses splits',
    );
    families.set(family, q.split);
    const key = `${q.split}/${q.slice}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const evidenceIds = new Set<string>();
    const spans = new Set<string>();
    for (const item of q.evidence) {
      const e = object(item);
      check(
        typeof e.id === 'string' && e.id.length > 0 && !evidenceIds.has(e.id),
        'Duplicate evidence ID',
      );
      evidenceIds.add(e.id);
      check(
        typeof e.source === 'string' && typeof e.reason === 'string' && e.reason.trim(),
        'Invalid evidence',
      );
      const text = sources.get(`${q.project}/${e.source}`);
      check(
        text !== undefined &&
          Number.isSafeInteger(e.start) &&
          Number.isSafeInteger(e.end) &&
          Number(e.start) >= 0 &&
          Number(e.end) > Number(e.start) &&
          Number(e.end) <= Array.from(text).length,
        'Invalid evidence span',
      );
      check(e.grade === 0 || e.grade === 1 || e.grade === 2, 'Invalid grade');
      check(
        strings(e.facets) && e.facets.every((f) => (q.facets as string[]).includes(f)),
        'Unknown facet',
      );
      const span = `${e.source}/${e.start}/${e.end}`;
      check(!spans.has(span), 'Duplicate evidence unit');
      spans.add(span);
    }
    const evidence = q.evidence as Evidence[];
    check(
      !q.answerable || evidence.some((e) => e.grade === 2),
      'Answerable question needs direct evidence',
    );
    check(
      q.answerable || evidence.every((e) => e.grade === 0),
      'Refuting evidence makes question answerable',
    );
    check(
      (q.facets as string[]).every((f) =>
        evidence.some((e) => e.grade > 0 && e.facets.includes(f)),
      ),
      'Uncovered facet',
    );
  }
  for (const [slice, totals] of Object.entries(allocation)) {
    check(
      counts.get(`development/${slice}`) === totals[0],
      `Wrong development allocation: ${slice}`,
    );
    if (mode === 'complete')
      check(counts.get(`held-out/${slice}`) === totals[1], `Wrong held-out allocation: ${slice}`);
  }
  check(root.questions.length === (mode === 'complete' ? 80 : 30), 'Wrong question total');
  return value as Labels;
}
