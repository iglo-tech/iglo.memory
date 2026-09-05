import { test, expect } from 'bun:test';
import { summarize, compare, queryMeans, type Measurement } from '@/scripts/retrieval-eval/report';
import { score, mapExcerpt } from '@/scripts/retrieval-eval/scoring';
import type { Question } from '@/scripts/retrieval-eval/labels';
const q: Question = {
  id: 'a',
  project: 'p',
  question: 'Question',
  family: 'f',
  slice: 'paraphrase',
  secondary: [],
  split: 'development',
  answerable: true,
  facets: ['f'],
  reason: 'fixture',
  evidence: [
    {
      id: 'e',
      source: '.agent/knowledge/a.md',
      start: 0,
      end: 2,
      grade: 2,
      facets: ['f'],
      reason: 'direct',
    },
  ],
};
const no: Question = {
  ...q,
  id: 'n',
  slice: 'unanswerable',
  answerable: false,
  facets: [],
  evidence: [],
};
function observation(
  question: Question,
  repetition: number,
  kind: 'useful' | 'empty' | 'failed' | 'unknown',
): Measurement {
  return {
    question: question.id,
    repetition,
    elapsedMs: (repetition + 1) * 10,
    metrics: score(
      question,
      kind === 'useful'
        ? [mapExcerpt('.agent/knowledge/a.md', 'aa', 'aa')]
        : kind === 'unknown'
          ? [mapExcerpt('unknown', 'x', undefined)]
          : [],
      kind === 'failed',
    ),
  };
}
test('query grouping includes errors and separates unanswerable denominators', () => {
  const rows = [
    observation(q, 0, 'useful'),
    observation(q, 1, 'failed'),
    observation(q, 2, 'empty'),
    observation(no, 0, 'failed'),
    observation(no, 1, 'empty'),
    observation(no, 2, 'empty'),
  ];
  const summary = summarize([q, no], rows, 3);
  expect(summary.overall.metrics.useful8).toEqual({
    mean: 1 / 3,
    scoredQueries: 1,
    eligibleQueries: 1,
    missingQueries: 0,
  });
  expect(summary.overall).toMatchObject({
    queries: 2,
    observations: 6,
    failures: 2,
    unanswerableSuccesses: 2,
    unanswerableFailures: 1,
  });
  expect(summary.overall.metrics.nonempty.mean).toBeNull();
  expect(summary.overall.harm).toMatchObject({
    successfulObservations: 2,
    nonemptyRateAmongSuccesses: 0,
    misleadingJudgedSuccesses: 2,
    misleadingRateAmongJudgedSuccesses: 0,
  });
  expect(summary.timing).toMatchObject({
    samples: 6,
    p50: 20,
    p95: 30,
    max: 30,
    representative: true,
  });
  expect(summary.slices.paraphrase?.queries).toBe(1);
});
test('unknown or missing repeats invalidate the query mean instead of shrinking denominator', () => {
  const summary = summarize([q], [observation(q, 0, 'useful'), observation(q, 1, 'unknown')], 3);
  expect(summary.overall.metrics.useful8).toMatchObject({
    mean: null,
    scoredQueries: 0,
    missingQueries: 1,
  });
  expect(summary.timing.representative).toBe(false);
  expect(() =>
    queryMeans([q], [observation(q, 0, 'empty'), observation(q, 0, 'failed')], 3),
  ).toThrow('Duplicate');
});
test('paired comparison resamples query means rather than repetitions', () => {
  const second = { ...q, id: 'b', family: 'g' };
  const baseline = [q, second].flatMap((q) => [0, 1, 2].map((r) => observation(q, r, 'empty')));
  const proposal = [q, second].flatMap((q) => [0, 1, 2].map((r) => observation(q, r, 'useful')));
  const result = compare([q, second], baseline, proposal, 3);
  expect(result.useful8).toMatchObject({
    pairedQueries: 2,
    missingQueries: 0,
    paired: { queries: 2, wins: 2, ties: 0, losses: 0, meanDelta: 1, interval95: [1, 1] },
  });
  expect(compare([q], [], [], 3).useful8?.paired).toBeNull();
});
