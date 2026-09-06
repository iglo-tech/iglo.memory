import { check } from '@/scripts/retrieval-eval/corpus';
import type { Question } from '@/scripts/retrieval-eval/labels';
import { pairedBootstrap, type score } from '@/scripts/retrieval-eval/scoring';

export type Measurement = {
  question: string;
  repetition: number;
  elapsedMs: number;
  metrics: ReturnType<typeof score>;
};
const names = [
  'useful1',
  'useful3',
  'useful5',
  'useful8',
  'ndcg8',
  'supporting',
  'spanRecall8',
  'facetRecall8',
  'nonempty',
  'misleading',
] as const;
type Metric = (typeof names)[number];
function values(row: Measurement): Record<Metric, number | null> {
  const m = row.metrics;
  return {
    useful1: m.useful?.[0] ?? null,
    useful3: m.useful?.[1] ?? null,
    useful5: m.useful?.[2] ?? null,
    useful8: m.useful?.[3] ?? null,
    ndcg8: m.ndcg8,
    supporting: m.supporting,
    spanRecall8: m.spanRecall8,
    facetRecall8: m.facetRecall8,
    nonempty: m.nonempty,
    misleading: m.misleading,
  };
}
const average = (numbers: number[]) =>
  numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
export function queryMeans(questions: Question[], rows: Measurement[], repetitions: number) {
  check(Number.isSafeInteger(repetitions) && repetitions > 0, 'Invalid expected repetitions');
  const known = new Set(questions.map((q) => q.id));
  check(known.size === questions.length, 'Duplicate report question');
  const groups = new Map<string, Measurement[]>();
  for (const row of rows) {
    check(
      known.has(row.question) &&
        Number.isSafeInteger(row.repetition) &&
        row.repetition >= 0 &&
        row.repetition < repetitions &&
        Number.isFinite(row.elapsedMs) &&
        row.elapsedMs >= 0,
      'Invalid measurement',
    );
    const group = groups.get(row.question) ?? [];
    check(!group.some((r) => r.repetition === row.repetition), 'Duplicate repetition');
    group.push(row);
    groups.set(row.question, group);
  }
  return questions.map((question) => {
    const observations = groups.get(question.id) ?? [];
    const complete = observations.length === repetitions;
    const metrics = {} as Record<Metric, number | null>;
    for (const name of names) {
      const measured = observations.map((row) => values(row)[name]);
      // Never silently drop an unknown repeat and keep its better-known peers.
      metrics[name] =
        complete && measured.every((v): v is number => v !== null) ? average(measured) : null;
    }
    return {
      id: question.id,
      project: question.project,
      slice: question.slice,
      answerable: question.answerable,
      hasFacets: question.facets.length > 0,
      complete,
      observations: observations.length,
      failures: observations.filter((r) => r.metrics.failed).length,
      unresolved: observations.filter((r) => r.metrics.unresolved).length,
      metrics,
    };
  });
}
export function summarize(questions: Question[], rows: Measurement[], repetitions: number) {
  const queries = queryMeans(questions, rows, repetitions);
  const group = (items: typeof queries) => {
    const metrics = {} as Record<
      Metric,
      {
        mean: number | null;
        scoredQueries: number;
        eligibleQueries: number;
        missingQueries: number;
      }
    >;
    for (const name of names) {
      const eligible = items.filter((q) =>
        name === 'nonempty' || name === 'misleading'
          ? !q.answerable
          : q.answerable && (name !== 'facetRecall8' || q.hasFacets),
      );
      const measured = eligible.map((q) => q.metrics[name]).filter((v): v is number => v !== null);
      metrics[name] = {
        mean: average(measured),
        scoredQueries: measured.length,
        eligibleQueries: eligible.length,
        missingQueries: eligible.length - measured.length,
      };
    }
    const absent = new Set(items.filter((q) => !q.answerable).map((q) => q.id));
    const successes = rows.filter((r) => absent.has(r.question) && !r.metrics.failed);
    const judged = successes.filter((r) => r.metrics.misleading !== null);
    return {
      harm: {
        successfulObservations: successes.length,
        nonemptyRateAmongSuccesses: average(successes.map((r) => r.metrics.nonempty!)),
        misleadingJudgedSuccesses: judged.length,
        misleadingUnknownSuccesses: successes.length - judged.length,
        misleadingRateAmongJudgedSuccesses: average(judged.map((r) => r.metrics.misleading!)),
      },
      queries: items.length,
      answerable: items.filter((q) => q.answerable).length,
      unanswerable: items.filter((q) => !q.answerable).length,
      expectedObservations: items.length * repetitions,
      observations: items.reduce((n, q) => n + q.observations, 0),
      failures: items.reduce((n, q) => n + q.failures, 0),
      unanswerableFailures: items.filter((q) => !q.answerable).reduce((n, q) => n + q.failures, 0),
      unanswerableSuccesses: items
        .filter((q) => !q.answerable)
        .reduce((n, q) => n + q.observations - q.failures, 0),
      unresolved: items.reduce((n, q) => n + q.unresolved, 0),
      metrics,
    };
  };
  const times = rows.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const percentile = (p: number) =>
    times.length ? times[Math.max(0, Math.ceil(times.length * p) - 1)]! : null;
  return {
    overall: group(queries),
    projects: Object.fromEntries(
      [...new Set(questions.map((q) => q.project))].map((p) => [
        p,
        group(queries.filter((q) => q.project === p)),
      ]),
    ),
    slices: Object.fromEntries(
      [...new Set(questions.map((q) => q.slice))].map((s) => [
        s,
        group(queries.filter((q) => q.slice === s)),
      ]),
    ),
    timing: {
      unit: 'whole-process milliseconds',
      samples: times.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: times.at(-1) ?? null,
      representative: questions.length > 0 && repetitions >= 3 && queries.every((q) => q.complete),
      note: 'One labeled cache regime only; percentiles use nearest rank and include failures. Small samples have uncertain tails.',
    },
    queries,
  };
}
// Compare only matching frozen questions/regimes; callers must verify artifact hashes.
export function compare(
  questions: Question[],
  first: Measurement[],
  second: Measurement[],
  repetitions: number,
  seed = 20260905,
) {
  const a = queryMeans(questions, first, repetitions),
    b = queryMeans(questions, second, repetitions);
  return Object.fromEntries(
    names.map((name) => {
      const pairs: [number, number][] = [];
      let eligible = 0;
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i]!;
        if (
          (name === 'nonempty' || name === 'misleading') === question.answerable ||
          (name === 'facetRecall8' && !question.facets.length)
        )
          continue;
        eligible++;
        const av = a[i]!.metrics[name],
          bv = b[i]!.metrics[name];
        if (av !== null && bv !== null) pairs.push([av, bv]);
      }
      return [
        name,
        {
          eligibleQueries: eligible,
          pairedQueries: pairs.length,
          missingQueries: eligible - pairs.length,
          direction:
            name === 'nonempty' || name === 'misleading'
              ? 'positive delta means more returned/misleading evidence, not a quality win'
              : 'positive delta favors second system',
          paired: pairs.length ? pairedBootstrap(pairs, seed) : null,
        },
      ];
    }),
  );
}
