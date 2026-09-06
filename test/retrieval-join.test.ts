import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash, serialize } from '@/scripts/retrieval-eval/corpus';
import { readRun, requireMatchingProtocol } from '@/scripts/retrieval-eval/join';
import type { Question } from '@/scripts/retrieval-eval/labels';
const expected = { corpusHash: hash('corpus'), labelsHash: hash('labels') };
const q: Question = {
  id: 'q',
  project: 'p',
  question: 'Question',
  family: 'f',
  slice: 'paraphrase',
  secondary: [],
  split: 'development',
  answerable: true,
  facets: [],
  reason: 'fixture',
  evidence: [
    {
      id: 'e',
      source: '.agent/knowledge/a.md',
      start: 0,
      end: 2,
      grade: 2,
      facets: [],
      reason: 'direct',
    },
  ],
};
test('joined reader binds hashes and scores immutable observations including failures/missing units', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rv2-join-'));
  try {
    const inputs = {
      version: 1,
      ...expected,
      scoring: 'presented-evidence-v1',
      config: {
        system: 'baseline',
        commit: '9670f625661e46935ec1523bb70c6dd8b35d48e4',
        repetitions: 3,
        regime: 'new-process',
        cacheFacts: 'fixture',
      },
    };
    const identity = hash(serialize(inputs)),
      dir = join(root, identity);
    await mkdir(dir);
    await Bun.write(join(dir, 'inputs.json'), serialize(inputs));
    const record = {
      version: 1,
      identity,
      unit: 'q-0',
      started: '2026-09-05T00:00:00Z',
      ended: '2026-09-05T00:00:01Z',
      elapsedMs: 1000,
      exitCode: 0,
      timedOut: false,
      stdout: JSON.stringify({ results: [{ source: '.agent/knowledge/a.md', snippet: 'aa' }] }),
      stderr: '',
      usage: null,
      usageReason: 'fixture',
      stageTimings: null,
      stageReason: 'fixture',
    };
    await Bun.write(join(dir, 'q-0.json'), serialize(record));
    await Bun.write(
      join(dir, 'q-1.json'),
      serialize({ ...record, unit: 'q-1', exitCode: 1, stdout: 'provider error' }),
    );
    const sources = new Map([['p/.agent/knowledge/a.md', 'aa']]);
    const result = await readRun(dir, expected, [q], sources);
    expect(result.rows[0]?.metrics.useful).toEqual([1, 1, 1, 1]);
    expect(result.rows[1]?.metrics.failed).toBe(true);
    expect(result.missing).toEqual(['q-2']);
    await expect(
      readRun(dir, { ...expected, labelsHash: hash('changed') }, [q], sources),
    ).rejects.toThrow('mismatch');
    await Bun.write(join(dir, 'q-0.json'), '{');
    await expect(readRun(dir, expected, [q], sources)).rejects.toThrow();
    expect(await Bun.file(join(dir, 'q-0.json')).text()).toBe('{');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('join refuses different cache histories or repetition counts', () => {
  const run = {
    identity: 'a',
    system: 'baseline',
    repetitions: 3,
    regime: 'new-process',
    cacheFacts: 'models cold, no prior queries',
    rows: [],
    digests: {},
    missing: [],
  };
  expect(() =>
    requireMatchingProtocol(run, { ...run, system: 'qmd', cacheFacts: 'repeated cache' }),
  ).toThrow('mismatch');
  expect(() => requireMatchingProtocol(run, { ...run, system: 'qmd', repetitions: 1 })).toThrow(
    'mismatch',
  );
  expect(() => requireMatchingProtocol(run, { ...run, system: 'qmd' })).not.toThrow();
});
