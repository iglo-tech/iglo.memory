import { Database } from 'bun:sqlite';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { check, hash, object } from '@/scripts/retrieval-eval/corpus';

export type QmdRuntimeProject = {
  seed: string;
  seedHash: string;
  runtime: string;
  fingerprint: string;
};

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const digest = (value: unknown) => hash(JSON.stringify(value));

/** Read one SQLite snapshot, including committed WAL pages, without running QMD. */
export function qmdFingerprint(path: string): string {
  const db = new Database(path, { readonly: true, safeIntegers: true });
  try {
    db.exec('BEGIN');
    const schema = db
      .query('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name')
      .all() as { type: string; name: string; tbl_name: string; sql: string | null }[];
    const tables = [];
    for (const row of schema) {
      if (
        row.type !== 'table' ||
        row.name === 'llm_cache' ||
        /^CREATE\s+VIRTUAL\s+TABLE\b/i.test(row.sql ?? '')
      )
        continue;
      const columns = db.query(`PRAGMA table_xinfo(${quote(row.name)})`).all() as {
        name: string;
      }[];
      const expressions = columns.map(({ name }) => {
        const column = quote(name);
        // Hex preserves exact SQLite TEXT bytes, including NUL/invalid UTF-8.
        return `typeof(${column}), CASE WHEN typeof(${column}) IN ('text','blob') THEN hex(CAST(${column} AS BLOB)) ELSE ${column} END`;
      });
      const rows = db
        .query(`SELECT ${expressions.join(',')} FROM ${quote(row.name)}`)
        .values()
        .map((values) =>
          JSON.stringify(
            values.map((value) => {
              if (typeof value === 'bigint') return value.toString();
              if (typeof value === 'number') {
                const bytes = new Uint8Array(8);
                new DataView(bytes.buffer).setFloat64(0, value, false);
                return Buffer.from(bytes).toString('hex');
              }
              return value;
            }),
          ),
        )
        .sort();
      tables.push({ name: row.name, rows: rows.length, hash: digest(rows) });
    }
    db.exec('COMMIT');
    return digest({ version: 1, schema, tables });
  } finally {
    db.close();
  }
}

async function exists(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Publish a seed once; never replace runtime state, including on corruption. */
export async function ensureRuntime(spec: QmdRuntimeProject): Promise<string> {
  for (const path of [spec.seed, spec.runtime])
    check(isAbsolute(path) && resolve(path) === path, 'QMD paths must be canonical absolute paths');
  check(spec.seed !== spec.runtime, 'QMD runtime must differ from seed');
  check(/^[a-f0-9]{64}$/.test(spec.seedHash), 'Invalid QMD seed hash');
  check(/^[a-f0-9]{64}$/.test(spec.fingerprint), 'Invalid QMD fingerprint');
  const seed = await open(spec.seed, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const seedStat = await seed.stat();
    check(seedStat.isFile(), 'QMD seed must be a regular file');
    const bytes = await Bun.file(seed.fd).bytes();
    check(hash(bytes) === spec.seedHash, 'QMD seed hash mismatch');
    const seedWal = await exists(`${spec.seed}-wal`);
    check(!seedWal || seedWal.size === 0, 'QMD seed has nonempty WAL');
    check(qmdFingerprint(spec.seed) === spec.fingerprint, 'QMD seed fingerprint mismatch');
    if (!(await exists(spec.runtime))) {
      check(
        !(await exists(`${spec.runtime}-wal`)) && !(await exists(`${spec.runtime}-shm`)),
        'QMD orphan runtime sidecars',
      );
      await mkdir(dirname(spec.runtime), { recursive: true });
      const temporary = `${spec.runtime}.${crypto.randomUUID()}.tmp`;
      const fd = await open(temporary, 'wx', 0o600);
      try {
        await fd.writeFile(bytes);
        await fd.sync();
      } finally {
        await fd.close();
      }
      try {
        try {
          await link(temporary, spec.runtime);
          const directory = await open(dirname(spec.runtime), constants.O_RDONLY);
          try {
            await directory.sync();
          } finally {
            await directory.close();
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      } finally {
        await unlink(temporary);
      }
    }
    const runtimeStat = await lstat(spec.runtime);
    check(runtimeStat.isFile(), 'QMD runtime must be a regular file');
    check(
      runtimeStat.dev !== seedStat.dev || runtimeStat.ino !== seedStat.ino,
      'QMD runtime aliases seed',
    );
    check(qmdFingerprint(spec.runtime) === spec.fingerprint, 'QMD runtime fingerprint mismatch');
    return spec.runtime;
  } finally {
    await seed.close();
  }
}

async function main() {
  const [configPath, project, query] = Bun.argv.slice(2);
  check(
    Bun.argv.length === 5 && configPath && project && query,
    'Expected config path, project, query',
  );
  const config = object(await Bun.file(configPath).json());
  const projects = object(config.projects);
  check(Object.hasOwn(projects, project), 'Unknown QMD project');
  check(
    typeof config.executable === 'string' && isAbsolute(config.executable),
    'Invalid QMD executable',
  );
  const row = object(projects[project]);
  for (const key of ['seed', 'seedHash', 'runtime', 'fingerprint'])
    check(typeof row[key] === 'string', `Invalid QMD project ${key}`);
  const spec = row as QmdRuntimeProject;
  const runtime = await ensureRuntime(spec);
  let exitCode = 1;
  try {
    const child = Bun.spawn(
      [config.executable, '--index', project, 'query', query, '--json', '--explain', '-n', '8'],
      {
        env: { ...process.env, INDEX_PATH: runtime },
        stdin: 'ignore',
        stdout: 'inherit',
        stderr: 'inherit',
      },
    );
    exitCode = await child.exited;
  } finally {
    check(
      qmdFingerprint(runtime) === spec.fingerprint,
      'QMD runtime fingerprint mismatch after query',
    );
  }
  process.exitCode = exitCode;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`QMD runtime failure: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
