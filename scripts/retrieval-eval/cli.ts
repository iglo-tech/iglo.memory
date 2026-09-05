import { resolve, join } from 'node:path';
import { cpus, totalmem, platform, arch } from 'node:os';
import {
  check,
  hash,
  object,
  parseCorpus,
  serialize,
  validateSources,
  materialize,
} from '@/scripts/retrieval-eval/corpus';
import { validateLabels } from '@/scripts/retrieval-eval/labels';
import { capture, runUnit, publishOnce } from '@/scripts/retrieval-eval/records';
import { baselineExcerpts, qmdExcerpts, score } from '@/scripts/retrieval-eval/scoring';

export async function main(args: string[]) {
  const [command, configPath] = args;
  check(
    configPath && args.length === 2,
    'Usage: bun scripts/retrieval-eval/cli.ts materialize|validate|run CONFIG.json',
  );
  const config = object(await Bun.file(configPath).json());
  check(
    typeof config.manifest === 'string' && typeof config.corpusRoot === 'string',
    'Missing corpus paths',
  );
  const manifestBytes = await Bun.file(config.manifest).text();
  const corpus = parseCorpus(JSON.parse(manifestBytes));
  if (command === 'materialize') {
    const checkouts = object(config.checkouts);
    check(
      Object.values(checkouts).every((v) => typeof v === 'string'),
      'Invalid checkout paths',
    );
    await materialize(corpus, checkouts as Record<string, string>, config.corpusRoot);
    return { status: 'MATERIALIZED', corpusHash: hash(manifestBytes) };
  }
  check(command === 'validate' || command === 'run', 'Unknown command');
  const sources = await validateSources(corpus, config.corpusRoot);
  check(typeof config.labels === 'string', 'Missing labels');
  const labelBytes = await Bun.file(config.labels).text();
  const labels = validateLabels(JSON.parse(labelBytes), sources, 'development');
  if (command === 'validate')
    return {
      status: labels.status === 'reviewed' ? 'REVIEW_RECORDED' : 'DRAFT',
      questions: labels.questions.length,
      corpusHash: hash(manifestBytes),
      labelHash: hash(labelBytes),
    };
  check(
    typeof config.output === 'string' &&
      typeof config.executable === 'string' &&
      typeof config.executableHash === 'string',
    'Missing run paths/pin',
  );
  check(config.system === 'baseline' || config.system === 'qmd', 'Unknown comparator');
  check(
    config.commit ===
      (config.system === 'baseline'
        ? '9670f625661e46935ec1523bb70c6dd8b35d48e4'
        : 'dbfd0b4736aeaf761d1a16ca8e424f071df8feb9'),
    'Wrong comparator pin',
  );
  const executable = resolve(config.executable);
  check(
    hash(await Bun.file(executable).bytes()) === config.executableHash,
    'Executable digest mismatch',
  );
  check(
    Number.isSafeInteger(config.repetitions) &&
      Number(config.repetitions) >= 1 &&
      Number(config.repetitions) <= 100,
    'Invalid repetitions',
  );
  check(
    config.regime === 'new-process' &&
      typeof config.cacheFacts === 'string' &&
      config.cacheFacts.trim(),
    'This runner measures new-process only; record cache facts explicitly',
  );
  check(
    typeof config.timeoutMs === 'number' && config.timeoutMs > 0 && config.timeoutMs <= 600000,
    'Invalid timeout',
  );
  check(typeof config.preparationEvidence === 'string', 'Preparation evidence file required');
  const preparationHash = hash(await Bun.file(config.preparationEvidence).bytes());
  const snapshots: Record<string, string> = {};
  if (config.system === 'baseline') {
    for (const project of corpus.projects)
      snapshots[project.id] = hash(
        await Bun.file(
          join(config.corpusRoot, project.id, '.agent/memory-index/snapshot.json'),
        ).bytes(),
      );
  }
  const qmdEnvironment = object(config.qmdEnvironment ?? {});
  check(
    Object.entries(qmdEnvironment).every(
      ([k, v]) => ['XDG_CACHE_HOME', 'XDG_CONFIG_HOME'].includes(k) && typeof v === 'string',
    ),
    'Invalid QMD environment',
  );
  const inputs = {
    version: 1,
    config,
    corpusHash: hash(manifestBytes),
    labelsHash: hash(labelBytes),
    preparationHash,
    snapshots,
    harnessHash: hash(
      (
        await Promise.all(
          ['cli', 'corpus', 'labels', 'records', 'scoring'].map((name) =>
            Bun.file(new URL(`./${name}.ts`, import.meta.url)).text(),
          ),
        )
      ).join('\n'),
    ),
    runtime: Bun.version,
    hardware: { platform: platform(), arch: arch(), memory: totalmem(), cpu: cpus()[0]?.model },
    scoring: 'presented-evidence-v1',
    seed: 20260905,
  };
  const observations = [];
  for (const question of labels.questions) {
    for (let repetition = 0; repetition < Number(config.repetitions); repetition++) {
      const unit = `${question.id}-${repetition}`;
      const cmd =
        config.system === 'baseline'
          ? [executable, 'search', question.question]
          : [
              executable,
              '--index',
              question.project,
              'query',
              question.question,
              '--json',
              '--explain',
              '-n',
              '8',
            ];
      const cwd = resolve(config.corpusRoot, question.project);
      const result = await runUnit(config.output, inputs, unit, (identity) =>
        capture(cmd, cwd, identity, unit, config.timeoutMs as number, {
          ...process.env,
          ...(qmdEnvironment as Record<string, string>),
        }),
      );
      let failure = result.exitCode !== 0 || result.timedOut,
        excerpts: ReturnType<typeof baselineExcerpts> = [];
      let parseError: string | null = null;
      if (!failure) {
        try {
          excerpts = (config.system === 'baseline' ? baselineExcerpts : qmdExcerpts)(
            JSON.parse(result.stdout),
            question.project,
            sources,
          );
        } catch {
          failure = true;
          parseError = 'Output is not valid comparator evidence';
        }
      }
      observations.push({
        question: question.id,
        project: question.project,
        slice: question.slice,
        repetition,
        elapsedMs: result.elapsedMs,
        exitCode: result.exitCode,
        parseError,
        excerpts,
        metrics: score(question, excerpts, failure),
      });
    }
  }
  const report = {
    version: 1,
    identity: hash(serialize(inputs)),
    status: 'INCOMPLETE',
    blockers: [
      'Human review/custody and pooled adjudication need evaluator signoff',
      'Both native comparators and all three timing regimes required',
      'Preparation reuse, full-QMD stage/model proof and paired comparison pending',
    ],
    labels: labels.status,
    system: config.system,
    regime: config.regime,
    cacheFacts: config.cacheFacts,
    metricSurface: 'Presented excerpts only; candidate full text unavailable',
    usage: null,
    usageReason: 'Not exposed by stock executable',
    observations,
    failures: observations.filter((r) => r.metrics.failed).length,
    unresolved: observations.filter((r) => r.metrics.unresolved).length,
    counts: corpus.projects.map((p) => ({
      project: p.id,
      documents: p.files.length,
      bytes: p.files.reduce((sum, f) => sum + f.bytes, 0),
      queries: labels.questions.filter((q) => q.project === p.id).length,
    })),
  };
  const reportPath = join(config.output, report.identity, 'report.json');
  if (await Bun.file(reportPath).exists())
    check(
      (await Bun.file(reportPath).text()) === serialize(report),
      'Report differs; preserve old report and investigate',
    );
  else await publishOnce(reportPath, report);
  return {
    status: report.status,
    report: reportPath,
    failures: report.failures,
    unresolved: report.unresolved,
  };
}
if (import.meta.main) {
  try {
    console.log(serialize(await main(Bun.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Evaluation failed');
    process.exitCode = 1;
  }
}
