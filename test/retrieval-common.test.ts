import { expect, test } from 'bun:test';
import {
  COMMON_PROTOCOL,
  scoreCommon,
  validateCommon,
  type CommonRendering,
  type CommonSidecar,
} from '@/scripts/retrieval-eval/common';
import type { Question } from '@/scripts/retrieval-eval/labels';
import { mapExcerpt } from '@/scripts/retrieval-eval/scoring';

const source = '.agent/knowledge/a.md';
const body = '😀 command removes unused vectors. Snapshot only. extra';
const hashes = { corpus: 'frozen-corpus', judgments: 'frozen-judgments' };
const sources = new Map([[`project/${source}`, body]]);
const textAt = (start: number, end: number) => Array.from(body).slice(start, end).join('');
const question = (): Question => ({
  id: 'q',
  project: 'project',
  question: 'How are unused vectors removed?',
  family: 'gc',
  slice: 'facets',
  secondary: [],
  split: 'development',
  answerable: true,
  facets: ['command', 'snapshot'],
  reason: 'Two facts',
  evidence: [
    {
      id: 'legacy',
      source,
      start: 2,
      end: 48,
      grade: 2,
      facets: ['command', 'snapshot'],
      reason: 'Bundled legacy span',
    },
  ],
});
function rendering(
  start: number,
  end: number,
  grade: 0 | 1 | 2,
  unitIds = ['gc'],
): CommonRendering {
  return {
    question: 'q',
    source,
    start,
    end,
    text: textAt(start, end),
    displayGrade: grade,
    facets: grade === 2 ? ['command'] : [],
    misleading: false,
    quote: grade ? { text: textAt(start, end), start, end } : null,
    credits: grade ? unitIds.map((unitId) => ({ unitId, achievedGrade: grade })) : [],
    reason: 'Reviewed display',
  };
}
function fixture() {
  const q = question();
  const data: CommonSidecar = {
    version: 1,
    protocol: COMMON_PROTOCOL,
    hashes: { ...hashes },
    units: [
      {
        id: 'gc',
        question: 'q',
        source,
        start: 2,
        end: 32,
        targetGrade: 2,
        facets: ['command'],
        reason: 'Command and policy',
      },
      {
        id: 'snapshot',
        question: 'q',
        source,
        start: 34,
        end: 47,
        targetGrade: 2,
        facets: ['snapshot'],
        reason: 'Snapshot policy',
      },
    ],
    legacyBindings: [
      {
        question: 'q',
        evidenceId: 'legacy',
        unitIds: ['gc', 'snapshot'],
        reason: 'Two distinct units',
      },
    ],
    renderings: [rendering(10, 31, 1), rendering(2, 31, 2), rendering(49, 54, 0)],
  };
  const excerpts = (indices: number[]) =>
    indices.map((index) => {
      const row = data.renderings[index]!;
      return mapExcerpt(row.source, row.text, body);
    });
  const validate = () => validateCommon(data, [q], sources, hashes);
  return { q, data, excerpts, validate };
}

test('sufficient shorter credit preserves originals and counts the canonical unit once', () => {
  const f = fixture();
  const original = JSON.stringify([f.q, f.data]);
  const review = f.validate();
  const result = scoreCommon(f.q, f.excerpts([1, 1]), false, review);
  expect(result.useful).toEqual([1, 1, 1, 1]);
  expect(result.spanRecall8).toBe(0.5);
  expect(result.facetRecall8).toBe(0.5);
  expect(result.ndcg8).toBeCloseTo(3 / (3 + 3 / Math.log2(3)), 12);
  expect(JSON.stringify([f.q, f.data])).toBe(original);
  expect(review.units(f.q)).toHaveLength(2);
  review.units(f.q)[0]!.targetGrade = 1;
  expect(review.units(f.q)[0]!.targetGrade).toBe(2);
});

test('partial then direct gains one then two; direct usefulness survives duplicate identity', () => {
  const f = fixture();
  f.q.facets = ['command'];
  f.q.evidence[0]!.facets = ['command'];
  f.data.units = f.data.units.slice(0, 1);
  f.data.legacyBindings[0]!.unitIds = ['gc'];
  const review = f.validate();
  const partial = scoreCommon(f.q, f.excerpts([0]), false, review);
  expect(partial.useful).toEqual([0, 0, 0, 0]);
  expect(partial.spanRecall8).toBe(0);
  expect(partial.facetRecall8).toBe(0);
  const result = scoreCommon(f.q, f.excerpts([0, 1]), false, review);
  expect(result.useful).toEqual([0, 1, 1, 1]);
  expect(result.spanRecall8).toBe(1);
  expect(result.ndcg8).toBeCloseTo((1 + 2 / Math.log2(3)) / 3, 12);
  expect(scoreCommon(f.q, f.excerpts([1, 0]), false, review).ndcg8).toBe(1);
});

test('bundle covers both facets and units without transitive merging or summed rank gain', () => {
  const f = fixture();
  const bundle = rendering(2, 48, 2, ['gc', 'snapshot']);
  bundle.facets = ['command', 'snapshot'];
  f.data.renderings.push(bundle);
  const result = scoreCommon(f.q, f.excerpts([3]), false, f.validate());
  expect(result.spanRecall8).toBe(1);
  expect(result.facetRecall8).toBe(1);
  expect(result.ndcg8).toBeCloseTo(3 / (3 + 3 / Math.log2(3)), 12);
});

test('unknown rendering and unknown occurrence null the whole observation, including prefixes', () => {
  const f = fixture();
  const review = f.validate();
  const unknown = mapExcerpt(source, 'Snapshot', body);
  const result = scoreCommon(f.q, [...f.excerpts([1]), unknown], false, review);
  expect(result.unresolved).toBe(true);
  expect(result.useful).toEqual([null, null, null, null]);
  expect(result.ndcg8).toBeNull();
  expect(result.spanRecall8).toBeNull();
  expect(result.facetRecall8).toBeNull();
  const wrongOccurrence = { ...f.excerpts([1])[0]!, start: 0 };
  expect(scoreCommon(f.q, [wrongOccurrence], false, review).unresolved).toBe(true);
});

test('reviewed negatives, empty and failed answerable observations are zero quality', () => {
  const f = fixture();
  const review = f.validate();
  for (const [excerpts, failed] of [
    [f.excerpts([2]), false],
    [[], false],
    [f.excerpts([1]), true],
  ] as const) {
    const result = scoreCommon(f.q, [...excerpts], failed, review);
    expect(result.failed).toBe(failed);
    expect(result.unresolved).toBe(false);
    expect(result.useful).toEqual([0, 0, 0, 0]);
    expect(result.ndcg8).toBe(0);
    expect(result.spanRecall8).toBe(0);
  }
});

test('unanswerable harm and failures remain distinct from successful abstention', () => {
  const f = fixture();
  Object.assign(f.q, { answerable: false, slice: 'unanswerable', facets: [], evidence: [] });
  f.data.units = [];
  f.data.legacyBindings = [];
  f.data.renderings = [rendering(2, 31, 0)];
  f.data.renderings[0]!.misleading = true;
  const review = f.validate();
  const harmful = scoreCommon(f.q, f.excerpts([0]), false, review);
  expect(harmful.misleading).toBe(1);
  expect(harmful.nonempty).toBe(1);
  expect(harmful.useful).toBeNull();
  const empty = scoreCommon(f.q, [], false, review);
  expect(empty.nonempty).toBe(0);
  expect(empty.misleading).toBe(0);
  const failure = scoreCommon(f.q, [], true, review);
  expect(failure.failed).toBe(true);
  expect(failure.nonempty).toBeNull();
  expect(failure.misleading).toBeNull();
  expect(
    scoreCommon(f.q, [mapExcerpt(source, 'extra', body)], false, review).misleading,
  ).toBeNull();
});

test('strict sidecar checks reject invalid ownership, review claims and frozen inputs', () => {
  const mutations: ((f: ReturnType<typeof fixture>) => void)[] = [
    (f) => {
      f.data.hashes.corpus = 'changed';
    },
    (f) => {
      f.data.hashes.extra = 'extra';
    },
    (f) => {
      f.q.split = 'held-out';
    },
    (f) => {
      f.data.units[0]!.source = '.agent/knowledge/missing.md';
    },
    (f) => {
      f.data.units[0]!.facets = ['unknown'];
    },
    (f) => {
      f.data.units.push(structuredClone(f.data.units[0]!));
    },
    (f) => {
      f.data.renderings[0]!.start += 1;
    },
    (f) => {
      f.data.renderings[0]!.quote!.text = 'invented';
    },
    (f) => {
      f.data.renderings[0]!.quote!.start = 1;
    },
    (f) => {
      f.data.renderings[0]!.quote = null;
    },
    (f) => {
      f.data.renderings[0]!.credits = [];
    },
    (f) => {
      f.data.renderings[0]!.credits[0]!.unitId = 'unknown';
    },
    (f) => {
      f.data.renderings[0]!.credits[0]!.unitId = 'snapshot';
    },
    (f) => {
      f.data.renderings[0]!.credits[0]!.achievedGrade = 2;
    },
    (f) => {
      f.data.renderings[1]!.facets = ['snapshot'];
    },
    (f) => {
      f.data.renderings[2]!.credits = [{ unitId: 'gc', achievedGrade: 1 }];
    },
    (f) => {
      f.data.renderings.push(structuredClone(f.data.renderings[0]!));
    },
    (f) => {
      f.data.legacyBindings[0]!.unitIds = ['unknown'];
    },
    (f) => {
      f.data.legacyBindings[0]!.evidenceId = 'unknown';
    },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    mutate(f);
    expect(f.validate).toThrow();
  }
});

test('identical text at reviewed occurrences resolves separately; an unreviewed third does not', () => {
  const f = fixture();
  const start = Array.from(body).length + 1;
  const repeatedBody = `${body} repeated repeated repeated`;
  const repeatedSources = new Map([[`project/${source}`, repeatedBody]]);
  const repeated = (offset: number): CommonRendering => ({
    ...rendering(49, 54, 0),
    text: 'repeated',
    start: offset,
    end: offset + 8,
  });
  f.data.renderings.push(repeated(start), repeated(start + 9));
  const review = validateCommon(f.data, [f.q], repeatedSources, hashes);
  const excerpt = (offset: number) => ({
    ...mapExcerpt(source, 'repeated', repeatedBody),
    start: offset,
    end: offset + 8,
  });
  for (const offset of [start, start + 9]) {
    const result = scoreCommon(f.q, [excerpt(offset)], false, review);
    expect(result.unresolved).toBe(false);
    expect(result.useful).toEqual([0, 0, 0, 0]);
  }
  expect(scoreCommon(f.q, [excerpt(start + 18)], false, review).unresolved).toBe(true);
  expect(
    scoreCommon(f.q, [mapExcerpt(source, 'repeated', repeatedBody)], false, review).unresolved,
  ).toBe(true);
  f.data.renderings.push(repeated(start));
  expect(() => validateCommon(f.data, [f.q], repeatedSources, hashes)).toThrow(
    'Duplicate common rendering',
  );
});

test('every positive legacy label requires a binding, including partial support labels', () => {
  const f = fixture();
  f.q.evidence.push({
    id: 'partial',
    source,
    start: 10,
    end: 31,
    grade: 1,
    facets: [],
    reason: 'Partial policy',
  });
  expect(f.validate).toThrow('Missing positive legacy binding');
  f.data.legacyBindings.push({
    question: 'q',
    evidenceId: 'partial',
    unitIds: ['gc'],
    reason: 'Partial rendering of same unit',
  });
  expect(f.validate).not.toThrow();
  f.data.legacyBindings = f.data.legacyBindings.filter((b) => b.evidenceId !== 'legacy');
  expect(f.validate).toThrow('Missing positive legacy binding');
});

test('displayed direct grade needs a direct credit even when several partial credits exist', () => {
  const f = fixture();
  const bundle = rendering(2, 48, 2, ['gc', 'snapshot']);
  bundle.facets = [];
  for (const credit of bundle.credits) credit.achievedGrade = 1;
  f.data.renderings.push(bundle);
  expect(f.validate).toThrow('Displayed grade lacks matching achieved credit');
  bundle.credits[0]!.achievedGrade = 2;
  expect(f.validate).not.toThrow();
});

test('Unicode coordinates are codepoints and validated snapshots resist later mutation', () => {
  const f = fixture();
  const whole = rendering(0, 32, 2);
  f.data.renderings.push(whole);
  const review = f.validate();
  expect(scoreCommon(f.q, f.excerpts([3]), false, review).useful![0]).toBe(1);
  f.data.renderings[3]!.displayGrade = 0;
  expect(scoreCommon(f.q, f.excerpts([3]), false, review).useful![0]).toBe(1);
  f.q.question = 'changed question';
  expect(() => scoreCommon(f.q, [], false, review)).toThrow('contract mismatch');
});
