import { dirname, join, resolve } from 'node:path';
import { scoreCommon, validateCommon } from '@/scripts/retrieval-eval/common';
import {
  check,
  hash,
  object,
  parseCorpus,
  safePath,
  serialize,
  validateSources,
} from '@/scripts/retrieval-eval/corpus';
import { validateLabels, type Question } from '@/scripts/retrieval-eval/labels';
import { compare, summarize, type Measurement } from '@/scripts/retrieval-eval/report';
import type { Excerpt } from '@/scripts/retrieval-eval/scoring';

export const publicationModules = [
  'scripts/retrieval-eval/common.ts',
  'scripts/retrieval-eval/report.ts',
  'scripts/retrieval-eval/scoring.ts',
  'scripts/retrieval-eval/corpus.ts',
  'scripts/retrieval-eval/labels.ts',
  'scripts/retrieval-eval/replay-publication.ts',
] as const;
const bundleFiles = [
  'labels.json',
  'common.json',
  'observations.json',
  'adjudications.json',
  'expected.json',
] as const;
const freezeHash = '5a3e358f20b1aebcf4cf2a0abdc96d54273f9e4f21939d193af288eb4115d2cb';
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const nonnegative = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

export type FrozenGates = {
  counts: {
    heldOut: number;
    answerable: number;
    unanswerable: number;
    observationsPerSystemPerQuestion: number;
  };
  quality: {
    bootstrap: { seed: number; samples: number; interval: number };
    baseline: {
      useful8MinimumMeanDelta: number;
      unitNoveltyNdcg8MinimumMeanDelta: number;
      bothMinimumLower95: number;
    };
    qmd: {
      useful8MinimumMeanDelta: number;
      unitNoveltyNdcg8MinimumMeanDelta: number;
      bothMinimumLower95: number;
    };
    identifiers: { useful8MinimumMeanDeltaVersusBaseline: number };
    unanswerable: {
      maximumNonemptyCount: number;
      maximumMisleadingCount: number;
      maximumNonemptyDeltaVersusBaseline: number;
      maximumMisleadingDeltaVersusBaseline: number;
    };
  };
  performance: {
    proposalProcessElapsedP95Ms: number;
    proposalKnownRequestCostP95Usd: number;
    maximumFailedProposalQueries: number;
    maximumUnknownProposalCosts: number;
  };
  budget: {
    proposalKnownRequestCeilingUsd: number;
    qmdQueriesMaximum: number;
    repetitions: number;
    noDevelopmentQmd: boolean;
  };
};
export type PublicationManifest = {
  version: 1;
  freezeHash: string;
  freezeCommit: string;
  files: Record<string, string>;
  modules: Record<string, string>;
  corpusHash: string;
  expectedCommonHashes: Record<string, string>;
  gates: FrozenGates;
  runs: {
    runIdentity: string;
    system: string;
    phase: string;
    freezeHash: string;
    inputsHash: string;
    originalRunIdentity?: string;
  }[];
};
export type PublicationObservation = {
  id: string;
  question: string;
  system: 'baseline' | 'qmd' | 'proposal';
  phase: 'original-heldout' | 'supplemental-heldout';
  kind: 'actual' | 'evaluator-skip';
  rawObservationHash: string;
  runIdentity: string;
  elapsedMs: number;
  exitCode: number;
  timedOut: boolean;
  excerpts: Excerpt[];
  cost: { knownUsd: number; unknownAttempts: number } | null;
};

// The numerical contract is fixed for this published experiment, not a configurable evaluator.
function manifestFor(value: unknown): PublicationManifest {
  const m = object(value);
  check(
    m.version === 1 &&
      m.freezeHash === freezeHash &&
      m.freezeCommit === '5c17ebc2ac58a3357fd063aece16763560a6e8a6',
    'Wrong publication freeze',
  );
  check(digest(m.corpusHash), 'Invalid corpus digest');
  for (const field of ['files', 'modules', 'expectedCommonHashes']) {
    const entries = object(m[field]);
    check(Object.keys(entries).length > 0, 'Empty hash bindings');
    for (const [key, value] of Object.entries(entries)) {
      check(nonempty(key) && digest(value), 'Invalid hash binding');
      if (field !== 'expectedCommonHashes') safePath(key);
    }
  }
  const g = object(m.gates),
    c = object(g.counts),
    q = object(g.quality),
    p = object(g.performance),
    b = object(g.budget);
  const boot = object(q.bootstrap),
    identifiers = object(q.identifiers),
    unsupported = object(q.unanswerable);
  check(
    c.heldOut === 50 &&
      c.answerable === 39 &&
      c.unanswerable === 11 &&
      c.observationsPerSystemPerQuestion === 1,
    'Changed frozen counts',
  );
  check(
    boot.seed === 20260905 && boot.samples === 2000 && boot.interval === 0.95,
    'Changed bootstrap',
  );
  for (const system of ['baseline', 'qmd']) {
    const limit = object(q[system]),
      margin = system === 'baseline' ? 0.05 : 0;
    check(
      limit.useful8MinimumMeanDelta === margin &&
        limit.unitNoveltyNdcg8MinimumMeanDelta === margin &&
        limit.bothMinimumLower95 === 0,
      'Changed quality gate',
    );
  }
  check(
    identifiers.useful8MinimumMeanDeltaVersusBaseline === 0 &&
      unsupported.maximumNonemptyCount === 1 &&
      unsupported.maximumMisleadingCount === 0 &&
      unsupported.maximumNonemptyDeltaVersusBaseline === 0 &&
      unsupported.maximumMisleadingDeltaVersusBaseline === 0,
    'Changed harm/identifier gate',
  );
  check(
    p.proposalProcessElapsedP95Ms === 15000 &&
      p.proposalKnownRequestCostP95Usd === 0.002 &&
      p.maximumFailedProposalQueries === 1 &&
      p.maximumUnknownProposalCosts === 0,
    'Changed performance gate',
  );
  check(
    b.proposalKnownRequestCeilingUsd === 1 &&
      b.qmdQueriesMaximum === 50 &&
      b.repetitions === 1 &&
      b.noDevelopmentQmd === true,
    'Changed execution budget',
  );
  return value as PublicationManifest;
}

function observationsFor(value: unknown, questions: Question[], sources: Map<string, string>) {
  const root = object(value);
  check(
    root.version === 1 && Array.isArray(root.rows) && root.rows.length === 192,
    'Expected 192 captures',
  );
  const ids = new Set<string>(),
    captures = new Set<string>(),
    rawHashes = new Set<string>();
  for (const item of root.rows) {
    const r = object(item),
      q = questions.find((q) => q.id === r.question);
    check(q && nonempty(r.id) && !ids.has(r.id), 'Unknown/duplicate observation');
    ids.add(r.id);
    check(
      ['baseline', 'qmd', 'proposal'].includes(String(r.system)) &&
        ['original-heldout', 'supplemental-heldout'].includes(String(r.phase)) &&
        ['actual', 'evaluator-skip'].includes(String(r.kind)),
      'Invalid observation cohort',
    );
    const key = JSON.stringify([r.system, r.phase, r.question]);
    check(!captures.has(key), 'Duplicate cohort capture');
    captures.add(key);
    check(
      digest(r.rawObservationHash) && !rawHashes.has(r.rawObservationHash) && digest(r.runIdentity),
      'Invalid/duplicate raw custody',
    );
    rawHashes.add(r.rawObservationHash);
    check(
      nonnegative(r.elapsedMs) &&
        Number.isSafeInteger(r.exitCode) &&
        typeof r.timedOut === 'boolean' &&
        Array.isArray(r.excerpts),
      'Invalid capture outcome',
    );
    check(
      r.phase !== 'supplemental-heldout' || (r.system === 'proposal' && r.kind === 'actual'),
      'Invalid supplemental capture',
    );
    const failed = r.exitCode !== 0 || r.timedOut;
    check(!failed || r.excerpts.length === 0, 'Failed capture has scored excerpts');
    if (r.system === 'proposal') {
      const cost = object(r.cost);
      check(
        nonnegative(cost.knownUsd) &&
          Number.isSafeInteger(cost.unknownAttempts) &&
          Number(cost.unknownAttempts) >= 0,
        'Invalid proposal costs',
      );
      if (r.kind === 'evaluator-skip')
        check(
          r.phase === 'original-heldout' &&
            r.exitCode === 1 &&
            !r.timedOut &&
            cost.knownUsd === 0 &&
            cost.unknownAttempts === 0,
          'Invalid evaluator skip',
        );
    } else check(r.kind === 'actual' && r.cost === null, 'Invalid comparator accounting');
    for (const item of r.excerpts) {
      const e = object(item);
      check(
        nonempty(e.source) &&
          nonempty(e.text) &&
          (e.mapping === 'exact' || e.mapping === 'adjudication') &&
          (e.misleading === null || typeof e.misleading === 'boolean'),
        'Invalid excerpt',
      );
      const body = sources.get(`${q.project}/${e.source}`);
      check(
        body !== undefined &&
          Number.isSafeInteger(e.start) &&
          Number.isSafeInteger(e.end) &&
          Number(e.start) >= 0 &&
          Number(e.end) > Number(e.start) &&
          Array.from(body).slice(Number(e.start), Number(e.end)).join('') === e.text,
        'Unresolved or changed excerpt coordinates',
      );
    }
  }
  const rows = root.rows as PublicationObservation[];
  for (const q of questions) {
    for (const system of ['baseline', 'qmd', 'proposal'])
      check(
        rows.some(
          (r) => r.question === q.id && r.system === system && r.phase === 'original-heldout',
        ),
        'Missing original capture',
      );
    const original = rows.find(
      (r) => r.question === q.id && r.system === 'proposal' && r.phase === 'original-heldout',
    )!;
    check(
      rows.some((r) => r.question === q.id && r.phase === 'supplemental-heldout') ===
        (original.kind === 'evaluator-skip'),
      'Supplemental replacement must match original skip',
    );
  }
  check(
    rows.filter((r) => r.kind === 'evaluator-skip').length === 42 &&
      rows.filter((r) => r.phase === 'supplemental-heldout').length === 42,
    'Changed original/supplemental allocation',
  );
  return rows;
}

function validateCoordinates(
  value: unknown,
  rows: PublicationObservation[],
  questions: Question[],
  sources: Map<string, string>,
) {
  const root = object(value);
  check(
    root.version === 1 && Array.isArray(root.coordinates) && Array.isArray(root.corrections),
    'Missing adjudication lineage',
  );
  const bound = new Set<string>();
  for (const item of root.coordinates) {
    const r = object(item),
      row = rows.find((x) => x.id === r.observationId);
    check(
      row && Number.isSafeInteger(r.rank) && Number(r.rank) >= 0,
      'Unbound coordinate resolution',
    );
    const key = JSON.stringify([row.id, r.rank]),
      e = row.excerpts[Number(r.rank)],
      raw = object(r.rawMapping);
    check(
      !bound.has(key) &&
        e &&
        row.rawObservationHash === r.rawObservationHash &&
        row.question === r.question &&
        e.source === r.source &&
        e.text === r.text &&
        e.start === r.start &&
        e.end === r.end &&
        raw.start === null &&
        raw.end === null &&
        raw.mapping === 'adjudication' &&
        nonempty(r.reason),
      'Coordinate lineage mismatch',
    );
    bound.add(key);
    const q = questions.find((q) => q.id === row.question)!,
      body = sources.get(`${q.project}/${e.source}`)!;
    check(
      hash(body) === r.sourceHash && nonempty(r.rawHeader),
      'Coordinate source/header mismatch',
    );
    const match = /^@@ -(\d+),\d+ @@/.exec(r.rawHeader);
    check(match, 'Invalid saved QMD header');
    const candidates = [];
    for (let at = body.indexOf(e.text); at !== -1; at = body.indexOf(e.text, at + 1)) {
      const prefix = body.slice(0, at),
        start = Array.from(prefix).length;
      const startLine = prefix.split('\n').length,
        startColumn = Array.from(prefix.slice(prefix.lastIndexOf('\n') + 1)).length + 1;
      candidates.push({
        start,
        end: start + Array.from(e.text).length,
        startLine,
        startColumn,
        headerCompatible: startLine === Number(match[1]),
      });
    }
    check(
      serialize(candidates) === serialize(r.possibleMatches),
      'Incomplete coordinate candidate ledger',
    );
    const compatible = candidates.filter((c) => c.headerCompatible);
    check(
      candidates.length > 1 && compatible.length === 1 && compatible[0]!.start === e.start,
      'Ambiguous coordinate choice',
    );
  }
  for (const row of rows)
    for (const [rank, e] of row.excerpts.entries()) {
      const q = questions.find((q) => q.id === row.question)!,
        body = sources.get(`${q.project}/${e.source}`)!;
      const first = body.indexOf(e.text);
      if (body.indexOf(e.text, first + 1) !== -1)
        check(
          bound.has(JSON.stringify([row.id, rank])),
          'Repeated excerpt requires coordinate adjudication',
        );
    }
}

export function computePublication(
  manifestValue: unknown,
  labelsValue: unknown,
  commonValue: unknown,
  observationsValue: unknown,
  adjudicationsValue: unknown,
  sources: Map<string, string>,
) {
  const manifest = manifestFor(manifestValue),
    labels = validateLabels(labelsValue, sources, 'complete');
  check(
    labels.status === 'reviewed' && labels.questions.length === 80,
    'Expected reviewed 80 labels',
  );
  const questions = labels.questions.filter((q) => q.split === 'held-out');
  check(
    questions.length === 50 && questions.filter((q) => q.answerable).length === 39,
    'Changed held-out allocation',
  );
  const rows = observationsFor(observationsValue, questions, sources);
  const runs = object(manifestValue).runs;
  check(Array.isArray(runs) && runs.length === 4, 'Expected four bound runs');
  const identities = new Set<string>();
  for (const item of runs) {
    const run = object(item);
    check(
      digest(run.runIdentity) &&
        !identities.has(run.runIdentity) &&
        run.inputsHash === run.runIdentity &&
        run.freezeHash === manifest.freezeHash,
      'Invalid run binding',
    );
    identities.add(run.runIdentity);
    const captures = rows.filter((r) => r.runIdentity === run.runIdentity);
    check(
      captures.length > 0 &&
        captures.every((r) => r.system === run.system && r.phase === run.phase),
      'Run cohort mismatch',
    );
    if (run.phase === 'supplemental-heldout')
      check(
        runs.some((item) => {
          const original = object(item);
          return (
            original.runIdentity === run.originalRunIdentity &&
            original.system === 'proposal' &&
            original.phase === 'original-heldout'
          );
        }),
        'Supplemental original run mismatch',
      );
  }
  check(
    rows.every((r) => identities.has(r.runIdentity)),
    'Unbound observation run',
  );
  validateCoordinates(adjudicationsValue, rows, questions, sources);
  const review = validateCommon(commonValue, questions, sources, manifest.expectedCommonHashes, {
    split: 'held-out',
    freezeHash: manifest.freezeHash,
  });
  const names = ['baseline', 'qmd', 'proposalOriginal', 'proposalDiagnostic'] as const;
  type Name = (typeof names)[number];
  const cohorts = {} as Record<
    Name,
    {
      rows: (Measurement & { phase: string; kind: string; observationHash: string })[];
      summary: ReturnType<typeof summarize>;
    }
  >;
  const selected = {} as Record<Name, PublicationObservation[]>;
  for (const name of names) {
    const system = name.startsWith('proposal') ? 'proposal' : name;
    const captures = questions.map((q) =>
      rows.find(
        (r) =>
          r.question === q.id &&
          r.system === system &&
          (name === 'proposalDiagnostic' ? r.kind === 'actual' : r.phase === 'original-heldout'),
      )!,
    );
    check(captures.every(Boolean), 'Missing cohort observation');
    selected[name] = captures;
    const measurements = captures.map((row, i) => {
      const metrics = scoreCommon(
        questions[i]!,
        row.excerpts,
        row.exitCode !== 0 || row.timedOut,
        review,
      );
      check(!metrics.unresolved, 'Incomplete displayed-evidence review');
      return {
        question: row.question,
        repetition: 0,
        elapsedMs: row.elapsedMs,
        metrics,
        phase: row.phase,
        kind: row.kind,
        observationHash: row.rawObservationHash,
      };
    });
    cohorts[name] = { rows: measurements, summary: summarize(questions, measurements, 1) };
  }
  const comparisons = {} as Record<string, ReturnType<typeof compare>>;
  for (const proposal of ['proposalOriginal', 'proposalDiagnostic'] as const)
    for (const comparator of ['baseline', 'qmd'] as const)
      comparisons[`${comparator}->${proposal}`] = compare(
        questions,
        cohorts[comparator].rows,
        cohorts[proposal].rows,
        1,
        manifest.gates.quality.bootstrap.seed,
      );
  type Status = 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  const gates = {} as Record<
    'proposalOriginal' | 'proposalDiagnostic',
    {
      checks: { id: string; status: Status; evidence: unknown }[];
      decision: 'GATES_PASS' | 'NO_ROLLOUT';
      authority: string;
    }
  >;
  for (const name of ['proposalOriginal', 'proposalDiagnostic'] as const) {
    const checks: { id: string; status: Status; evidence: unknown }[] = [],
      cohort = cohorts[name],
      frozen = manifest.gates;
    const add = (id: string, status: Status, evidence: unknown) =>
      checks.push({ id, status, evidence });
    for (const comparator of ['baseline', 'qmd'] as const)
      for (const metric of ['useful8', 'ndcg8'] as const) {
        const c = comparisons[`${comparator}->${name}`]![metric]!,
          limit = frozen.quality[comparator],
          margin =
            metric === 'useful8'
              ? limit.useful8MinimumMeanDelta
              : limit.unitNoveltyNdcg8MinimumMeanDelta;
        add(
          `${comparator}.${metric}`,
          !c.paired || c.missingQueries
            ? 'INCONCLUSIVE'
            : c.paired.meanDelta >= margin && c.paired.interval95[0]! >= limit.bothMinimumLower95
              ? 'PASS'
              : 'FAIL',
          { ...c, minimumMeanDelta: margin, minimumLower95: limit.bothMinimumLower95 },
        );
      }
    const baseline = cohorts.baseline.summary.slices.identifiers!.metrics.useful8,
      proposal = cohort.summary.slices.identifiers!.metrics.useful8;
    add(
      'identifierUseful8',
      baseline.missingQueries ||
        proposal.missingQueries ||
        baseline.mean === null ||
        proposal.mean === null
        ? 'INCONCLUSIVE'
        : proposal.mean - baseline.mean >= 0
          ? 'PASS'
          : 'FAIL',
      { baseline, proposal },
    );
    for (const metric of ['nonempty', 'misleading'] as const) {
      const measured = cohort.rows.filter((r) => r.metrics[metric] !== null),
        peers = cohorts.baseline.rows.filter((r) => r.metrics[metric] !== null);
      const count = measured.reduce((n, r) => n + r.metrics[metric]!, 0),
        baselineCount = peers.reduce((n, r) => n + r.metrics[metric]!, 0),
        maximum =
          metric === 'nonempty'
            ? frozen.quality.unanswerable.maximumNonemptyCount
            : frozen.quality.unanswerable.maximumMisleadingCount;
      add(
        `unsupported.${metric}`,
        count > maximum
          ? 'FAIL'
          : measured.length !== 11 || peers.length !== 11
            ? 'INCONCLUSIVE'
            : count <= baselineCount
              ? 'PASS'
              : 'FAIL',
        {
          count,
          maximum,
          baselineCount,
          maximumDelta: 0,
          knownQueries: measured.length,
          expectedQueries: 11,
          failedQueries: cohort.summary.overall.unanswerableFailures,
        },
      );
    }
    const costs = selected[name].map((r) => r.cost!),
      unknownCosts = costs.reduce((n, r) => n + r.unknownAttempts, 0),
      knownP95 = costs.map((r) => r.knownUsd).sort((a, b) => a - b)[47]!;
    add(
      'processLatencyP95',
      cohort.summary.timing.p95! <= frozen.performance.proposalProcessElapsedP95Ms
        ? 'PASS'
        : 'FAIL',
      {
        observedMs: cohort.summary.timing.p95,
        maximumMs: frozen.performance.proposalProcessElapsedP95Ms,
        samples: 50,
        scope:
          name === 'proposalOriginal'
            ? 'Includes 42 evaluator skips; not 50 actual product searches'
            : '8 original actual plus 42 supplemental actual; shared host/observer process',
      },
    );
    add(
      'requestCostP95',
      unknownCosts
        ? 'INCONCLUSIVE'
        : knownP95 <= frozen.performance.proposalKnownRequestCostP95Usd
          ? 'PASS'
          : 'FAIL',
      {
        knownLowerBoundUsd: knownP95,
        maximumUsd: frozen.performance.proposalKnownRequestCostP95Usd,
        unknownAttempts: unknownCosts,
      },
    );
    add(
      'failedQueries',
      cohort.summary.overall.failures <= frozen.performance.maximumFailedProposalQueries
        ? 'PASS'
        : 'FAIL',
      {
        failed: cohort.summary.overall.failures,
        maximum: frozen.performance.maximumFailedProposalQueries,
        evaluatorSkips: name === 'proposalOriginal' ? 42 : 0,
      },
    );
    add(
      'unknownCosts',
      unknownCosts <= frozen.performance.maximumUnknownProposalCosts ? 'PASS' : 'FAIL',
      { unknownAttempts: unknownCosts, maximum: frozen.performance.maximumUnknownProposalCosts },
    );
    gates[name] = {
      checks,
      decision: checks.every((c) => c.status === 'PASS') ? 'GATES_PASS' : 'NO_ROLLOUT',
      authority:
        name === 'proposalOriginal'
          ? 'Original frozen evaluation'
          : 'Supplemental diagnostic only; cannot replace original decision',
    };
  }
  return {
    version: 1,
    freezeHash: manifest.freezeHash,
    protocol: review.protocol,
    cohorts,
    comparisons,
    gates,
    decision: gates.proposalOriginal.decision,
    limitations: [
      'Original 42 evaluator skips are failed captures, not observed product failures. Supplemental observations cannot replace original release authority.',
      'Unit-novelty nDCG and pooled source-unit recall are not standard document nDCG or complete-corpus recall.',
      'Single-pass timings include shared-host effects; proposal observer timing is not compiled-CLI timing.',
      'Unknown request costs remain unknown; known costs are lower bounds.',
      'Hashes bind omitted raw captures but do not independently authenticate provider responses.',
    ],
  };
}

export async function replayPublication(bundle: string, corpusRoot: string) {
  const manifest = manifestFor(await Bun.file(join(bundle, 'manifest.json')).json());
  const repo = resolve(dirname(import.meta.path), '../..');
  for (const path of publicationModules)
    check(digest(manifest.modules[path]), `Missing module binding: ${path}`);
  for (const [path, expected] of Object.entries(manifest.modules))
    check(hash(await Bun.file(join(repo, path)).bytes()) === expected, `Module mismatch: ${path}`);
  const values: Record<string, unknown> = {};
  for (const path of bundleFiles)
    check(digest(manifest.files[path]), `Missing bundle binding: ${path}`);
  for (const [path, expected] of Object.entries(manifest.files)) {
    const bytes = await Bun.file(join(bundle, path)).bytes();
    check(hash(bytes) === expected, `Bundle mismatch: ${path}`);
    if ((bundleFiles as readonly string[]).includes(path))
      values[path] = JSON.parse(new TextDecoder().decode(bytes));
  }
  const corpusBytes = await Bun.file(join(repo, 'docs/evaluation/corpus.json')).bytes();
  check(hash(corpusBytes) === manifest.corpusHash, 'Corpus manifest mismatch');
  const sources = await validateSources(
    parseCorpus(JSON.parse(new TextDecoder().decode(corpusBytes))),
    corpusRoot,
  );
  const result = computePublication(
    manifest,
    values['labels.json'],
    values['common.json'],
    values['observations.json'],
    values['adjudications.json'],
    sources,
  );
  check(serialize(result) === serialize(values['expected.json']), 'Published result mismatch');
  return result;
}
if (import.meta.main) {
  const [bundle, corpus] = process.argv.slice(2);
  check(
    bundle && corpus && process.argv.length === 4,
    'Usage: bun scripts/retrieval-eval/replay-publication.ts BUNDLE CORPUS_ROOT',
  );
  const result = await replayPublication(resolve(bundle), resolve(corpus));
  console.log(
    JSON.stringify({
      replay: 'PASS',
      decision: result.decision,
      supplementalDiagnostic: result.gates.proposalDiagnostic.decision,
    }),
  );
}
