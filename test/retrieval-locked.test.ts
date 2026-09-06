import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allocation, type Labels, type Question } from '@/scripts/retrieval-eval/labels';
import { git, hash, serialize } from '@/scripts/retrieval-eval/corpus';
import {
  COMMON_PROTOCOL,
  scoreCommon,
  validateCommon,
  type CommonSidecar,
} from '@/scripts/retrieval-eval/common';
import {
  loadLocked,
  runLockedSystem,
  type FreezeManifest,
  type LockedCapture,
  type LockedIO,
} from '@/scripts/retrieval-eval/locked';
import { mapExcerpt } from '@/scripts/retrieval-eval/scoring';

const encode = (value: string) => new TextEncoder().encode(value);
const body = 'exact supporting text';
const source = '.agent/knowledge/a.md';
function fixture() {
  const questions: Question[] = [];
  for (const [slice, counts] of Object.entries(allocation)) {
    for (const [index, split] of ['development', 'held-out'].entries()) {
      for (let i = 0; i < counts[index]!; i++) {
        const id = `${slice}-${split}-${i}`;
        questions.push({
          id,
          project: 'p',
          question: `Synthetic ${id}`,
          family: id,
          slice: slice as Question['slice'],
          secondary: [],
          split: split as Question['split'],
          answerable: slice !== 'unanswerable',
          facets: [],
          reason: 'Synthetic',
          evidence: [
            {
              id: 'e',
              source,
              start: 0,
              end: body.length,
              grade: slice === 'unanswerable' ? 0 : 2,
              facets: [],
              reason: 'Exact synthetic evidence',
            },
          ],
        });
      }
    }
  }
  const complete: Labels = {
    version: 1,
    status: 'reviewed',
    reviews: [
      { reviewer: 'a', kind: 'agent', revision: 'one' },
      { reviewer: 'b', kind: 'agent', revision: 'two' },
    ],
    adjudication: 'synthetic',
    questions,
  };
  const heldOut: Labels = {
    ...structuredClone(complete),
    adjudication: 'separate synthetic review',
    questions: structuredClone(questions.filter((q) => q.split === 'held-out')),
  };
  const contents = new Map<string, Uint8Array>([
    ['/synthetic/source', encode(body)],
    ['/synthetic/executable', encode('synthetic executable')],
    ['/private/complete', encode(serialize(complete))],
    ['/private/held-out', encode(serialize(heldOut))],
  ]);
  const bound = (path: string) => ({ path, sha256: hash(contents.get(path)!) });
  const manifest: FreezeManifest = {
    version: 1,
    files: { source: bound('/synthetic/source'), executable: bound('/synthetic/executable') },
    labels: { complete: bound('/private/complete'), heldOut: bound('/private/held-out') },
    sources: [{ project: 'p', source, file: 'source' }],
    systems: [
      {
        id: 'qmd',
        executable: 'executable',
        args: ['query', '{question}', '--index', '{project}'],
        cwdByProject: { p: '/synthetic/p' },
        environment: { PATH: '/synthetic/bin' },
        secretEnvironment: [],
        timeoutMs: 1000,
        bindings: ['source'],
      },
    ],
    gates: { minimumUseful: 0.8 },
    configuration: { stack: 'synthetic' },
  };
  const options = {
    repository: '/synthetic/repo',
    manifestPath: 'freeze.json',
    commit: 'a'.repeat(40),
    expectedFreezeHash: '',
  };
  const refresh = () => {
    const bytes = encode(serialize(manifest));
    contents.set('/synthetic/repo/freeze.json', bytes);
    options.expectedFreezeHash = hash(bytes);
  };
  refresh();
  const reads: string[] = [];
  const io: LockedIO = {
    read: async (path) => {
      reads.push(path);
      const value = contents.get(path);
      if (!value) throw new Error(`Unknown synthetic file: ${path}`);
      return value;
    },
    committed: async () => {
      reads.push('committed');
      return contents.get('/synthetic/repo/freeze.json')!;
    },
  };
  return {
    manifest,
    options,
    contents,
    complete,
    heldOut,
    reads,
    io,
    refresh,
    load: () => loadLocked(options, io),
  };
}

const successful: LockedCapture = async (_command, _cwd, identity, unit) => ({
  version: 1,
  identity,
  unit,
  started: '2026-09-06T00:00:00Z',
  ended: '2026-09-06T00:00:01Z',
  elapsedMs: 1000,
  exitCode: 0,
  stdout: '[]',
  stderr: '',
  timedOut: false,
  usage: null,
  usageReason: 'Synthetic unknown',
  stageTimings: null,
  stageReason: 'Synthetic unknown',
});

test('freeze digest, committed bytes and all file bindings gate every private read', async () => {
  for (const mode of ['digest', 'commit', 'file'] as const) {
    const f = fixture();
    if (mode === 'digest') f.options.expectedFreezeHash = '0'.repeat(64);
    if (mode === 'commit') f.io.committed = async () => encode('different committed bytes');
    if (mode === 'file') f.contents.set('/synthetic/executable', encode('changed executable'));
    await expect(f.load()).rejects.toThrow();
    expect(f.reads.some((path) => path.startsWith('/private/'))).toBe(false);
  }
});

test('validated complete eighty selects the exact independently reviewed fifty without relabeling', async () => {
  const f = fixture();
  const loaded = await f.load();
  expect(loaded.questions).toHaveLength(50);
  expect(loaded.questions.filter((q) => q.answerable)).toHaveLength(39);
  expect(loaded.questions.every((q) => q.split === 'held-out')).toBe(true);
  expect(f.reads.indexOf('/private/complete')).toBeGreaterThan(
    f.reads.indexOf('/synthetic/executable'),
  );
  expect(f.reads.indexOf('/private/held-out')).toBeGreaterThan(
    f.reads.indexOf('/private/complete'),
  );
  expect(loaded.sources.get(`p/${source}`)).toBe(body);
});

test('actual private byte hashes are checked before trusting parsed selection or envelope', async () => {
  const f = fixture();
  f.contents.set('/private/complete', encode(`${serialize(f.complete)} `));
  await expect(f.load()).rejects.toThrow('Frozen file digest mismatch');
  expect(f.reads).not.toContain('/private/held-out');
  const g = fixture();
  g.contents.set('/private/held-out', encode(`${serialize(g.heldOut)} `));
  await expect(g.load()).rejects.toThrow('Frozen file digest mismatch');
});

test('complete allocation, split families, held-out selection and review ledger are mandatory', async () => {
  for (const mode of ['allocation', 'family', 'selection', 'ledger'] as const) {
    const f = fixture();
    if (mode === 'allocation') f.complete.questions.pop();
    if (mode === 'family')
      f.complete.questions.find((q) => q.split === 'held-out')!.family =
        f.complete.questions[0]!.family;
    if (mode === 'selection') f.heldOut.questions[0]!.question = 'Different reviewed question';
    if (mode === 'ledger') f.heldOut.reviews = f.heldOut.reviews.slice(0, 1);
    f.contents.set('/private/complete', encode(serialize(f.complete)));
    f.contents.set('/private/held-out', encode(serialize(f.heldOut)));
    f.manifest.labels.complete.sha256 = hash(f.contents.get('/private/complete')!);
    f.manifest.labels.heldOut.sha256 = hash(f.contents.get('/private/held-out')!);
    f.refresh();
    await expect(f.load()).rejects.toThrow();
  }
});

test('common scoring requires explicit matching held-out freeze and preserves the question split', async () => {
  const f = fixture();
  const loaded = await f.load(),
    q = loaded.questions[0]!;
  const sidecar: CommonSidecar = {
    version: 1,
    protocol: COMMON_PROTOCOL,
    hashes: { releaseFreeze: loaded.freezeHash },
    units: [
      {
        question: q.id,
        id: 'u',
        source,
        start: 0,
        end: body.length,
        targetGrade: 2,
        facets: [],
        reason: 'Synthetic',
      },
    ],
    legacyBindings: [{ question: q.id, evidenceId: 'e', unitIds: ['u'], reason: 'Synthetic' }],
    renderings: [
      {
        question: q.id,
        source,
        text: body,
        start: 0,
        end: body.length,
        displayGrade: 2,
        facets: [],
        misleading: false,
        quote: { text: body, start: 0, end: body.length },
        credits: [{ unitId: 'u', achievedGrade: 2 }],
        reason: 'Synthetic',
      },
    ],
  };
  expect(() => validateCommon(sidecar, [q], loaded.sources, sidecar.hashes)).toThrow(
    'split forbidden',
  );
  expect(() =>
    validateCommon(sidecar, [q], loaded.sources, sidecar.hashes, {
      split: 'held-out',
      freezeHash: '0'.repeat(64),
    }),
  ).toThrow('matching release freeze');
  const review = validateCommon(sidecar, [q], loaded.sources, sidecar.hashes, {
    split: 'held-out',
    freezeHash: loaded.freezeHash,
  });
  expect(scoreCommon(q, [mapExcerpt(source, body, body)], false, review).useful).toEqual([
    1, 1, 1, 1,
  ]);
  expect(q.split).toBe('held-out');
  expect(() =>
    validateCommon(sidecar, [{ ...q, split: 'development' }], loaded.sources, sidecar.hashes, {
      split: 'held-out',
      freezeHash: loaded.freezeHash,
    }),
  ).toThrow('split forbidden');
});

test('one serial observation per question resumes identically and retains failure and capture exceptions', async () => {
  const f = fixture(),
    loaded = await f.load();
  const directory = await mkdtemp(join(tmpdir(), 'retrieval-locked-'));
  let calls = 0,
    active = 0,
    maximum = 0;
  const execute: LockedCapture = async (...args) => {
    calls++;
    active++;
    maximum = Math.max(maximum, active);
    try {
      expect(args[0][0]).toBe('/synthetic/executable');
      expect(args[1]).toBe('/synthetic/p');
      expect(args[5]).toEqual({ PATH: '/synthetic/bin' });
      if (calls === 1) throw new Error('Synthetic interrupted launcher');
      const observation = await successful(...args);
      if (calls === 3) return { ...observation, identity: 'invalid returned identity' };
      return calls === 2
        ? { ...observation, exitCode: 7, stderr: 'retained failure' }
        : observation;
    } finally {
      active--;
    }
  };
  try {
    const first = await runLockedSystem(loaded, 'qmd', directory, execute);
    expect(calls).toBe(50);
    expect(maximum).toBe(1);
    expect(first[0]!.observation.exitCode).toBe(1);
    expect(first[1]!.observation.exitCode).toBe(7);
    expect(first[2]!.observation.exitCode).toBe(1);
    const resumed = await runLockedSystem(await f.load(), 'qmd', directory, execute);
    expect(calls).toBe(50);
    expect(resumed).toEqual(first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('publication failure after execution retains a blocking system claim after disk repair', async () => {
  const f = fixture(),
    loaded = await f.load();
  const directory = await mkdtemp(join(tmpdir(), 'retrieval-locked-publication-'));
  let calls = 0,
    obstruction = '';
  const execute: LockedCapture = async (...args) => {
    calls++;
    if (calls === 1) {
      obstruction = join(directory, args[2], `${args[3]}.json`);
      await mkdir(obstruction);
    }
    return successful(...args);
  };
  try {
    await expect(runLockedSystem(loaded, 'qmd', directory, execute)).rejects.toThrow();
    expect(calls).toBe(1);
    await rm(obstruction, { recursive: true });
    let resumeError: unknown;
    try {
      await runLockedSystem(await f.load(), 'qmd', directory, execute);
    } catch (error) {
      resumeError = error;
    }
    expect(calls).toBe(1);
    expect(resumeError).toBeInstanceOf(Error);
    expect((resumeError as Error).message).toContain('active or interrupted claim');
    expect(await Bun.file(join(directory, 'qmd.claim')).exists()).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('output custody mismatch and active/lost system claims block without execution', async () => {
  const f = fixture(),
    loaded = await f.load();
  const directory = await mkdtemp(join(tmpdir(), 'retrieval-locked-custody-'));
  let calls = 0;
  const execute: LockedCapture = async (...args) => {
    calls++;
    return successful(...args);
  };
  try {
    await Bun.write(
      join(directory, 'locked-inputs.json'),
      serialize({ version: 1, freezeHash: 'other', commit: f.options.commit }),
    );
    await expect(runLockedSystem(loaded, 'qmd', directory, execute)).rejects.toThrow(
      'custody mismatch',
    );
    await Bun.write(
      join(directory, 'locked-inputs.json'),
      serialize({
        version: 1,
        freezeHash: loaded.freezeHash,
        commit: loaded.commit,
        runtime: Bun.version,
      }),
    );
    await Bun.write(join(directory, 'qmd.claim'), 'synthetic interrupted claim');
    await expect(runLockedSystem(loaded, 'qmd', directory, execute)).rejects.toThrow(
      'active or interrupted claim',
    );
    expect(calls).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('validated handles cannot be forged and bound file changes block launch', async () => {
  const f = fixture(),
    loaded = await f.load();
  const directory = await mkdtemp(join(tmpdir(), 'retrieval-locked-binding-'));
  try {
    await expect(
      runLockedSystem(structuredClone(loaded), 'qmd', directory, successful),
    ).rejects.toThrow('custody validation');
    f.contents.set('/synthetic/executable', encode('changed after labels loaded'));
    await expect(runLockedSystem(loaded, 'qmd', directory, successful)).rejects.toThrow(
      'digest mismatch',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('default byte readers verify an actual committed synthetic manifest before label selection', async () => {
  const f = fixture();
  const directory = await mkdtemp(join(tmpdir(), 'retrieval-locked-git-'));
  try {
    for (const [name, binding] of Object.entries(f.manifest.files)) {
      const bytes = f.contents.get(binding.path)!;
      binding.path = join(directory, name);
      await Bun.write(binding.path, bytes);
    }
    for (const [name, binding] of Object.entries(f.manifest.labels)) {
      const bytes = f.contents.get(binding.path)!;
      binding.path = join(directory, name);
      await Bun.write(binding.path, bytes);
    }
    const bytes = serialize(f.manifest);
    await Bun.write(join(directory, 'freeze.json'), bytes);
    await git(directory, ['init', '-q']);
    await git(directory, ['add', 'freeze.json']);
    await git(directory, [
      '-c',
      'user.name=Synthetic Test',
      '-c',
      'user.email=synthetic@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      'Synthetic freeze fixture',
    ]);
    const commit = new TextDecoder().decode(await git(directory, ['rev-parse', 'HEAD'])).trim();
    const options = {
      repository: directory,
      manifestPath: 'freeze.json',
      commit,
      expectedFreezeHash: hash(bytes),
    };
    expect((await loadLocked(options)).questions).toHaveLength(50);
    await Bun.write(join(directory, 'freeze.json'), `${bytes} `);
    await expect(loadLocked({ ...options, expectedFreezeHash: hash(`${bytes} `) })).rejects.toThrow(
      'committed bytes',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
