import { open, mkdir, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { check, hash, object, serialize } from '@/scripts/retrieval-eval/corpus';

export type Observation = {
  version: 1;
  identity: string;
  unit: string;
  started: string;
  ended: string;
  elapsedMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  usage: null;
  usageReason: string;
  stageTimings: null;
  stageReason: string;
};
export async function publishOnce(path: string, value: unknown) {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  const fd = await open(temporary, 'wx', 0o600);
  try {
    await fd.writeFile(serialize(value));
    await fd.sync();
  } finally {
    await fd.close();
  }
  try {
    await link(temporary, path);
  } finally {
    await unlink(temporary);
  }
}
export function parseObservation(value: unknown, identity: string, unit: string): Observation {
  const r = object(value);
  check(
    r.version === 1 && r.identity === identity && r.unit === unit,
    'Observation identity mismatch',
  );
  check(
    typeof r.started === 'string' &&
      Number.isFinite(Date.parse(r.started)) &&
      typeof r.ended === 'string' &&
      Number.isFinite(Date.parse(r.ended)),
    'Invalid timestamps',
  );
  check(
    typeof r.elapsedMs === 'number' &&
      Number.isFinite(r.elapsedMs) &&
      r.elapsedMs >= 0 &&
      Number.isInteger(r.exitCode) &&
      typeof r.timedOut === 'boolean',
    'Invalid observation status',
  );
  check(
    typeof r.stdout === 'string' &&
      typeof r.stderr === 'string' &&
      r.usage === null &&
      typeof r.usageReason === 'string' &&
      r.stageTimings === null &&
      typeof r.stageReason === 'string',
    'Invalid captured output',
  );
  return value as Observation;
}
export async function capture(
  command: string[],
  cwd: string,
  identity: string,
  unit: string,
  timeoutMs: number,
  env?: Record<string, string | undefined>,
): Promise<Observation> {
  const started = new Date().toISOString(),
    clock = performance.now();
  let timedOut = false;
  const proc = Bun.spawn(command, {
    cwd,
    env,
    detached: true,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      process.kill(-proc.pid, 'SIGKILL');
    } catch {
      proc.kill('SIGKILL');
    }
  }, timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return {
      version: 1,
      identity,
      unit,
      started,
      ended: new Date().toISOString(),
      elapsedMs: performance.now() - clock,
      exitCode,
      stdout,
      stderr,
      timedOut,
      usage: null,
      usageReason: 'Stock CLI does not expose billed usage/retries',
      stageTimings: null,
      stageReason: 'Whole process measured; stock CLI stage timings unavailable',
    };
  } finally {
    clearTimeout(timer);
  }
}
export async function runUnit(
  directory: string,
  inputs: unknown,
  unit: string,
  execute: (identity: string) => Promise<Observation>,
) {
  check(/^[a-zA-Z0-9_-]+$/.test(unit), 'Unsafe run unit');
  const identity = hash(serialize(inputs));
  const root = join(directory, identity);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const manifest = join(root, 'inputs.json');
  if (await Bun.file(manifest).exists())
    check((await Bun.file(manifest).text()) === serialize(inputs), 'Run identity mismatch');
  else await publishOnce(manifest, inputs);
  const path = join(root, `${unit}.json`);
  if (await Bun.file(path).exists())
    return parseObservation(await Bun.file(path).json(), identity, unit);
  // A separate exclusive claim avoids two runners repeating a paid observation.
  const claim = await open(`${path}.claim`, 'wx', 0o600);
  try {
    // Another runner may have completed between the first check and this claim.
    if (await Bun.file(path).exists())
      return parseObservation(await Bun.file(path).json(), identity, unit);
    const result = parseObservation(await execute(identity), identity, unit);
    await publishOnce(path, result);
    return result;
  } finally {
    await claim.close();
    await unlink(`${path}.claim`);
  }
}
