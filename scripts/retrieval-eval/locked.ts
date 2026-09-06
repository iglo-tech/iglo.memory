import { mkdir, open, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { check, git, hash, object, safePath, serialize } from '@/scripts/retrieval-eval/corpus';
import { validateLabels, type Question } from '@/scripts/retrieval-eval/labels';
import {
  capture,
  publishOnce,
  runUnit,
  parseObservation,
  type Observation,
} from '@/scripts/retrieval-eval/records';

export type FrozenFile = { path: string; sha256: string };
export type LockedSystem = {
  id: 'baseline' | 'qmd' | 'proposal';
  executable: string;
  args: string[];
  cwdByProject: Record<string, string>;
  environment: Record<string, string>;
  secretEnvironment: string[];
  timeoutMs: number;
  bindings: string[];
};
export type FreezeManifest = {
  version: 1;
  files: Record<string, FrozenFile>;
  labels: { complete: FrozenFile; heldOut: FrozenFile };
  sources: { project: string; source: string; file: string }[];
  systems: LockedSystem[];
  gates: Record<string, unknown>;
  configuration: Record<string, unknown>;
};
export type LockedOptions = {
  repository: string;
  manifestPath: string;
  commit: string;
  expectedFreezeHash: string;
};
export type LockedIO = {
  read: (path: string) => Promise<Uint8Array>;
  committed: (repository: string, commit: string, path: string) => Promise<Uint8Array>;
  verify?: (path: string, sha256: string) => Promise<void>;
};
export type LockedInputs = {
  freezeHash: string;
  commit: string;
  manifest: FreezeManifest;
  questions: Question[];
  sources: Map<string, string>;
};
const digest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const stringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(nonempty);
const decode = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const defaultIO: LockedIO = {
  read: (path) => Bun.file(path).bytes(),
  verify: async (path, sha256) => {
    const hasher = new Bun.CryptoHasher('sha256');
    for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
    check(hasher.digest('hex') === sha256, `Frozen file digest mismatch: ${path}`);
  },
  committed: async (repository, commit, path) => {
    check(
      decode(await git(repository, ['cat-file', '-t', commit])).trim() === 'commit',
      'Freeze pin is not a commit',
    );
    return git(repository, ['show', `${commit}:${path}`]);
  },
};
const state = new WeakMap<LockedInputs, { inputs: LockedInputs; io: LockedIO }>();
function file(value: unknown): FrozenFile {
  const row = object(value);
  check(
    nonempty(row.path) &&
      isAbsolute(row.path) &&
      resolve(row.path) === row.path &&
      digest(row.sha256),
    'Invalid frozen file',
  );
  return { path: row.path, sha256: row.sha256 };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function manifestFor(value: unknown): FreezeManifest {
  const root = object(value);
  check(root.version === 1, 'Invalid release freeze version');
  const files = object(root.files),
    labels = object(root.labels);
  const complete = file(labels.complete),
    heldOut = file(labels.heldOut);
  check(complete.path !== heldOut.path, 'Private label files must be distinct');
  check(Object.keys(files).length > 0, 'Missing frozen files');
  for (const [id, value] of Object.entries(files)) {
    check(nonempty(id), 'Invalid frozen file ID');
    const bound = file(value);
    check(
      bound.path !== complete.path && bound.path !== heldOut.path,
      'Private labels cannot be pre-read bindings',
    );
  }
  check(Object.keys(object(root.gates)).length > 0, 'Missing numerical gate contract');
  object(root.configuration);
  check(Array.isArray(root.sources) && root.sources.length > 0, 'Missing frozen sources');
  const sources = new Set<string>();
  for (const value of root.sources) {
    const row = object(value);
    check(
      nonempty(row.project) &&
        safePath(row.project) &&
        nonempty(row.source) &&
        safePath(row.source),
      'Invalid source ownership',
    );
    check(typeof row.file === 'string' && Object.hasOwn(files, row.file), 'Unbound source file');
    const key = `${row.project}/${row.source}`;
    check(!sources.has(key), 'Duplicate frozen source');
    sources.add(key);
  }
  check(Array.isArray(root.systems) && root.systems.length > 0, 'Missing locked systems');
  const systems = new Set<string>();
  for (const value of root.systems) {
    const row = object(value);
    check(
      (row.id === 'baseline' || row.id === 'qmd' || row.id === 'proposal') && !systems.has(row.id),
      'Duplicate/invalid locked system',
    );
    systems.add(row.id);
    check(
      typeof row.executable === 'string' && Object.hasOwn(files, row.executable),
      'Unbound executable',
    );
    check(
      stringList(row.args) && row.args.filter((arg) => arg === '{question}').length === 1,
      'Command requires one question token',
    );
    check(
      Number.isSafeInteger(row.timeoutMs) &&
        Number(row.timeoutMs) > 0 &&
        Number(row.timeoutMs) <= 600000,
      'Invalid locked timeout',
    );
    const roots = object(row.cwdByProject);
    check(
      Object.keys(roots).length > 0 &&
        Object.values(roots).every(
          (path) => nonempty(path) && isAbsolute(path) && resolve(path) === path,
        ),
      'Invalid locked project roots',
    );
    const env = object(row.environment);
    check(
      Object.entries(env).every(
        ([key, value]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof value === 'string',
      ),
      'Invalid locked environment',
    );
    check(
      stringList(row.secretEnvironment) &&
        new Set(row.secretEnvironment).size === row.secretEnvironment.length &&
        row.secretEnvironment.every(
          (key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !Object.hasOwn(env, key),
        ),
      'Invalid secret environment names',
    );
    check(
      stringList(row.bindings) &&
        new Set(row.bindings).size === row.bindings.length &&
        row.bindings.every((id) => Object.hasOwn(files, id)),
      'Unbound system file',
    );
  }
  return structuredClone(value) as FreezeManifest;
}
async function readBound(io: LockedIO, bound: FrozenFile) {
  const bytes = await io.read(bound.path);
  check(hash(bytes) === bound.sha256, `Frozen file digest mismatch: ${bound.path}`);
  return bytes;
}
async function verifyBound(io: LockedIO, bound: FrozenFile) {
  if (io.verify) await io.verify(bound.path, bound.sha256);
  else await readBound(io, bound);
}

// No private-label read occurs until the committed manifest and every public
// binding have passed. Tests inject byte readers, never private fixture contents.
export async function loadLocked(
  options: LockedOptions,
  io: LockedIO = defaultIO,
): Promise<LockedInputs> {
  check(
    isAbsolute(options.repository) &&
      /^[a-f0-9]{40}$/.test(options.commit) &&
      digest(options.expectedFreezeHash),
    'Invalid freeze custody pin',
  );
  check(!isAbsolute(options.manifestPath), 'Freeze manifest must be repository relative');
  safePath(options.manifestPath);
  const bytes = await io.read(resolve(options.repository, options.manifestPath));
  check(hash(bytes) === options.expectedFreezeHash, 'Release freeze digest mismatch');
  const committed = await io.committed(options.repository, options.commit, options.manifestPath);
  check(
    hash(committed) === options.expectedFreezeHash,
    'Release freeze is not the committed bytes',
  );
  const manifest = manifestFor(JSON.parse(decode(bytes)));
  const verified = new Map<string, Uint8Array>();
  const sourceFiles = new Set(manifest.sources.map((row) => row.file));
  for (const [id, bound] of Object.entries(manifest.files)) {
    if (sourceFiles.has(id)) verified.set(id, await readBound(io, bound));
    else await verifyBound(io, bound);
  }
  const sources = new Map(
    manifest.sources.map((row) => [
      `${row.project}/${row.source}`,
      decode(verified.get(row.file)!),
    ]),
  );
  const complete = validateLabels(
    JSON.parse(decode(await readBound(io, manifest.labels.complete))),
    sources,
    'complete',
  );
  check(complete.status === 'reviewed', 'Complete labels must be reviewed');
  const heldOut = object(JSON.parse(decode(await readBound(io, manifest.labels.heldOut))));
  // Reuse complete-mode validation for the independently reviewed envelope;
  // its private fifty questions are checked against the validated full corpus.
  const heldLedger = validateLabels(
    { ...heldOut, questions: complete.questions },
    sources,
    'complete',
  );
  check(heldLedger.status === 'reviewed', 'Held-out labels must be reviewed');
  const questions = complete.questions.filter((q) => q.split === 'held-out');
  check(
    questions.length === 50 &&
      Array.isArray(heldOut.questions) &&
      canonical(heldOut.questions) === canonical(questions),
    'Held-out selection differs from reviewed fifty',
  );
  for (const system of manifest.systems)
    for (const q of questions)
      check(Object.hasOwn(system.cwdByProject, q.project), 'Missing held-out project root');
  const inputs = {
    freezeHash: options.expectedFreezeHash,
    commit: options.commit,
    manifest,
    questions,
    sources,
  };
  const handle = structuredClone(inputs);
  state.set(handle, { inputs, io });
  return handle;
}

export type LockedCapture = typeof capture;
export async function runLockedSystem(
  handle: LockedInputs,
  systemId: LockedSystem['id'],
  outputDirectory: string,
  execute: LockedCapture = capture,
) {
  const saved = state.get(handle);
  check(saved, 'Locked inputs must pass custody validation');
  const { inputs, io } = saved;
  const system = inputs.manifest.systems.find((s) => s.id === systemId);
  check(system, 'System absent from release freeze');
  // Recheck frozen files before execution, including on resumed runs.
  for (const bound of Object.values(inputs.manifest.files)) await verifyBound(io, bound);
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const custody = {
    version: 1,
    freezeHash: inputs.freezeHash,
    commit: inputs.commit,
    runtime: Bun.version,
  };
  const custodyPath = join(outputDirectory, 'locked-inputs.json');
  if (!(await Bun.file(custodyPath).exists())) {
    try {
      await publishOnce(custodyPath, custody);
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
    }
  }
  check(
    (await Bun.file(custodyPath).text()) === serialize(custody),
    'Locked output custody mismatch',
  );
  // This system-wide claim also prevents parallel QMD queries. A lost claim is
  // an explicit blocker requiring investigation, never permission to retry.
  let claim;
  const claimPath = join(outputDirectory, `${system.id}.claim`);
  try {
    claim = await open(claimPath, 'wx', 0o600);
  } catch (error) {
    if ((error as { code?: string }).code === 'EEXIST')
      throw new Error(`Locked system has an active or interrupted claim: ${system.id}`);
    throw error;
  }
  try {
    const observations: {
      question: string;
      system: LockedSystem['id'];
      observation: Observation;
    }[] = [];
    const runInputs = {
      version: 1,
      freezeHash: inputs.freezeHash,
      commit: inputs.commit,
      labels: inputs.manifest.labels,
      system,
      files: inputs.manifest.files,
      runtime: Bun.version,
    };
    for (const question of inputs.questions) {
      const unit = `${system.id}-${question.id}`;
      const command = [
        inputs.manifest.files[system.executable]!.path,
        ...system.args.map((arg) =>
          arg === '{question}' ? question.question : arg === '{project}' ? question.project : arg,
        ),
      ];
      const cwd = system.cwdByProject[question.project]!;
      const observation = await runUnit(outputDirectory, runInputs, unit, async (identity) => {
        const started = new Date().toISOString(),
          clock = performance.now();
        try {
          const environment: Record<string, string> = { ...system.environment };
          for (const key of system.secretEnvironment) {
            check(nonempty(process.env[key]), `Missing frozen secret environment: ${key}`);
            environment[key] = process.env[key]!;
          }
          return parseObservation(
            await execute(command, cwd, identity, unit, system.timeoutMs, environment),
            identity,
            unit,
          );
        } catch (error) {
          // Spawn/provider/launcher exceptions are completed failed observations.
          // A process killed before this publication leaves its claim as evidence.
          return {
            version: 1,
            identity,
            unit,
            started,
            ended: new Date().toISOString(),
            elapsedMs: performance.now() - clock,
            exitCode: 1,
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Locked capture failed',
            timedOut: false,
            usage: null,
            usageReason: 'Capture failed; billed usage/retries unknown',
            stageTimings: null,
            stageReason: 'Capture failed; stage timings unknown',
          };
        }
      });
      observations.push({ question: question.id, system: system.id, observation });
    }
    return observations;
  } finally {
    await claim.close();
    await unlink(claimPath);
  }
}
