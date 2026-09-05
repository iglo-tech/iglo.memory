import { basename, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import {
  check,
  hash,
  object,
  parseCorpus,
  serialize,
  validateSources,
} from '@/scripts/retrieval-eval/corpus';
import { validateLabels, type Question } from '@/scripts/retrieval-eval/labels';
import { parseObservation, publishOnce } from '@/scripts/retrieval-eval/records';
import { summarize, compare, type Measurement } from '@/scripts/retrieval-eval/report';
import { baselineExcerpts, qmdExcerpts, score } from '@/scripts/retrieval-eval/scoring';

type Expected = { corpusHash: string; labelsHash: string };
export async function readRun(
  directory: string,
  expected: Expected,
  questions: Question[],
  sources: Map<string, string>,
) {
  const bytes = await Bun.file(join(directory, 'inputs.json')).text();
  const inputs = object(JSON.parse(bytes));
  const identity = hash(serialize(inputs));
  check(basename(directory) === identity, 'Run directory/identity mismatch');
  check(
    inputs.version === 1 &&
      inputs.corpusHash === expected.corpusHash &&
      inputs.labelsHash === expected.labelsHash,
    'Frozen corpus/labels mismatch',
  );
  const config = object(inputs.config);
  check(config.system === 'baseline' || config.system === 'qmd', 'Unknown comparator');
  check(
    config.commit ===
      (config.system === 'baseline'
        ? '9670f625661e46935ec1523bb70c6dd8b35d48e4'
        : 'dbfd0b4736aeaf761d1a16ca8e424f071df8feb9'),
    'Wrong comparator pin',
  );
  check(
    Number.isSafeInteger(config.repetitions) &&
      Number(config.repetitions) > 0 &&
      Number(config.repetitions) <= 100,
    'Invalid repetitions',
  );
  check(
    config.regime === 'new-process' &&
      typeof config.cacheFacts === 'string' &&
      config.cacheFacts.trim(),
    'Missing cache regime facts',
  );
  check(inputs.scoring === 'presented-evidence-v1', 'Unknown evidence surface');
  const rows: Measurement[] = [];
  const digests: Record<string, string> = {};
  const missing: string[] = [];
  for (const question of questions)
    for (let repetition = 0; repetition < Number(config.repetitions); repetition++) {
      check(/^[a-zA-Z0-9_-]+$/.test(question.id), 'Unsafe question ID');
      const unit = `${question.id}-${repetition}`,
        path = join(directory, `${unit}.json`);
      if (!(await Bun.file(path).exists())) {
        missing.push(unit);
        continue;
      }
      const raw = await Bun.file(path).text();
      digests[unit] = hash(raw);
      const observation = parseObservation(JSON.parse(raw), identity, unit);
      let failed = observation.exitCode !== 0 || observation.timedOut;
      let excerpts: ReturnType<typeof baselineExcerpts> = [];
      if (!failed) {
        try {
          excerpts = (config.system === 'baseline' ? baselineExcerpts : qmdExcerpts)(
            JSON.parse(observation.stdout),
            question.project,
            sources,
          );
        } catch {
          failed = true;
        }
      }
      rows.push({
        question: question.id,
        repetition,
        elapsedMs: observation.elapsedMs,
        metrics: score(question, excerpts, failed),
      });
    }
  // Scores are recalculated from original immutable stdout, never copied from reports.
  return {
    identity,
    system: config.system,
    repetitions: Number(config.repetitions),
    regime: config.regime,
    cacheFacts: config.cacheFacts,
    rows,
    digests,
    missing,
  };
}
export function requireMatchingProtocol(
  first: Awaited<ReturnType<typeof readRun>>,
  second: Awaited<ReturnType<typeof readRun>>,
) {
  check(first.system !== second.system, 'Comparison requires different systems');
  check(
    first.repetitions === second.repetitions &&
      first.regime === second.regime &&
      first.cacheFacts === second.cacheFacts,
    'Cache protocol or repetition mismatch; keep experiments separate',
  );
}
export async function main(configPath: string) {
  const config = object(await Bun.file(configPath).json());
  for (const key of ['manifest', 'corpusRoot', 'labels', 'firstRun', 'secondRun', 'output'])
    check(typeof config[key] === 'string', `Missing ${key}`);
  const manifestBytes = await Bun.file(config.manifest as string).text(),
    labelBytes = await Bun.file(config.labels as string).text();
  const sources = await validateSources(
    parseCorpus(JSON.parse(manifestBytes)),
    config.corpusRoot as string,
  );
  const labels = validateLabels(JSON.parse(labelBytes), sources, 'development');
  const expected = { corpusHash: hash(manifestBytes), labelsHash: hash(labelBytes) };
  const [first, second] = await Promise.all([
    readRun(config.firstRun as string, expected, labels.questions, sources),
    readRun(config.secondRun as string, expected, labels.questions, sources),
  ]);
  requireMatchingProtocol(first, second);
  const inputs = {
    version: 1,
    ...expected,
    firstIdentity: first.identity,
    secondIdentity: second.identity,
    firstDigests: first.digests,
    secondDigests: second.digests,
    implementationHash: hash(
      (
        await Promise.all(
          ['join', 'corpus', 'labels', 'records', 'scoring', 'report'].map((name) =>
            Bun.file(new URL(`./${name}.ts`, import.meta.url)).text(),
          ),
        )
      ).join('\n'),
    ),
  };
  const identity = hash(serialize(inputs));
  const output = {
    version: 1,
    identity,
    inputs,
    status: 'INCOMPLETE',
    reason:
      'Matching metadata is necessary, not proof of actual cache/model stages, reviewer judgments, custody or release gates. No comparison approval is inferred.',
    labels: labels.status,
    regime: first.regime,
    cacheFacts: first.cacheFacts,
    first: {
      identity: first.identity,
      system: first.system,
      missing: first.missing,
      summary: summarize(labels.questions, first.rows, first.repetitions),
    },
    second: {
      identity: second.identity,
      system: second.system,
      missing: second.missing,
      summary: summarize(labels.questions, second.rows, second.repetitions),
    },
    paired: compare(labels.questions, first.rows, second.rows, first.repetitions),
  };
  await mkdir(config.output as string, { recursive: true, mode: 0o700 });
  const path = join(config.output as string, `${identity}.json`);
  if (await Bun.file(path).exists())
    check((await Bun.file(path).text()) === serialize(output), 'Joined report mismatch');
  else await publishOnce(path, output);
  return { status: output.status, report: path };
}
if (import.meta.main) {
  try {
    check(Bun.argv.length === 3, 'Usage: bun scripts/retrieval-eval/join.ts CONFIG.json');
    console.log(serialize(await main(Bun.argv[2]!)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Join failed');
    process.exitCode = 1;
  }
}
