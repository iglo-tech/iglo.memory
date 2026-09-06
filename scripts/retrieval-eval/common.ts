import { check, hash, object, serialize } from '@/scripts/retrieval-eval/corpus';
import type { Question } from '@/scripts/retrieval-eval/labels';
import type { Excerpt } from '@/scripts/retrieval-eval/scoring';

export const COMMON_PROTOCOL = 'unit-novelty-ndcg-v1' as const;
export type CommonUnit = {
  id: string;
  question: string;
  source: string;
  start: number;
  end: number;
  targetGrade: 1 | 2;
  facets: string[];
  reason: string;
};
export type LegacyBinding = {
  question: string;
  evidenceId: string;
  unitIds: string[];
  reason: string;
};
export type CommonRendering = {
  question: string;
  source: string;
  text: string;
  start: number;
  end: number;
  displayGrade: 0 | 1 | 2;
  facets: string[];
  misleading: boolean;
  quote: { text: string; start: number; end: number } | null;
  credits: { unitId: string; achievedGrade: 1 | 2 }[];
  reason: string;
};
export type CommonSidecar = {
  version: 1;
  protocol: typeof COMMON_PROTOCOL;
  hashes: Record<string, string>;
  units: CommonUnit[];
  legacyBindings: LegacyBinding[];
  renderings: CommonRendering[];
};
export type CommonReview = {
  protocol: typeof COMMON_PROTOCOL;
  units: (question: Question) => CommonUnit[];
  resolve: (question: Question, excerpt: Excerpt) => CommonRendering | undefined;
};

export const commonRenderingKey = (
  question: string,
  source: string,
  text: string,
  start: number | null,
  end: number | null,
) => hash(serialize([question, source, text, start, end]));
const unitKey = (question: string, id: string) => JSON.stringify([question, id]);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((item) => typeof item === 'string' && item.trim().length > 0) &&
  new Set(value).size === value.length;
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;

// Semantic equivalence is supplied by reviewed credits, never inferred from overlap.
export function validateCommon(
  value: unknown,
  questions: Question[],
  sources: Map<string, string>,
  expectedHashes: Record<string, string>,
  phase: { split: 'held-out'; freezeHash: string } | { split: 'development' } = {
    split: 'development',
  },
): CommonReview {
  const root = object(value);
  check(root.version === 1 && root.protocol === COMMON_PROTOCOL, 'Invalid common protocol');
  const hashes = object(root.hashes);
  check(
    phase.split === 'development' ||
      (phase.split === 'held-out' &&
        /^[a-f0-9]{64}$/.test(phase.freezeHash) &&
        hashes.releaseFreeze === phase.freezeHash),
    'Common held-out phase requires matching release freeze',
  );
  const keys = Object.keys(expectedHashes);
  check(
    keys.length > 0 &&
      keys.length === Object.keys(hashes).length &&
      keys.every((key) => nonempty(expectedHashes[key]) && hashes[key] === expectedHashes[key]),
    'Common frozen input mismatch',
  );
  check(
    Array.isArray(root.units) &&
      Array.isArray(root.legacyBindings) &&
      Array.isArray(root.renderings),
    'Missing common ledger',
  );
  const byQuestion = new Map<string, Question>();
  const contracts = new Map<string, string>();
  for (const q of questions) {
    check(q.split === phase.split, 'Question split forbidden in common scorer phase');
    check(nonempty(q.id) && !byQuestion.has(q.id), 'Duplicate common question');
    check(strings(q.facets), 'Invalid question facets');
    byQuestion.set(q.id, q);
    contracts.set(q.id, serialize(q));
  }
  const questionFor = (id: unknown) => {
    check(typeof id === 'string' && byQuestion.has(id), 'Unknown common question');
    return byQuestion.get(id)!;
  };
  const spanFor = (row: Record<string, unknown>, q: Question) => {
    check(nonempty(row.source), 'Invalid common source');
    const body = sources.get(`${q.project}/${row.source}`);
    check(body !== undefined, 'Unknown common source');
    const chars = Array.from(body);
    check(
      Number.isSafeInteger(row.start) &&
        Number.isSafeInteger(row.end) &&
        Number(row.start) >= 0 &&
        Number(row.end) > Number(row.start) &&
        Number(row.end) <= chars.length,
      'Invalid common span',
    );
    return chars.slice(Number(row.start), Number(row.end)).join('');
  };
  const facetsFor = (row: Record<string, unknown>, q: Question) => {
    check(
      strings(row.facets) && row.facets.every((facet) => q.facets.includes(facet)),
      'Unknown common facet',
    );
    check(nonempty(row.reason), 'Missing common reason');
  };
  const units = new Map<string, CommonUnit>();
  for (const item of root.units) {
    const row = object(item);
    const q = questionFor(row.question);
    check(q.answerable, 'Unanswerable question has positive common unit');
    check(nonempty(row.id), 'Invalid common unit ID');
    const key = unitKey(q.id, row.id);
    check(!units.has(key), 'Duplicate common unit');
    check(row.targetGrade === 1 || row.targetGrade === 2, 'Invalid common unit grade');
    spanFor(row, q);
    facetsFor(row, q);
    units.set(key, structuredClone(row) as CommonUnit);
  }
  for (const q of questions)
    check(
      !q.answerable || [...units.values()].some((u) => u.question === q.id && u.targetGrade === 2),
      'Answerable question needs direct common unit',
    );
  const bindings = new Set<string>();
  for (const item of root.legacyBindings) {
    const row = object(item);
    const q = questionFor(row.question);
    check(nonempty(row.evidenceId), 'Invalid legacy evidence ID');
    const evidence = q.evidence.find((e) => e.id === row.evidenceId);
    check(evidence && evidence.grade > 0, 'Unknown/nonpositive legacy evidence');
    const key = unitKey(q.id, row.evidenceId);
    check(!bindings.has(key), 'Duplicate legacy binding');
    bindings.add(key);
    check(strings(row.unitIds) && row.unitIds.length > 0, 'Missing legacy units');
    check(nonempty(row.reason), 'Missing legacy reason');
    for (const id of row.unitIds) {
      const unit = units.get(unitKey(q.id, id));
      check(
        unit && unit.source === evidence.source && overlaps(unit, evidence),
        'Invalid legacy unit',
      );
    }
  }
  for (const q of questions)
    for (const evidence of q.evidence)
      check(
        evidence.grade === 0 || bindings.has(unitKey(q.id, evidence.id)),
        'Missing positive legacy binding',
      );
  const renderings = new Map<string, CommonRendering>();
  for (const item of root.renderings) {
    const row = object(item);
    const q = questionFor(row.question);
    check(
      nonempty(row.text) && spanFor(row, q) === row.text,
      'Common text does not reproduce span',
    );
    facetsFor(row, q);
    check(
      row.displayGrade === 0 || row.displayGrade === 1 || row.displayGrade === 2,
      'Invalid displayed grade',
    );
    check(q.answerable || row.displayGrade === 0, 'Unanswerable positive rendering');
    check(typeof row.misleading === 'boolean', 'Missing common misleading judgment');
    check(Array.isArray(row.credits), 'Missing common credits');
    const excerpt = { start: Number(row.start), end: Number(row.end) };
    let quote: { start: number; end: number } | null = null;
    if (row.quote !== null) {
      const value = object(row.quote);
      check(
        nonempty(value.text) &&
          spanFor({ ...value, source: row.source }, q) === value.text &&
          Number(value.start) >= excerpt.start &&
          Number(value.end) <= excerpt.end,
        'Common quote does not reproduce displayed span',
      );
      quote = { start: Number(value.start), end: Number(value.end) };
    }
    check(
      row.displayGrade === 0
        ? row.credits.length === 0 && (row.facets as string[]).length === 0
        : quote !== null && row.credits.length > 0,
      'Missing positive quote/credit or positive credit on grade zero',
    );
    const seen = new Set<string>();
    const creditedFacets = new Set<string>();
    let strongestCredit = 0;
    for (const item of row.credits) {
      const credit = object(item);
      check(nonempty(credit.unitId) && !seen.has(credit.unitId), 'Duplicate/invalid common credit');
      seen.add(credit.unitId);
      const unit = units.get(unitKey(q.id, credit.unitId));
      check(unit && unit.source === row.source, 'Unknown/cross-source common credit');
      check(
        (credit.achievedGrade === 1 || credit.achievedGrade === 2) &&
          credit.achievedGrade <= unit.targetGrade &&
          credit.achievedGrade <= row.displayGrade,
        'Invalid achieved grade',
      );
      check(quote && overlaps(unit, quote), 'Common credit quote misses unit');
      strongestCredit = Math.max(strongestCredit, credit.achievedGrade);
      for (const facet of unit.facets) creditedFacets.add(facet);
    }
    check(strongestCredit === row.displayGrade, 'Displayed grade lacks matching achieved credit');
    check(
      (row.facets as string[]).every((f) => creditedFacets.has(f)),
      'Facet lacks common credit',
    );
    const key = commonRenderingKey(q.id, String(row.source), row.text, excerpt.start, excerpt.end);
    check(!renderings.has(key), 'Duplicate common rendering');
    renderings.set(key, structuredClone(row) as CommonRendering);
  }
  const assertQuestion = (question: Question) =>
    check(contracts.get(question.id) === serialize(question), 'Common question contract mismatch');
  return {
    protocol: COMMON_PROTOCOL,
    units: (question) => {
      assertQuestion(question);
      return [...units.values()]
        .filter((u) => u.question === question.id)
        .map((u) => structuredClone(u));
    },
    resolve: (question, excerpt) => {
      assertQuestion(question);
      const row = renderings.get(
        commonRenderingKey(question.id, excerpt.source, excerpt.text, excerpt.start, excerpt.end),
      );
      // Known repeated text still requires the reviewed occurrence, never guessed offsets.
      if (!row || excerpt.start !== row.start || excerpt.end !== row.end) return undefined;
      return structuredClone(row);
    },
  };
}

// Conservative whole-observation policy: any unknown top-eight rendering nulls
// all answerable quality metrics, including useful prefixes. Failure is separate.
export function scoreCommon(
  question: Question,
  excerpts: Excerpt[],
  failed: boolean,
  review: CommonReview,
) {
  const units = review.units(question);
  const rows = (failed ? [] : excerpts).slice(0, 8).map((e) => review.resolve(question, e));
  const unresolved = rows.some((row) => row === undefined);
  const best = new Map<string, number>();
  const facets = new Set<string>();
  const gain = (grade: number) => (grade === 2 ? 3 : grade);
  const rankGains = rows.map((row) => {
    if (!row) return 0;
    let fresh = 0;
    for (const credit of row.credits)
      fresh = Math.max(fresh, gain(credit.achievedGrade) - (best.get(credit.unitId) ?? 0));
    for (const credit of row.credits)
      best.set(credit.unitId, Math.max(best.get(credit.unitId) ?? 0, gain(credit.achievedGrade)));
    for (const facet of row.facets) facets.add(facet);
    return fresh;
  });
  const dcg = (values: number[]) =>
    values.slice(0, 8).reduce((sum, value, i) => sum + value / Math.log2(i + 2), 0);
  const ideal = dcg(units.map((u) => gain(u.targetGrade)).sort((a, b) => b - a));
  const resolved = question.answerable && !unresolved;
  return {
    protocol: COMMON_PROTOCOL,
    failed,
    unresolved,
    useful: question.answerable
      ? [1, 3, 5, 8].map((k) =>
          unresolved ? null : Number(rows.slice(0, k).some((r) => r?.displayGrade === 2)),
        )
      : null,
    supporting: resolved ? Number(rows.some((r) => r && r.displayGrade > 0)) : null,
    ndcg8: resolved ? (ideal ? dcg(rankGains) / ideal : 0) : null,
    facetRecall8: resolved && question.facets.length ? facets.size / question.facets.length : null,
    spanRecall8:
      resolved && units.length
        ? units.filter((u) => (best.get(u.id) ?? 0) >= gain(u.targetGrade)).length / units.length
        : null,
    nonempty: !question.answerable && !failed ? Number(excerpts.length > 0) : null,
    misleading:
      !question.answerable && !failed
        ? rows.some((r) => r?.misleading)
          ? 1
          : unresolved
            ? null
            : 0
        : null,
  };
}
