import { test, expect } from 'bun:test';
import { validateAdjudication } from '@/scripts/retrieval-eval/adjudication';
import { allocation, type Labels, type Question } from '@/scripts/retrieval-eval/labels';
import { mapExcerpt, score } from '@/scripts/retrieval-eval/scoring';

const source = '.agent/knowledge/a.md';
const sources = new Map([[`p/${source}`, 'aa😀bb aa😀bb']]);
const expected = { corpusHash: 'corpus-fixture', labelsHash: 'labels-fixture' };
function fixture() {
  const original: Question[] = [];
  for (const [slice, [count]] of Object.entries(allocation))
    for (let i = 0; i < count; i++) {
      const id = `q${original.length}`;
      original.push({
        id,
        project: 'p',
        question: `Question ${id}`,
        family: id,
        slice: slice as Question['slice'],
        secondary: [],
        split: 'development',
        answerable: slice !== 'unanswerable',
        facets: [],
        reason: 'fixture',
        evidence:
          slice === 'unanswerable'
            ? []
            : [
                {
                  id: 'original',
                  source,
                  start: 0,
                  end: 2,
                  grade: 2,
                  facets: [],
                  reason: 'fixture direct',
                },
              ],
      });
    }
  const labels: Labels = {
    version: 1,
    status: 'reviewed',
    reviews: ['one', 'two'].map((reviewer) => ({ reviewer, kind: 'agent', revision: 'fixture' })),
    adjudication: 'fixture-review',
    questions: structuredClone(original),
  };
  labels.questions[0]!.evidence.push({
    id: 'partial',
    source,
    start: 3,
    end: 5,
    grade: 1,
    facets: [],
    reason: 'partial evidence fixture',
  });
  return {
    original,
    ledger: {
      version: 1,
      ...expected,
      labels,
      mappings: [
        {
          question: 'q0',
          source,
          text: 'bb',
          start: 3 as number | null,
          end: 5 as number | null,
          misleading: false as boolean | null,
          reason: 'first occurrence from surrounding context',
        },
      ],
    },
  };
}

test('adjudication resolves reviewed Unicode coordinates without replacing source observations', () => {
  const { original, ledger } = fixture();
  const raw = mapExcerpt(source, 'bb', sources.get(`p/${source}`));
  expect(score(original[0]!, [raw], false).unresolved).toBe(true);
  const review = validateAdjudication(ledger, expected, original, sources);
  const resolved = review.resolve('q0', raw);
  expect(resolved).toMatchObject({ start: 3, end: 5, mapping: 'exact', misleading: false });
  const metrics = score(review.questions.get('q0')!, [resolved, resolved], false);
  expect(metrics.unresolved).toBe(false);
  expect(metrics.spanRecall8).toBe(0.5);
  expect(metrics.ndcg8).toBeCloseTo(1 / (3 + 1 / Math.log2(3)));
  expect(raw.mapping).toBe('adjudication');
  expect(review.resolve('q1', raw)).toBe(raw);
});

test('adjudication rejects altered inputs, question meaning, original units and invalid mappings', () => {
  const check = (
    change: (ledger: ReturnType<typeof fixture>['ledger']) => void,
    message: string,
  ) => {
    const { original, ledger } = fixture();
    change(ledger);
    expect(() => validateAdjudication(ledger, expected, original, sources)).toThrow(message);
  };
  check((l) => {
    l.labelsHash = 'changed';
  }, 'input mismatch');
  check((l) => {
    l.labels.questions[0]!.question = 'Different question';
  }, 'question contract');
  check((l) => {
    l.labels.questions[0]!.evidence[0]!.reason = 'Rejudged';
  }, 'original evidence');
  check((l) => {
    l.labels.status = 'draft';
  }, 'reviewed labels');
  check((l) => {
    l.mappings[0]!.start = 2;
  }, 'span');
  check((l) => {
    l.mappings[0]!.start = null;
  }, 'span');
  check((l) => {
    l.mappings[0]!.question = 'absent';
  }, 'Unknown mapping question');
  check((l) => {
    l.mappings.push({ ...l.mappings[0]! });
  }, 'Duplicate');
});

test('adjudicated harm stays separate from unknown coordinates and absent judgments', () => {
  const { original, ledger } = fixture();
  const q = original.find((q) => !q.answerable)!;
  ledger.mappings[0] = {
    ...ledger.mappings[0]!,
    question: q.id,
    start: null,
    end: null,
    misleading: true,
  };
  const review = validateAdjudication(ledger, expected, original, sources);
  const raw = mapExcerpt(source, 'bb', sources.get(`p/${source}`));
  expect(score(q, [raw], false).misleading).toBeNull();
  const metrics = score(q, [review.resolve(q.id, raw)], false);
  expect(metrics.misleading).toBe(1);
  expect(metrics.unresolved).toBe(true);
  expect(score(q, [review.resolve(q.id, raw)], true).misleading).toBeNull();
});
