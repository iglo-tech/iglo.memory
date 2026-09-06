import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { chmod, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { hash } from '@/scripts/retrieval-eval/corpus';
import {
  ensureRuntime,
  qmdFingerprint,
  type QmdRuntimeProject,
} from '@/scripts/retrieval-eval/qmd-runtime';

async function fixture(run: (spec: QmdRuntimeProject, directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'iglo-qmd-runtime-'));
  const seed = join(directory, 'seed.sqlite');
  const db = new Database(seed);
  db.exec(`
    CREATE TABLE documents(id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT);
    CREATE TABLE vectors_vec_vector_chunks00(id INTEGER PRIMARY KEY, vectors BLOB);
    CREATE TABLE llm_cache(hash TEXT PRIMARY KEY, result TEXT);
    CREATE VIRTUAL TABLE documents_fts USING fts5(body);
    INSERT INTO documents(body) VALUES ('original');
    INSERT INTO vectors_vec_vector_chunks00 VALUES (1, x'0011ff');
    INSERT INTO llm_cache VALUES ('existing', 'preserved');
    INSERT INTO documents_fts VALUES ('original');
  `);
  db.close();
  try {
    await run(
      {
        seed,
        seedHash: hash(await Bun.file(seed).bytes()),
        runtime: join(directory, 'runtime.sqlite'),
        fingerprint: qmdFingerprint(seed),
      },
      directory,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('runtime retains seed caches and accepts cache changes in nonempty WAL on resume', async () => {
  await fixture(async (spec) => {
    await ensureRuntime(spec);
    const db = new Database(spec.runtime);
    try {
      expect(db.query('SELECT result FROM llm_cache').get()).toEqual({ result: 'preserved' });
      db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; INSERT INTO llm_cache VALUES ('new', 'cached'); DELETE FROM llm_cache WHERE hash='existing';",
      );
      expect(Bun.file(`${spec.runtime}-wal`).size).toBeGreaterThan(0);
      expect(await ensureRuntime(spec)).toBe(spec.runtime);
      expect(db.query('SELECT * FROM llm_cache').all()).toEqual([
        { hash: 'new', result: 'cached' },
      ]);
      db.exec("BEGIN; UPDATE documents SET body='uncommitted';");
      expect(qmdFingerprint(spec.runtime)).toBe(spec.fingerprint);
      db.exec('COMMIT');
      expect(qmdFingerprint(spec.runtime)).not.toBe(spec.fingerprint);
      await expect(ensureRuntime(spec)).rejects.toThrow('runtime fingerprint mismatch');
    } finally {
      db.close();
    }
  });
});

test('changed vector blobs, FTS shadow content, sequence and cache schema are rejected', async () => {
  for (const mutation of [
    "UPDATE vectors_vec_vector_chunks00 SET vectors=x'0011fe'",
    "UPDATE documents_fts SET body='changed'",
    'UPDATE sqlite_sequence SET seq=55',
    'ALTER TABLE llm_cache ADD COLUMN unexpected TEXT',
  ]) {
    await fixture(async (spec) => {
      await ensureRuntime(spec);
      const db = new Database(spec.runtime);
      db.exec(mutation);
      db.close();
      await expect(ensureRuntime(spec)).rejects.toThrow('runtime fingerprint mismatch');
    });
  }
});

test('unknown or corrupt preexisting runtime is never replaced; seed hashes are checked', async () => {
  await fixture(async (spec) => {
    await Bun.write(spec.runtime, 'unrelated state');
    await expect(ensureRuntime(spec)).rejects.toThrow();
    expect(await Bun.file(spec.runtime).text()).toBe('unrelated state');
    await expect(ensureRuntime({ ...spec, seedHash: '0'.repeat(64) })).rejects.toThrow(
      'seed hash mismatch',
    );
    await rm(spec.runtime);
    await symlink(spec.seed, spec.runtime);
    await expect(ensureRuntime(spec)).rejects.toThrow('regular file');
    expect(hash(await Bun.file(spec.seed).bytes())).toBe(spec.seedHash);
  });
});

test('fingerprint preserves SQLite types, large integers, bytes and row order independence', async () => {
  await fixture(async (spec) => {
    await ensureRuntime(spec);
    const db = new Database(spec.runtime);
    try {
      db.exec(
        "CREATE TABLE typed(value); INSERT INTO typed VALUES (9223372036854775807), ('1'), (1), (1.0), (x'00ff'), (NULL)",
      );
      const original = qmdFingerprint(spec.runtime);
      db.exec(
        'CREATE TEMP TABLE saved AS SELECT * FROM typed; DELETE FROM typed; INSERT INTO typed SELECT * FROM saved ORDER BY rowid DESC',
      );
      expect(qmdFingerprint(spec.runtime)).toBe(original);
      db.exec(
        "UPDATE typed SET value=9223372036854775806 WHERE typeof(value)='integer' AND value>1",
      );
      expect(qmdFingerprint(spec.runtime)).not.toBe(original);
    } finally {
      db.close();
    }
  });
});

test('launcher forwards arguments, output and failed exit status without clearing cache', async () => {
  await fixture(async (spec, directory) => {
    const executable = join(directory, 'fake-qmd');
    await Bun.write(
      executable,
      `#!/bin/sh\nprintf '%s\\n' "$@"\nprintf 'runtime=%s\\n' "$INDEX_PATH" >&2\nexit 7\n`,
    );
    await chmod(executable, 0o700);
    const config = join(directory, 'config.json');
    await Bun.write(config, JSON.stringify({ executable, projects: { synthetic: spec } }));
    const child = Bun.spawn(
      [
        process.execPath,
        resolve('scripts/retrieval-eval/qmd-runtime.ts'),
        config,
        'synthetic',
        'literal query',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit).toBe(7);
    expect(stdout).toBe('--index\nsynthetic\nquery\nliteral query\n--json\n--explain\n-n\n8\n');
    expect(stderr).toBe(`runtime=${spec.runtime}\n`);
    expect(qmdFingerprint(spec.runtime)).toBe(spec.fingerprint);
  });
});

test('launcher validates content even after child failure and retains the changed database', async () => {
  await fixture(async (spec, directory) => {
    const executable = join(directory, 'fake-qmd');
    await Bun.write(
      executable,
      `#!${process.execPath}\nimport { Database } from 'bun:sqlite';\nconst db = new Database(process.env.INDEX_PATH);\ndb.exec("UPDATE documents SET body='changed by failed child'");\ndb.close();\nprocess.exit(7);\n`,
    );
    await chmod(executable, 0o700);
    const config = join(directory, 'config.json');
    await Bun.write(config, JSON.stringify({ executable, projects: { synthetic: spec } }));
    const child = Bun.spawn(
      [
        process.execPath,
        resolve('scripts/retrieval-eval/qmd-runtime.ts'),
        config,
        'synthetic',
        'literal query',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [stderr, exit] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    expect(exit).toBe(1);
    expect(stderr).toContain('fingerprint mismatch after query');
    const db = new Database(spec.runtime, { readonly: true });
    expect(db.query('SELECT body FROM documents').get()).toEqual({
      body: 'changed by failed child',
    });
    db.close();
  });
});
