import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cpus, platform, release, totalmem } from 'node:os';
import { chunkSource, sha256 } from '@/src/chunks';
import {
  profileFor,
  vectorBytes,
  vectorName,
  readSnapshot,
  loadVectors,
  type Snapshot,
} from '@/src/store';
import { search, rank } from '@/src/search';
import { budgetFor } from '@/src/token-budget';
import { buildLexical } from '@/src/lexical';
import { resolveWorktree } from '@/src/repository';
import { DEFAULT_MODEL, readConfig } from '@/src/config';

const root = mkdtempSync('/tmp/iglo-benchmark-');
const dimensions = Number(process.argv[2] ?? 4096);
const runs = Number(process.argv[3] ?? 5);
try {
  mkdirSync(join(root, '.git/objects'), { recursive: true });
  mkdirSync(join(root, '.git/refs'));
  await Bun.write(join(root, '.git/HEAD'), 'ref: refs/heads/main\n');
  mkdirSync(join(root, '.agent/memory-index/vectors'), { recursive: true });
  const config = {
    project: 'benchmark',
    embedding: { model: dimensions === 4096 ? DEFAULT_MODEL : 'fixture-model' },
  };
  await Bun.write(join(root, '.agent/memory.json'), JSON.stringify(config));
  const profile = profileFor(config.embedding.model, dimensions);
  const vector = Array.from({ length: dimensions }, (_, i) => Math.fround(((i % 11) - 5) / 6));
  const bytes = vectorBytes(vector);
  const vectorHash = 'sha256:' + sha256(bytes);
  const snapshot: Snapshot = {
    schemaVersion: 2,
    project: config.project,
    preparedAt: new Date().toISOString(),
    profile,
    documents: 10000,
    chunks: [],
    sources: [],
    lexical: buildLexical([]),
  };
  for (let i = 0; i < 10000; i++) {
    const parsed = chunkSource(
      config.project,
      `.agent/knowledge/${i}.md`,
      '# Authentication\nRefresh token rotation keeps sessions safe.',
      config.embedding.model,
    );
    const chunk = parsed.chunks[0]!;
    snapshot.sources.push(parsed.document);
    const name = vectorName(profile, chunk.chunkHash);
    await Bun.write(join(root, '.agent/memory-index/vectors', name), bytes);
    snapshot.chunks.push({ ...chunk, vector: name, vectorHash });
  }
  snapshot.lexical = buildLexical(snapshot.chunks);
  await Bun.write(join(root, '.agent/memory-index/snapshot.json'), JSON.stringify(snapshot));
  const samples: number[] = [];
  const stages: Record<string, number>[] = [];
  for (let i = 0; i < runs; i++) {
    if (process.env.IGLO_BENCH_COLD === '1') {
      const cold = Bun.spawnSync([
        'python3',
        '-c',
        'import os,sys\nfor root,ds,fs in os.walk(sys.argv[1]):\n for f in fs:\n  fd=os.open(os.path.join(root,f),os.O_RDONLY);os.fsync(fd);os.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED);os.close(fd)',
        root,
      ]);
      if (cold.exitCode !== 0) throw new Error('Cache eviction failed');
    }
    const started = performance.now();
    let result: { results: unknown[] };
    if (process.env.IGLO_BENCH_PROFILE === '1') {
      const timings: Record<string, number> = {};
      let at = performance.now();
      const discovered = resolveWorktree(root),
        loaded = readConfig(discovered);
      timings.config = performance.now() - at;
      at = performance.now();
      const snapshot = readSnapshot(discovered, loaded);
      timings.snapshot = performance.now() - at;
      at = performance.now();
      const { vectors, norms } = loadVectors(discovered, snapshot);
      timings.vectors = performance.now() - at;
      at = performance.now();
      budgetFor(loaded.embedding.model).formatQuery('refresh token');
      timings.queryBudget = performance.now() - at;
      at = performance.now();
      result = { results: rank(snapshot, vectors, 'refresh token', vector, norms) };
      timings.rank = performance.now() - at;
      stages.push(timings);
    } else if (process.env.IGLO_BENCH_CLI === '1') {
      const child = Bun.spawnSync([resolve('dist/benchmark-cli'), 'search', 'refresh token'], {
        cwd: root,
        env: {
          ...process.env,
          OPENROUTER_API_KEY: 'dummy-benchmark',
          IGLO_BENCH_DIMENSIONS: String(dimensions),
          PATH: '/nonexistent',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (child.exitCode !== 0) throw new Error('Benchmark CLI failed');
      result = JSON.parse(child.stdout.toString());
    } else {
      const discovered = resolveWorktree(root);
      const loaded = readConfig(discovered);
      result = await search(
        discovered,
        loaded,
        'refresh token',
        async () => [vector],
        () => 'fixture',
        {
          expansion: async () => ({ lex: [], vec: [], hyde: [] }),
          reranking: async (_query, documents) =>
            documents.map((_, index) => ({ index, score: 1 })),
          minimumScore: 0,
        },
      );
    }
    JSON.stringify(result);
    samples.push(performance.now() - started);
    if (result.results.length !== 8) throw new Error('Unexpected results');
  }
  console.log(
    JSON.stringify(
      {
        cpu: cpus()[0]?.model,
        cores: cpus().length,
        ramBytes: totalmem(),
        os: platform() + ' ' + release(),
        bun: Bun.version,
        dimensions,
        model: config.embedding.model,
        chunks: 10000,
        mode: process.env.IGLO_BENCH_COLD === '1' ? 'fadvise-cold' : 'warm',
        samplesMs: samples,
        diagnosticStages: stages,
        maxMs: Math.max(...samples),
        underOneSecond: samples.every((ms) => ms < 1000),
        scope:
          process.env.IGLO_BENCH_PROFILE === '1'
            ? 'diagnostic stage profile; omits index lock and full output preparation, not acceptance timing'
            : process.env.IGLO_BENCH_CLI === '1'
              ? 'compiled production CLI with controlled fetch response; includes process startup, request/response serialization, discovery/config/load/validate/rank/output; remote wait zero'
              : 'local discovery/config/load/validate/rank/serialization; controlled query vector, excludes process startup and actual HTTP transport',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
