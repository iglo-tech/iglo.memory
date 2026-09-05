import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hash,
  normalize,
  parseCorpus,
  serialize,
  validateSources,
} from '@/scripts/retrieval-eval/corpus';
import {
  allocation,
  validateLabels,
  type Labels,
  type Question,
} from '@/scripts/retrieval-eval/labels';
import {
  baselineExcerpts,
  mapExcerpt,
  pairedBootstrap,
  score,
} from '@/scripts/retrieval-eval/scoring';
import { capture, runUnit } from '@/scripts/retrieval-eval/records';

const source = '.agent/knowledge/a.md';
const q: Question = {
  id: 'q',
  project: 'p',
  question: 'What?',
  family: 'f',
  slice: 'facets',
  secondary: [],
  split: 'development',
  answerable: true,
  reason: 'fixture',
  facets: ['a', 'b'],
  evidence: [
    { id: 'a', source, start: 0, end: 2, grade: 2, facets: ['a'], reason: 'direct' },
    { id: 'b', source, start: 3, end: 5, grade: 1, facets: ['b'], reason: 'partial' },
  ],
};
test('code-point mapping and baseline clipping never infer ambiguous evidence', () => {
  expect(mapExcerpt(source, 'answer', '😀 answer').start).toBe(2);
  expect(mapExcerpt(source, 'same', 'same same').mapping).toBe('adjudication');
  expect(mapExcerpt(source, 'a b', 'a  b').mapping).toBe('adjudication');
  const body = '😀'.repeat(401);
  expect(
    baselineExcerpts(
      { results: [{ source, snippet: '😀'.repeat(400) + '…' }] },
      'p',
      new Map([[`p/${source}`, body]]),
    )[0]?.mapping,
  ).toBe('adjudication');
  expect(normalize('a\r\nb\rc')).toBe('a\nb\nc');
});
test('hand-graded duplicate evidence gains zero; span and facet coverage unique', () => {
  const a = mapExcerpt(source, 'aa', 'aa bb'),
    b = mapExcerpt(source, 'bb', 'aa bb');
  const result = score(q, [a, a, b], false);
  expect(result.useful).toEqual([1, 1, 1, 1]);
  expect(result.ndcg8).toBeCloseTo((3 + 1 / 2) / (3 + 1 / Math.log2(3)), 12);
  expect(result.spanRecall8).toBe(1);
  expect(result.facetRecall8).toBe(1);
  expect(score(q, [mapExcerpt(source, 'a', 'a bb')], false).ndcg8).toBeNull();
  expect(score(q, [], true).useful).toEqual([0, 0, 0, 0]);
  expect(score(q, [], true).ndcg8).toBe(0);
});
test('unanswerable errors are not abstentions; misleading needs review', () => {
  const no = { ...q, answerable: false, evidence: [], facets: [], slice: 'unanswerable' as const };
  expect(score(no, [], true).nonempty).toBeNull();
  expect(score(no, [], false).nonempty).toBe(0);
  expect(score(no, [], false).misleading).toBe(0);
  const r = mapExcerpt(source, 'aa', 'aa bb');
  expect(score(no, [r], false).misleading).toBeNull();
  expect(score(no, [{ ...r, misleading: true }], false).misleading).toBe(1);
});
test('bootstrap fixed-seed paired query intervals and raw outcomes', () => {
  const pairs: [number, number][] = [
    [0, 1],
    [1, 1],
    [1, 0],
  ];
  expect(pairedBootstrap(pairs)).toEqual(pairedBootstrap(pairs));
  expect(pairedBootstrap(pairs)).toMatchObject({
    wins: 1,
    ties: 1,
    losses: 1,
    queries: 3,
    meanDelta: 0,
  });
  expect(pairedBootstrap([[0, 1]])).toMatchObject({ interval95: [1, 1] });
});
function labels(complete = false): Labels {
  const questions: Question[] = [];
  for (const [slice, counts] of Object.entries(allocation))
    for (let split = 0; split < (complete ? 2 : 1); split++)
      for (let i = 0; i < counts[split]!; i++) {
        const id = `${slice}-${split}-${i}`;
        questions.push({
          ...q,
          id,
          family: id,
          slice: slice as Question['slice'],
          split: split === 0 ? 'development' : 'held-out',
          answerable: slice !== 'unanswerable',
          facets: slice === 'unanswerable' ? [] : q.facets,
          evidence: slice === 'unanswerable' ? [] : q.evidence,
        });
      }
  return { version: 1, status: 'draft', reviews: [], adjudication: null, questions };
}
test('exact 80 allocation, review gate, custody, spans and family leakage', () => {
  const sources = new Map([[`p/${source}`, 'aa bb']]);
  expect(validateLabels(labels(true), sources, 'complete').questions.length).toBe(80);
  expect(() => validateLabels(labels(true), sources, 'development')).toThrow('Held-out');
  const all = labels(true);
  all.questions[8]!.family = all.questions[0]!.family;
  expect(() => validateLabels(all, sources, 'complete')).toThrow('family');
  const dev = labels();
  dev.status = 'reviewed';
  expect(() => validateLabels(dev, sources, 'development')).toThrow('human');
  dev.status = 'draft';
  dev.questions[0]!.evidence = [{ ...q.evidence[0]!, end: 20 }];
  expect(() => validateLabels(dev, sources, 'development')).toThrow('span');
});
test('corpus rejects collisions and altered normalized bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rv2-corpus-'));
  try {
    const corpus = {
      version: 1,
      projects: ['a', 'b', 'c'].map((id) => ({
        id,
        url: 'https://github.com/a/b',
        commit: 'a'.repeat(40),
        license: { status: 'fixture', files: [] },
        files: [
          {
            original: 'a.md',
            mapped: source,
            bytes: 1,
            originalHash: hash('a'),
            normalizedHash: hash('a'),
          },
        ],
      })),
    };
    for (const p of corpus.projects) await Bun.write(join(root, p.id, source), 'a');
    const parsed = parseCorpus(corpus);
    expect((await validateSources(parsed, root)).size).toBe(3);
    await Bun.write(join(root, 'a', source), 'b');
    await expect(validateSources(parsed, root)).rejects.toThrow('mismatch');
    corpus.projects[0]!.files.push(corpus.projects[0]!.files[0]!);
    expect(() => parseCorpus(corpus)).toThrow('mapping');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('failed observations resume unchanged; changed identity reruns; corruption retained', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rv2-record-'));
  let calls = 0;
  const execute = (identity: string) => {
    calls++;
    return capture(
      [process.execPath, '-e', 'console.log(JSON.stringify({error:"fixture"})); process.exit(3)'],
      root,
      identity,
      'q-0',
      5000,
    );
  };
  try {
    const first = await runUnit(root, { pin: 1 }, 'q-0', execute);
    expect(first.exitCode).toBe(3);
    expect(await runUnit(root, { pin: 1 }, 'q-0', execute)).toEqual(first);
    expect(calls).toBe(1);
    await runUnit(root, { pin: 2 }, 'q-0', execute);
    expect(calls).toBe(2);
    const path = join(root, hash(serialize({ pin: 1 })), 'q-0.json');
    await Bun.write(path, '{');
    await expect(runUnit(root, { pin: 1 }, 'q-0', execute)).rejects.toThrow();
    expect(await Bun.file(path).text()).toBe('{');
    expect(calls).toBe(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('process deadline retains failure', async () => {
  const r = await capture(
    [process.execPath, '-e', 'setTimeout(()=>{},10000)'],
    process.cwd(),
    'id',
    'unit',
    30,
  );
  expect(r.timedOut).toBe(true);
  expect(r.exitCode).not.toBe(0);
});

test('deadline also kills descendants that inherit capture pipes', async () => {
  const r = await capture(
    [
      process.execPath,
      '-e',
      `Bun.spawn([process.execPath,'-e','setTimeout(()=>{},10000)'], {stdout:'inherit',stderr:'inherit'}); setTimeout(()=>{},10000);`,
    ],
    process.cwd(),
    'id',
    'child',
    100,
  );
  expect(r.timedOut).toBe(true);
  expect(r.elapsedMs).toBeLessThan(2000);
});
