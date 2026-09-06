import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { COMMON_PROTOCOL, type CommonSidecar } from '@/scripts/retrieval-eval/common';
import { hash } from '@/scripts/retrieval-eval/corpus';
import { allocation, type Labels, type Slice } from '@/scripts/retrieval-eval/labels';
import {
  computePublication,
  publicationModules,
  replayPublication,
  type PublicationManifest,
  type PublicationObservation,
} from '@/scripts/retrieval-eval/replay-publication';

const source = '.agent/knowledge/a.md',
  body = 'Answer.\nOther.';
function fixture() {
  const manifest: PublicationManifest = {
    version: 1,
    freezeHash: '5a3e358f20b1aebcf4cf2a0abdc96d54273f9e4f21939d193af288eb4115d2cb',
    freezeCommit: '5c17ebc2ac58a3357fd063aece16763560a6e8a6',
    files: { 'labels.json': hash('labels') },
    modules: { 'scripts/retrieval-eval/common.ts': hash('module') },
    corpusHash: hash('corpus'),
    expectedCommonHashes: {},
    gates: {
      counts: {
        heldOut: 50,
        answerable: 39,
        unanswerable: 11,
        observationsPerSystemPerQuestion: 1,
      },
      quality: {
        bootstrap: { seed: 20260905, samples: 2000, interval: 0.95 },
        baseline: {
          useful8MinimumMeanDelta: 0.05,
          unitNoveltyNdcg8MinimumMeanDelta: 0.05,
          bothMinimumLower95: 0,
        },
        qmd: {
          useful8MinimumMeanDelta: 0,
          unitNoveltyNdcg8MinimumMeanDelta: 0,
          bothMinimumLower95: 0,
        },
        identifiers: { useful8MinimumMeanDeltaVersusBaseline: 0 },
        unanswerable: {
          maximumNonemptyCount: 1,
          maximumMisleadingCount: 0,
          maximumNonemptyDeltaVersusBaseline: 0,
          maximumMisleadingDeltaVersusBaseline: 0,
        },
      },
      performance: {
        proposalProcessElapsedP95Ms: 15000,
        proposalKnownRequestCostP95Usd: 0.002,
        maximumFailedProposalQueries: 1,
        maximumUnknownProposalCosts: 0,
      },
      budget: {
        proposalKnownRequestCeilingUsd: 1,
        qmdQueriesMaximum: 50,
        repetitions: 1,
        noDevelopmentQmd: true,
      },
    },
    runs: ['baseline', 'qmd', 'proposal', 'supplemental'].map((name) => ({
      runIdentity: hash(name),
      inputsHash: hash(name),
      system: name === 'supplemental' ? 'proposal' : name,
      phase: name === 'supplemental' ? 'supplemental-heldout' : 'original-heldout',
      freezeHash: '5a3e358f20b1aebcf4cf2a0abdc96d54273f9e4f21939d193af288eb4115d2cb',
      ...(name === 'supplemental' ? { originalRunIdentity: hash('proposal') } : {}),
    })),
  };
  manifest.expectedCommonHashes = { releaseFreeze: manifest.freezeHash, labels: hash('labels') };
  const labels: Labels = {
    version: 1,
    status: 'reviewed',
    reviews: [
      { reviewer: 'a', kind: 'agent', revision: '1' },
      { reviewer: 'b', kind: 'agent', revision: '1' },
    ],
    adjudication: 'reviewed',
    questions: [],
  };
  for (const [slice, counts] of Object.entries(allocation))
    for (const [index, split] of ['development', 'held-out'].entries())
      for (let i = 0; i < counts[index]!; i++) {
        const id = `${split}-${slice}-${i}`,
          answerable = slice !== 'unanswerable';
        labels.questions.push({
          id,
          project: 'project',
          question: 'What is the answer?',
          family: id,
          slice: slice as Slice,
          secondary: [],
          split: split as 'development' | 'held-out',
          answerable,
          facets: answerable ? ['answer'] : [],
          reason: 'fixture',
          evidence: answerable
            ? [
                {
                  id: 'legacy',
                  source,
                  start: 0,
                  end: 7,
                  grade: 2,
                  facets: ['answer'],
                  reason: 'direct',
                },
              ]
            : [],
        });
      }
  const common: CommonSidecar = {
    version: 1,
    protocol: COMMON_PROTOCOL,
    hashes: { ...manifest.expectedCommonHashes },
    units: [],
    legacyBindings: [],
    renderings: [],
  };
  const observations: { version: 1; rows: PublicationObservation[] } = { version: 1, rows: [] };
  for (const [index, q] of labels.questions.filter((q) => q.split === 'held-out').entries()) {
    if (q.answerable) {
      common.units.push({
        id: q.id,
        question: q.id,
        source,
        start: 0,
        end: 7,
        targetGrade: 2,
        facets: ['answer'],
        reason: 'answer',
      });
      common.legacyBindings.push({
        question: q.id,
        evidenceId: 'legacy',
        unitIds: [q.id],
        reason: 'same',
      });
      common.renderings.push({
        question: q.id,
        source,
        text: 'Answer.',
        start: 0,
        end: 7,
        displayGrade: 2,
        facets: ['answer'],
        misleading: false,
        quote: { text: 'Answer.', start: 0, end: 7 },
        credits: [{ unitId: q.id, achievedGrade: 2 }],
        reason: 'answer',
      });
    }
    for (const system of ['baseline', 'qmd', 'proposal', ...(index >= 8 ? ['supplemental'] : [])]) {
      const proposal = system === 'proposal' || system === 'supplemental',
        skip = system === 'proposal' && index >= 8,
        id = `${system}-${q.id}`;
      observations.rows.push({
        id,
        question: q.id,
        system: proposal ? 'proposal' : (system as 'baseline' | 'qmd'),
        phase: system === 'supplemental' ? 'supplemental-heldout' : 'original-heldout',
        kind: skip ? 'evaluator-skip' : 'actual',
        rawObservationHash: hash(id),
        runIdentity: hash(system),
        elapsedMs: skip ? 0 : 100,
        exitCode: skip ? 1 : 0,
        timedOut: false,
        excerpts:
          proposal && !skip && q.answerable
            ? [{ source, text: 'Answer.', start: 0, end: 7, mapping: 'exact', misleading: null }]
            : [],
        cost: proposal ? { knownUsd: skip ? 0 : 0.0001, unknownAttempts: 0 } : null,
      });
    }
  }
  return {
    manifest,
    labels,
    common,
    observations,
    adjudications: { version: 1, coordinates: [] as unknown[], corrections: [] },
    sources: new Map([[`project/${source}`, body]]),
  };
}
const compute = (f: ReturnType<typeof fixture>) =>
  computePublication(f.manifest, f.labels, f.common, f.observations, f.adjudications, f.sources);

test('diagnostic success cannot replace the original 42 skipped captures', () => {
  const result = compute(fixture());
  expect(result.decision).toBe('NO_ROLLOUT');
  expect(result.gates.proposalDiagnostic.decision).toBe('GATES_PASS');
  expect(result.cohorts.proposalOriginal.summary.overall.failures).toBe(42);
  expect(result.cohorts.proposalDiagnostic.summary.overall.failures).toBe(0);
  expect(
    result.cohorts.proposalDiagnostic.rows.filter((r) => r.phase === 'original-heldout'),
  ).toHaveLength(8);
  expect(result.cohorts.proposalDiagnostic.summary.overall.metrics.useful8.mean).toBe(1);
});

test('unknown billed attempts make cost inconclusive and unknown-cost gate fail', () => {
  const f = fixture();
  f.observations.rows.find(
    (r) => r.system === 'proposal' && r.kind === 'actual',
  )!.cost!.unknownAttempts = 4;
  const result = compute(f);
  for (const name of ['proposalOriginal', 'proposalDiagnostic'] as const) {
    expect(result.gates[name].checks.find((c) => c.id === 'requestCostP95')!.status).toBe(
      'INCONCLUSIVE',
    );
    expect(result.gates[name].checks.find((c) => c.id === 'unknownCosts')!.status).toBe('FAIL');
  }
});

test('missing captures, relabeled skips, and supplemental replacement of actual calls fail', () => {
  const missing = fixture();
  missing.observations.rows.pop();
  expect(() => compute(missing)).toThrow('192 captures');
  const skip = fixture();
  skip.observations.rows.find((r) => r.kind === 'evaluator-skip')!.exitCode = 0;
  expect(() => compute(skip)).toThrow('Invalid evaluator skip');
  const replacement = fixture();
  const first = replacement.observations.rows.find(
    (r) => r.system === 'proposal' && r.kind === 'actual',
  )!;
  replacement.observations.rows.find((r) => r.phase === 'supplemental-heldout')!.question =
    first.question;
  expect(() => compute(replacement)).toThrow('Supplemental replacement');
});

test('drifted gates, run custody, source bytes, and missing review cannot be replayed', () => {
  const gates = fixture();
  gates.manifest.gates.quality.bootstrap.samples++;
  expect(() => compute(gates)).toThrow('Changed bootstrap');
  const run = fixture();
  run.observations.rows[0]!.runIdentity = hash('unbound');
  expect(() => compute(run)).toThrow('Unbound observation run');
  const source = fixture();
  source.sources.set(`project/${'.agent/knowledge/a.md'}`, 'Changed.\nOther.');
  expect(() => compute(source)).toThrow('changed excerpt coordinates');
  const review = fixture();
  review.common.renderings.pop();
  expect(() => compute(review)).toThrow('Incomplete displayed-evidence review');
});

test('a repeated excerpt requires the saved header to select exactly one source occurrence', () => {
  const f = fixture(),
    repeated = 'Answer.\nOther.\nAnswer.';
  const row = f.observations.rows.find((r) => r.system === 'proposal' && r.kind === 'actual')!,
    q = f.labels.questions.find((q) => q.id === row.question)!;
  const path = '.agent/knowledge/repeated.md';
  f.sources.set(`project/${path}`, repeated);
  q.evidence[0]!.source = path;
  f.common.units.find((u) => u.question === q.id)!.source = path;
  f.common.renderings.find((r) => r.question === q.id)!.source = path;
  row.excerpts[0]!.source = path;
  row.excerpts[0]!.mapping = 'adjudication';
  expect(() => compute(f)).toThrow('Repeated excerpt requires coordinate adjudication');
  const resolution = {
    observationId: row.id,
    rank: 0,
    question: q.id,
    source: path,
    text: 'Answer.',
    start: 0,
    end: 7,
    rawObservationHash: row.rawObservationHash,
    rawMapping: { start: null, end: null, mapping: 'adjudication' },
    reason: 'Header selects first occurrence',
    sourceHash: hash(repeated),
    rawHeader: '@@ -1,1 @@ (0 before, 2 after)',
    possibleMatches: [
      { start: 0, end: 7, startLine: 1, startColumn: 1, headerCompatible: true },
      { start: 15, end: 22, startLine: 3, startColumn: 1, headerCompatible: false },
    ],
  };
  f.adjudications.coordinates.push(resolution);
  expect(compute(f).decision).toBe('NO_ROLLOUT');
  resolution.rawHeader = '@@ -3,1 @@ (2 before, 0 after)';
  expect(() => compute(f)).toThrow('coordinate candidate ledger');
});

test('offline loader rejects changed module and bundle bytes before loading corpus', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'iglo-publication-'));
  try {
    const f = fixture(),
      repo = resolve(dirname(import.meta.path), '..');
    for (const path of publicationModules)
      f.manifest.modules[path] = hash(await Bun.file(join(repo, path)).bytes());
    for (const path of [
      'labels.json',
      'common.json',
      'observations.json',
      'adjudications.json',
      'expected.json',
    ]) {
      await Bun.write(join(directory, path), '{}\n');
      f.manifest.files[path] = hash('{}\n');
    }
    f.manifest.modules[publicationModules[0]] = hash('changed');
    await Bun.write(join(directory, 'manifest.json'), JSON.stringify(f.manifest));
    await expect(replayPublication(directory, '/not-used')).rejects.toThrow('Module mismatch');
    f.manifest.modules[publicationModules[0]] = hash(
      await Bun.file(join(repo, publicationModules[0])).bytes(),
    );
    await Bun.write(join(directory, 'manifest.json'), JSON.stringify(f.manifest));
    await Bun.write(join(directory, 'observations.json'), '[]\n');
    await expect(replayPublication(directory, '/not-used')).rejects.toThrow('Bundle mismatch');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
